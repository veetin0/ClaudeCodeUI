import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { query, type CanUseTool, type Query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { EXEC_TOOLS, type AgentId, type HarnessEvent, type PermissionMode, type SessionStatus } from '@shared/events'
import { toVisual } from '@shared/visuals'
import type { PermissionDecision, SessionSummary, StartSessionOptions } from '@shared/ipc'
import type { EventBus } from '../events/bus'
import { EventNormalizer } from '../events/normalizer'
import type { TelemetryServer } from '../system/telemetry'
import { createHarnessServer, HARNESS_TOOL_GUIDE } from './harnessTools'
import { MessageQueue } from './MessageQueue'
import { PermissionBroker } from './permissions'

/** Starts an SDK query. Injected so tests can run the session against a fake engine. */
export type QueryFactory = typeof query

export interface AgentServiceDeps {
  bus: EventBus
  /** Resolved at session start so a key set in Settings applies to the next session. */
  getEnv: () => Record<string, string | undefined>
  claudeExecutablePath?: string
  queryFactory?: QueryFactory
  telemetry?: TelemetryServer
}

class AgentSession {
  readonly summary: SessionSummary
  private readonly input = new MessageQueue<SDKUserMessage>()
  private readonly normalizer: EventNormalizer
  private readonly permissions: PermissionBroker
  private readonly abort = new AbortController()
  private q: Query | null = null
  private status: SessionStatus = 'starting'
  private stderrTail: string[] = []
  private readonly telemetryToken = randomUUID()
  private telemetryCount = 0
  /** Commands currently running, newest last: live telemetry is credited to the newest one. */
  private runningExec: { toolUseId: string; agentId: AgentId }[] = []

  constructor(
    private readonly deps: AgentServiceDeps,
    opts: StartSessionOptions,
  ) {
    const id = randomUUID()
    this.summary = { id, cwd: opts.cwd, title: basename(opts.cwd), createdAt: Date.now() }
    this.normalizer = new EventNormalizer(id, Date.now, opts.cwd)
    this.permissions = new PermissionBroker((e) => this.emit(e), id)
    this.start(opts)
  }

  get id() {
    return this.summary.id
  }

  private emit(e: HarnessEvent | HarnessEvent[]) {
    const list = Array.isArray(e) ? e : [e]
    for (const ev of list) {
      if (ev.type === 'tool.start' && EXEC_TOOLS.has(ev.name)) this.runningExec.push({ toolUseId: ev.toolUseId, agentId: ev.agentId })
      if (ev.type === 'tool.end') this.runningExec = this.runningExec.filter((r) => r.toolUseId !== ev.toolUseId)
      if (ev.type === 'permission.request') this.setStatus('waiting')
      if (ev.type === 'permission.resolved' && this.status === 'waiting') this.setStatus('running')
    }
    this.deps.bus.emit(list)
  }

  private setStatus(status: SessionStatus) {
    if (this.status === status) return
    this.status = status
    this.deps.bus.emit({ type: 'status', status, sessionId: this.id, ts: Date.now() })
  }

  private start(opts: StartSessionOptions) {
    const canUseTool: CanUseTool = (toolName, input, o) => this.permissions.request(toolName, input, o)
    const factory = this.deps.queryFactory ?? query
    const harnessUrl = this.deps.telemetry?.register(this.telemetryToken, (p) => this.onTelemetry(p))

    this.q = factory({
      prompt: this.input,
      options: {
        cwd: opts.cwd,
        model: opts.model || undefined,
        permissionMode: opts.permissionMode ?? 'default',
        systemPrompt: { type: 'preset', preset: 'claude_code', append: HARNESS_TOOL_GUIDE },
        mcpServers: { harness: createHarnessServer() },
        allowedTools: ['mcp__harness'],
        // Same CLAUDE.md, settings, MCP servers and skills as the terminal CLI.
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
        // Full subagent transcripts plus periodic "what it's doing now" summaries for the agent views.
        forwardSubagentText: true,
        agentProgressSummaries: true,
        canUseTool,
        abortController: this.abort,
        env: harnessUrl ? { ...this.deps.getEnv(), HARNESS_URL: harnessUrl } : this.deps.getEnv(),
        pathToClaudeCodeExecutable: this.deps.claudeExecutablePath,
        stderr: (data) => {
          this.stderrTail.push(data)
          if (this.stderrTail.length > 20) this.stderrTail.shift()
        },
      },
    })

    this.setStatus('idle')
    void this.pump()
  }

  private async pump() {
    try {
      for await (const msg of this.q!) {
        const events = this.normalizer.normalize(msg)
        this.emit(events)
        for (const e of events) {
          if (e.type === 'turn.end') this.setStatus('idle')
          else if (e.type === 'compact' && this.status === 'compacting') this.setStatus('running')
        }
      }
    } catch (err) {
      if (!this.abort.signal.aborted) {
        const detail = this.stderrTail.join('').trim()
        const message = err instanceof Error ? err.message : String(err)
        this.emit({ type: 'error', message: detail ? `${message}\n${detail}` : message, sessionId: this.id, ts: Date.now() })
      }
    } finally {
      this.permissions.cancelAll()
      this.setStatus('closed')
    }
  }

  /** A script posted to $HARNESS_URL. Credit it to the command most likely running that script. */
  private onTelemetry(payload: Record<string, unknown>) {
    const kind = String(payload.kind ?? payload.type ?? '')
    const update = toVisual(kind, payload, `telemetry-${++this.telemetryCount}`, this.summary.cwd)
    if (!update) return
    const owner = this.runningExec.at(-1)
    this.emit({
      type: 'visual',
      sessionId: this.id,
      ts: Date.now(),
      agentId: owner?.agentId ?? null,
      toolUseId: owner?.toolUseId,
      source: 'telemetry',
      update,
    })
  }

  send(text: string) {
    if (this.status === 'closed') throw new Error('Session is closed')
    const id = randomUUID()
    this.emit({ type: 'user.message', id, text, sessionId: this.id, ts: Date.now() })
    this.setStatus('running')
    this.input.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      uuid: id,
    })
  }

  async interrupt() {
    this.permissions.cancelAll('Interrupted by user')
    await this.q?.interrupt()
  }

  async setPermissionMode(mode: PermissionMode) {
    await this.q?.setPermissionMode(mode)
  }

  async setModel(model: string) {
    await this.q?.setModel(model)
  }

  respondPermission(requestId: string, decision: PermissionDecision) {
    this.permissions.resolve(requestId, decision)
  }

  close() {
    this.deps.telemetry?.unregister(this.telemetryToken)
    this.input.close()
    this.abort.abort()
  }
}

export class AgentService {
  private sessions = new Map<string, AgentSession>()

  constructor(private readonly deps: AgentServiceDeps) {}

  start(opts: StartSessionOptions): SessionSummary {
    const s = new AgentSession(this.deps, opts)
    this.sessions.set(s.id, s)
    return s.summary
  }

  private get(id: string): AgentSession {
    const s = this.sessions.get(id)
    if (!s) throw new Error(`Unknown session ${id}`)
    return s
  }

  send(id: string, text: string) {
    this.get(id).send(text)
  }

  interrupt(id: string) {
    return this.get(id).interrupt()
  }

  setPermissionMode(id: string, mode: PermissionMode) {
    return this.get(id).setPermissionMode(mode)
  }

  setModel(id: string, model: string) {
    return this.get(id).setModel(model)
  }

  respondPermission(id: string, requestId: string, decision: PermissionDecision) {
    this.get(id).respondPermission(requestId, decision)
  }

  close(id: string) {
    this.sessions.get(id)?.close()
    this.sessions.delete(id)
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }
}
