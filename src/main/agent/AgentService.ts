import { randomUUID } from 'node:crypto'
import { statSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { query, type CanUseTool, type Query, type SDKRateLimitInfo, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { EXEC_TOOLS, type AgentId, type HarnessEvent, type PermissionMode, type SessionStatus, type TodoItem } from '@shared/events'
import { toVisual } from '@shared/visuals'
import { normPath } from '@shared/paths'
import type { PermissionDecision, SessionSummary, StartSessionOptions } from '@shared/ipc'
import type { EventBus } from '../events/bus'
import { EventNormalizer } from '../events/normalizer'
import { ChangeTracker, type SnapshotStore } from '../project/ChangeTracker'
import { listFiles, watchProject } from '../project/projectFiles'
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
  /** Enables change tracking (snapshots, diffs, revert) and the project watcher. */
  snapshots?: SnapshotStore
  /** Extra system-prompt text for a session in this folder (e.g. HackForge mode). */
  promptAppend?: (cwd: string) => string | undefined
  /** Plan rate-limit updates (claude.ai subscriptions) as the CLI reports them. */
  onRateLimit?: (info: SDKRateLimitInfo) => void
}

/** Plan usage windows, as reported by the CLI's usage call (null fields when unknown). */
export interface PlanUsageReading {
  subscription: string | null
  available: boolean
  fiveHour?: { utilization: number | null; resetsAt: string | null } | null
  sevenDay?: { utilization: number | null; resetsAt: string | null } | null
}

/** Tools that write files; the PreToolUse hook snapshots their target first. */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const editTarget = (input: Record<string, unknown>) =>
  typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : null

/** What's needed to continue a saved session in a new agent process. */
export interface ResumeInfo {
  summary: SessionSummary
  claudeSessionId: string
  todos: TodoItem[]
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
  /** Set once closed; a replacement session may reuse this id, so nothing more may be emitted. */
  private disposed = false
  readonly tracker: ChangeTracker | null = null
  /** Claude Code's own session id (known up front when resuming, else from the init message). */
  claudeSessionId: string | null = null
  private watcher: FSWatcher | null = null
  private knownFiles = new Set<string>()

  constructor(
    private readonly deps: AgentServiceDeps,
    opts: StartSessionOptions,
    resume?: ResumeInfo,
  ) {
    const now = Date.now()
    this.summary = resume
      ? { ...resume.summary, updatedAt: now }
      : { id: randomUUID(), cwd: opts.cwd, title: '', createdAt: now, updatedAt: now, costUsd: 0 }
    const id = this.summary.id
    this.normalizer = new EventNormalizer(id, Date.now, this.summary.cwd)
    this.permissions = new PermissionBroker((e) => this.emit(e), id)
    if (deps.snapshots) {
      this.tracker = new ChangeTracker(id, this.summary.cwd, deps.snapshots, (e) => this.emit(e))
      this.startWatching()
    }
    if (resume) {
      this.claudeSessionId = resume.claudeSessionId
      this.normalizer.seedTasks(resume.todos)
      this.deps.bus.emit({ type: 'session.resumed', claudeSessionId: resume.claudeSessionId, sessionId: id, ts: now })
    }
    this.start({ ...opts, cwd: this.summary.cwd }, resume?.claudeSessionId)
  }

  get id() {
    return this.summary.id
  }

  get isRunning() {
    return this.status !== 'closed'
  }

  private emit(e: HarnessEvent | HarnessEvent[]) {
    if (this.disposed) return
    const list = Array.isArray(e) ? e : [e]
    for (const ev of list) {
      if (ev.type === 'session.init') this.claudeSessionId = ev.claudeSessionId
      if (ev.type === 'tool.start' && EXEC_TOOLS.has(ev.name)) this.runningExec.push({ toolUseId: ev.toolUseId, agentId: ev.agentId })
      if (ev.type === 'tool.end') {
        this.runningExec = this.runningExec.filter((r) => r.toolUseId !== ev.toolUseId)
        this.tracker?.touched()
      }
      if (ev.type === 'permission.request') this.setStatus('waiting')
      if (ev.type === 'permission.resolved' && this.status === 'waiting') this.setStatus('running')
    }
    this.deps.bus.emit(list)
  }

  private setStatus(status: SessionStatus) {
    if (this.disposed || this.status === status) return
    this.status = status
    this.deps.bus.emit({ type: 'status', status, sessionId: this.id, ts: Date.now() })
  }

  private start(opts: StartSessionOptions, resumeClaudeSessionId?: string) {
    const canUseTool: CanUseTool = (toolName, input, o) => this.permissions.request(toolName, input, o)
    const factory = this.deps.queryFactory ?? query
    const harnessUrl = this.deps.telemetry?.register(this.telemetryToken, (p) => this.onTelemetry(p))

    this.q = factory({
      prompt: this.input,
      options: {
        cwd: opts.cwd,
        resume: resumeClaudeSessionId,
        model: opts.model || undefined,
        permissionMode: opts.permissionMode ?? 'default',
        systemPrompt: { type: 'preset', preset: 'claude_code', append: [HARNESS_TOOL_GUIDE, this.deps.promptAppend?.(opts.cwd)].filter(Boolean).join('\n\n') },
        mcpServers: { harness: createHarnessServer() },
        allowedTools: ['mcp__harness'],
        // Same CLAUDE.md, settings, MCP servers and skills as the terminal CLI.
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
        // Full subagent transcripts plus periodic "what it's doing now" summaries for the agent views.
        forwardSubagentText: true,
        agentProgressSummaries: true,
        canUseTool,
        hooks: this.tracker
          ? {
              PreToolUse: [
                {
                  matcher: [...EDIT_TOOLS].join('|'),
                  hooks: [
                    async (input) => {
                      const target = 'tool_input' in input ? editTarget((input.tool_input ?? {}) as Record<string, unknown>) : null
                      if (target) await this.tracker?.beforeEdit(target)
                      return {}
                    },
                  ],
                },
              ],
            }
          : undefined,
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
        if (msg.type === 'rate_limit_event') this.deps.onRateLimit?.(msg.rate_limit_info)
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

  /** Plan usage via the CLI's (experimental) usage call; undefined when unsupported or failing. */
  async planUsage(): Promise<PlanUsageReading | undefined> {
    const q = this.q as (Query & { usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET?: (o: { skipBehaviors: boolean }) => Promise<unknown> }) | null
    const fn = q?.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET
    if (!this.isRunning || typeof fn !== 'function') return undefined
    try {
      const r = (await fn.call(q, { skipBehaviors: true })) as {
        subscription_type?: string | null
        rate_limits_available?: boolean
        rate_limits?: { five_hour?: { utilization: number | null; resets_at: string | null } | null; seven_day?: { utilization: number | null; resets_at: string | null } | null } | null
      }
      const w = (x?: { utilization: number | null; resets_at: string | null } | null) => (x ? { utilization: x.utilization, resetsAt: x.resets_at } : x)
      return {
        subscription: r.subscription_type ?? null,
        available: r.rate_limits_available === true,
        fiveHour: w(r.rate_limits?.five_hour),
        sevenDay: w(r.rate_limits?.seven_day),
      }
    } catch {
      return undefined
    }
  }

  private startWatching() {
    const cwd = this.summary.cwd
    void listFiles(cwd).then((files) => files.forEach((f) => this.knownFiles.add(join(cwd, f))))
    this.watcher = watchProject(cwd, (rel) => {
      const path = join(cwd, rel)
      let exists = false
      try {
        // Folders appear as their files do; only report files.
        if (statSync(path).isDirectory()) return
        exists = true
      } catch {
        // gone: a deletion (or a temp file that came and went)
      }
      if (!exists && !this.knownFiles.has(path)) return
      const change = !exists ? 'deleted' : this.knownFiles.has(path) ? 'modified' : 'created'
      if (exists) this.knownFiles.add(path)
      else this.knownFiles.delete(path)
      this.emit({ type: 'file.change', path: normPath(path), change, sessionId: this.id, ts: Date.now() })
      void this.tracker?.onDiskChange(normPath(path), change)
    })
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
    if (this.disposed) return
    this.deps.telemetry?.unregister(this.telemetryToken)
    this.permissions.cancelAll()
    this.setStatus('closed')
    this.disposed = true
    this.watcher?.close()
    this.tracker?.dispose()
    this.input.close()
    this.abort.abort()
  }
}

export class AgentService {
  private sessions = new Map<string, AgentSession>()

  constructor(private readonly deps: AgentServiceDeps) {}

  start(opts: StartSessionOptions, resume?: ResumeInfo): SessionSummary {
    if (resume) this.close(resume.summary.id)
    const s = new AgentSession(this.deps, opts, resume)
    this.sessions.set(s.id, s)
    return s.summary
  }

  /** Whether a running Harness session is driving this Claude session (so observe mode skips it). */
  ownsClaudeSession(claudeSessionId: string): boolean {
    return [...this.sessions.values()].some((s) => s.isRunning && s.claudeSessionId === claudeSessionId)
  }

  tracker(id: string): ChangeTracker | null {
    return this.sessions.get(id)?.tracker ?? null
  }

  /** Plan usage from any running session (they share the same login). */
  async planUsage(): Promise<PlanUsageReading | undefined> {
    for (const s of this.sessions.values()) {
      const r = await s.planUsage()
      if (r) return r
    }
    return undefined
  }

  /** True while the session's agent process is up (false after it exits or crashes). */
  isLive(id: string): boolean {
    return this.sessions.get(id)?.isRunning ?? false
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
