import { watch, type FSWatcher } from 'node:fs'
import { mkdir, open, readdir, readFile, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent, SessionStatus } from '@shared/events'
import type { SessionSummary } from '@shared/ipc'
import { EventNormalizer } from '../events/normalizer'

/** Sessions whose transcript changed this recently are picked up when the app starts. */
const ACTIVE_WINDOW_MS = 2 * 60_000

/** Apps built on the Agent SDK (Harness included). `claude -p` ('sdk-cli') still counts as a terminal session. */
const SDK_ENTRYPOINTS = new Set(['sdk-ts', 'sdk-py'])

type Entry = Record<string, unknown> & { type?: string; timestamp?: string }

export interface ObserverDeps {
  emit: (e: HarnessEvent | HarnessEvent[]) => void
  /** Registers the session in the store so it lands in History. */
  open: (summary: SessionSummary) => void
  /** True for Claude sessions Harness itself is running (never observe those). */
  isOwned: (claudeSessionId: string) => boolean
  projectsDir: string
}

/** Where a transcript file sits in ~/.claude/projects. */
export function classifyTranscript(rel: string): { kind: 'main'; sessionId: string } | { kind: 'sub'; sessionId: string; agentId: string } | null {
  const parts = rel.split(sep)
  if (parts.length === 2 && parts[1].endsWith('.jsonl')) return { kind: 'main', sessionId: parts[1].slice(0, -6) }
  const m = /^agent-(.+)\.jsonl$/.exec(parts[3] ?? '')
  if (parts.length === 4 && parts[2] === 'subagents' && m) return { kind: 'sub', sessionId: parts[1], agentId: m[1] }
  return null
}

const textOf = (content: unknown): string | null => {
  if (typeof content === 'string') return content
  if (Array.isArray(content) && content.every((b) => b?.type === 'text')) return content.map((b) => b.text).join('\n')
  return null
}

/** `<task-notification>` pseudo-prompts announce that a background subagent ended. */
export function parseTaskNotification(text: string): { toolUseId: string; status: 'completed' | 'failed' | 'stopped'; summary: string } | null {
  if (!text.trimStart().startsWith('<task-notification>')) return null
  const tag = (name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)?.[1]?.trim()
  const toolUseId = tag('tool-use-id')
  const status = tag('status')
  if (!toolUseId || (status !== 'completed' && status !== 'failed' && status !== 'stopped')) return null
  return { toolUseId, status, summary: tag('summary') ?? '' }
}

/**
 * One Claude Code session running outside Harness, rebuilt from its transcript files.
 * Transcript entries have the same message shapes as the SDK stream, so they go through the
 * same normalizer; subagent transcripts are attributed via their .meta.json toolUseId.
 */
export class ObservedSession {
  readonly id: string
  private normalizer: EventNormalizer
  private clock = Date.now()
  private status: SessionStatus = 'idle'
  private turnStartedAt = 0
  private offsets = new Map<string, number>()
  private partial = new Map<string, string>()
  private agentCalls = new Set<string>()
  private subToolUse = new Map<string, string>()
  private pendingSub = new Map<string, Entry[]>()
  private queue: Promise<void> = Promise.resolve()
  private started = false
  ignored = false

  constructor(
    readonly claudeSessionId: string,
    private readonly projectDir: string,
    private readonly deps: ObserverDeps,
  ) {
    this.id = `obs-${claudeSessionId}`
    this.normalizer = new EventNormalizer(this.id, () => this.clock, '/')
  }

  get mainFile() {
    return join(this.projectDir, `${this.claudeSessionId}.jsonl`)
  }

  /** Reads whatever was appended to a transcript file since last time. Calls are serialized. */
  ingest(file: string, sub?: string): Promise<void> {
    this.queue = this.queue.then(() => this.read(file, sub)).catch(() => {})
    return this.queue
  }

  /** Status from Claude Code hooks (optional; more immediate than the transcript). */
  hookStatus(status: SessionStatus) {
    if (this.started) this.setStatus(status, Date.now())
  }

  private async read(file: string, sub?: string) {
    if (this.ignored) return
    const from = this.offsets.get(file) ?? 0
    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      return
    }
    if (size <= from) return
    const fh = await open(file, 'r')
    const buf = Buffer.alloc(size - from)
    await fh.read(buf, 0, buf.length, from)
    await fh.close()
    this.offsets.set(file, size)

    const text = (this.partial.get(file) ?? '') + buf.toString('utf8')
    const lines = text.split('\n')
    this.partial.set(file, lines.pop() ?? '')
    const entries = lines.filter(Boolean).flatMap((l) => {
      try {
        return [JSON.parse(l) as Entry]
      } catch {
        return []
      }
    })
    if (sub) await this.subEntries(sub, entries)
    else this.mainEntries(entries)
  }

  private start(first: Entry) {
    // Sessions run through the SDK (Harness itself, other apps) aren't terminal sessions.
    if (SDK_ENTRYPOINTS.has(String(first.entrypoint ?? '')) || this.deps.isOwned(this.claudeSessionId)) {
      this.ignored = true
      return
    }
    const cwd = String(first.cwd ?? '/')
    this.normalizer = new EventNormalizer(this.id, () => this.clock, cwd)
    const ts = Date.parse(String(first.timestamp ?? '')) || Date.now()
    const summary: SessionSummary = { id: this.id, cwd, title: '', createdAt: ts, updatedAt: ts, costUsd: 0, claudeSessionId: this.claudeSessionId, observed: true }
    this.deps.open(summary)
    this.deps.emit({ type: 'session.observed', summary, sessionId: this.id, ts })
    this.started = true
  }

  private mainEntries(entries: Entry[]) {
    const out: HarnessEvent[] = []
    for (const e of entries) {
      if (!this.started && !this.ignored && e.cwd) this.start(e)
      if (!this.started) continue
      this.clock = Date.parse(String(e.timestamp ?? '')) || this.clock
      const msg = e.message as { content?: unknown; stop_reason?: string | null } | undefined

      if (e.type === 'user' && !e.isSidechain && !e.isMeta) {
        const text = textOf(msg?.content)
        // A background subagent finished: the CLI tells the main agent with a tagged pseudo-prompt.
        const done = text ? parseTaskNotification(text) : null
        if (done) {
          out.push({ type: 'subagent.end', taskId: done.toolUseId, toolUseId: done.toolUseId, status: done.status, summary: done.summary, sessionId: this.id, ts: this.clock })
          continue
        }
        // Command echoes and notifications arrive as <tagged> pseudo-prompts; real prompts don't.
        if (text !== null && !text.trimStart().startsWith('<')) {
          out.push({ type: 'user.message', id: String(e.uuid ?? this.clock), text, sessionId: this.id, ts: this.clock })
          this.turnStartedAt = this.clock
          out.push(...this.statusEvent('running'))
          continue
        }
      }
      if (e.type === 'cost-state' && typeof e.totalCostUSD === 'number') {
        out.push({ type: 'cost', totalCostUsd: e.totalCostUSD, sessionId: this.id, ts: this.clock })
        continue
      }
      if (e.type !== 'assistant' && e.type !== 'user') continue

      const events = this.normalizer.normalize(this.asSdk(e, null))
      for (const ev of events) if (ev.type === 'tool.start' && (ev.name === 'Agent' || ev.name === 'Task')) this.agentCalls.add(ev.toolUseId)
      out.push(...events)

      // A final text answer (no tool calls) ends the turn.
      const content = Array.isArray(msg?.content) ? (msg.content as { type: string }[]) : []
      if (e.type === 'assistant' && msg?.stop_reason === 'end_turn' && !content.some((b) => b.type === 'tool_use')) {
        out.push({
          type: 'turn.end',
          isError: false,
          result: '',
          costUsd: 0,
          durationMs: this.turnStartedAt ? this.clock - this.turnStartedAt : 0,
          numTurns: 1,
          outputTokens: 0,
          sessionId: this.id,
          ts: this.clock,
        })
        out.push(...this.statusEvent('idle'))
      }
    }
    this.deps.emit(out)
    // Subagent lines that arrived before their Agent call was seen can go now.
    for (const [agentId, pending] of this.pendingSub) {
      const toolUseId = this.subToolUse.get(agentId)
      if (toolUseId && this.agentCalls.has(toolUseId)) {
        this.pendingSub.delete(agentId)
        this.emitSub(toolUseId, pending)
      }
    }
  }

  private async subEntries(agentId: string, entries: Entry[]) {
    if (!this.started) return
    let toolUseId = this.subToolUse.get(agentId)
    if (!toolUseId) {
      try {
        const meta = JSON.parse(await readFile(join(this.projectDir, this.claudeSessionId, 'subagents', `agent-${agentId}.meta.json`), 'utf8'))
        if (typeof meta.toolUseId === 'string') this.subToolUse.set(agentId, (toolUseId = meta.toolUseId))
      } catch {
        // meta not written yet
      }
    }
    if (!toolUseId || !this.agentCalls.has(toolUseId)) {
      this.pendingSub.set(agentId, [...(this.pendingSub.get(agentId) ?? []), ...entries])
      return
    }
    this.emitSub(toolUseId, entries)
  }

  private emitSub(toolUseId: string, entries: Entry[]) {
    const out: HarnessEvent[] = []
    for (const e of entries) {
      if (e.type !== 'assistant' && e.type !== 'user') continue
      this.clock = Date.parse(String(e.timestamp ?? '')) || this.clock
      const msg = e.message as { content?: unknown; stop_reason?: string | null }
      if (e.type === 'user' && textOf(msg.content) !== null) continue // the subagent's own prompt
      out.push(...this.normalizer.normalize(this.asSdk(e, toolUseId)))
      const content = Array.isArray(msg.content) ? (msg.content as { type: string; text?: string }[]) : []
      if (e.type === 'assistant' && msg.stop_reason === 'end_turn' && !content.some((b) => b.type === 'tool_use')) {
        const summary = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
        out.push({ type: 'subagent.end', taskId: toolUseId, toolUseId, status: 'completed', summary, sessionId: this.id, ts: this.clock })
      }
    }
    this.deps.emit(out)
  }

  private asSdk(e: Entry, parent: string | null): SDKMessage {
    return { type: e.type, uuid: e.uuid, message: e.message, parent_tool_use_id: parent, tool_use_result: e.toolUseResult, session_id: this.claudeSessionId } as unknown as SDKMessage
  }

  private statusEvent(status: SessionStatus): HarnessEvent[] {
    if (this.status === status) return []
    this.status = status
    return [{ type: 'status', status, sessionId: this.id, ts: this.clock }]
  }

  private setStatus(status: SessionStatus, ts: number) {
    if (this.status === status) return
    this.status = status
    this.deps.emit({ type: 'status', status, sessionId: this.id, ts })
  }
}

/**
 * Watches ~/.claude/projects and turns every Claude Code session running outside Harness into a
 * live, observable Harness session. No setup needed; hooks (HookBridge) only add faster status.
 */
export class TranscriptObserver {
  private sessions = new Map<string, ObservedSession>()
  private watcher: FSWatcher | null = null
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(private readonly deps: ObserverDeps) {}

  get count() {
    return [...this.sessions.values()].filter((s) => !s.ignored).length
  }

  async start() {
    if (this.watcher) return
    // Claude Code creates this on first use; create it now so the very first session is caught.
    await mkdir(this.deps.projectsDir, { recursive: true }).catch(() => {})
    try {
      this.watcher = watch(this.deps.projectsDir, { recursive: true }, (_e, file) => file && this.onChange(file.toString()))
      this.watcher.on('error', () => this.stop())
    } catch {
      return // unreadable; observe mode stays off
    }
    // Sessions already running when the app started.
    const now = Date.now()
    for (const proj of await readdir(this.deps.projectsDir).catch(() => [])) {
      for (const f of await readdir(join(this.deps.projectsDir, proj)).catch(() => [])) {
        if (!f.endsWith('.jsonl')) continue
        const st = await stat(join(this.deps.projectsDir, proj, f)).catch(() => null)
        if (st && now - st.mtimeMs < ACTIVE_WINDOW_MS) this.onChange(join(proj, f))
      }
    }
  }

  stop() {
    this.watcher?.close()
    this.watcher = null
  }

  /** Hook input from HookBridge. */
  onHook(input: Record<string, unknown>) {
    const sid = String(input.session_id ?? '')
    const transcript = String(input.transcript_path ?? '')
    if (!sid) return
    let s = this.sessions.get(sid)
    if (!s && transcript.endsWith('.jsonl') && transcript.startsWith(this.deps.projectsDir)) {
      this.onChange(transcript.slice(this.deps.projectsDir.length + 1))
      s = this.sessions.get(sid)
    }
    if (!s) return
    switch (input.hook_event_name) {
      case 'UserPromptSubmit':
        s.hookStatus('running')
        break
      case 'Notification':
        if (String(input.notification_type ?? input.message ?? '').toLowerCase().includes('permission')) s.hookStatus('waiting')
        break
      case 'Stop':
        s.hookStatus('idle')
        break
      case 'SessionEnd':
        s.hookStatus('closed')
        break
    }
  }

  private onChange(rel: string) {
    const where = classifyTranscript(rel)
    if (!where) return
    clearTimeout(this.timers.get(rel))
    this.timers.set(
      rel,
      setTimeout(() => {
        this.timers.delete(rel)
        const projectDir = join(this.deps.projectsDir, rel.split(sep)[0])
        let s = this.sessions.get(where.sessionId)
        if (!s) {
          if (this.deps.isOwned(where.sessionId)) return
          s = new ObservedSession(where.sessionId, projectDir, this.deps)
          this.sessions.set(where.sessionId, s)
          // Always replay the main transcript first so subagents attach to their Agent calls.
          if (where.kind === 'sub') void s.ingest(s.mainFile)
        }
        const file = join(this.deps.projectsDir, rel)
        void s.ingest(file, where.kind === 'sub' ? where.agentId : undefined)
      }, 60),
    )
  }
}
