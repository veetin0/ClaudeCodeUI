import { normPath } from '@shared/paths'
import type { AgentId, EventOf, FileChange, HarnessEvent, PermissionMode, SessionStatus, TodoItem } from '@shared/events'
import { HARNESS_TOOL_PREFIX, SUBAGENT_TOOLS } from '@shared/events'
import type { ShowUpdate, VisualSource } from '@shared/visuals'
import type { SessionSummary } from '@shared/ipc'
import { approxTokens, type SaverTier, type TurnKind } from '@shared/usageSaver'
import { baseName } from '@shared/paths'

export interface ToolCall {
  id: string
  name: string
  input: Record<string, unknown>
  agentId: AgentId
  status: 'running' | 'done' | 'error'
  output?: string
  startedAt: number
  endedAt?: number
  elapsedSeconds?: number
}

export interface Subagent {
  /** tool_use id of the Task/Agent call; also the agentId its own messages carry. */
  id: string
  description: string
  subagentType?: string
  status: 'running' | 'completed' | 'failed' | 'stopped'
  /** Runs on after the spawning turn ends; finishes via a task notification. */
  background: boolean
  toolIds: string[]
  lastText?: string
  /** Live "what it's doing now" line from task_progress. */
  progress?: string
  summary?: string
  totalTokens?: number
  startedAt: number
  endedAt?: number
}

export type Item =
  | { kind: 'user'; id: string; text: string; ts: number }
  | { kind: 'text'; id: string; text: string }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'tool'; id: string }
  | { kind: 'turn'; id: string; costUsd: number; durationMs: number; isError: boolean; result: string }
  | { kind: 'compact'; id: string; preTokens: number; postTokens?: number; trigger: 'manual' | 'auto' }
  | { kind: 'error'; id: string; message: string }
  /** The Usage saver switched models, compacted, skipped a file… `saving` (green), `power` (Opus) or `info`. */
  | { kind: 'saver'; id: string; tone: 'saving' | 'power' | 'info'; text: string }
  | { kind: 'notice'; id: string; tone: 'info' | 'warn'; text: string; source: 'team' | 'harness' }

/** What the Usage saver is doing in this session (from its `saver` events). */
export interface SaverView {
  enabled: boolean
  /** Picks the model per turn; false when a model was picked by hand. */
  auto: boolean
  compact: boolean
  skipGenerated: boolean
  leanOutput: boolean
  /** The model on the latest turn, and why. */
  tier?: SaverTier
  turn?: TurnKind
  text?: string
  held?: boolean
  stats: { sonnetTurns: number; opusTurns: number; takeovers: number; compactions: number; compactedTokens: number; skipped: number; skippedTokens: number }
}

export interface ProgressState {
  label: string
  current: number
  total: number
  unit?: string
  source: VisualSource
  startedAt: number
  updatedAt: number
}

export interface MetricSeries {
  points: { step: number; value: number }[]
  /** Reported via harness tools or $HARNESS_URL; parsed-from-output points are then ignored as duplicates. */
  structured: boolean
}

export interface AgentVisuals {
  status?: string
  progress: Record<string, ProgressState>
  metrics: Record<string, MetricSeries>
  shows: (ShowUpdate & { ts: number })[]
}

/** Key into `visuals`: 'main' for the main agent, else the subagent's id. */
export const agentKey = (agentId: AgentId) => agentId ?? 'main'

const MAX_METRIC_POINTS = 1000

/** Harness tools that only feed the agent cards; kept out of the chat transcript. */
const QUIET_HARNESS_TOOLS = new Set(['progress', 'metric', 'status'].map((t) => HARNESS_TOOL_PREFIX + t))

/** What happened to one file during the session; drives the heat tree. */
export interface FileActivity {
  reads: number
  writes: number
  /** Changes on disk not made by an edit tool (scripts, formatters, you). */
  diskChanges: number
  lastTs: number
  lastKind: 'read' | 'write' | 'disk'
  /** agentKeys that touched it. */
  agents: string[]
}

const READ_TOOLS = new Set(['Read', 'NotebookRead'])
const WRITE_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

export type PermissionRequest = Omit<EventOf<'permission.request'>, 'type' | 'sessionId'>

export interface SessionState {
  id: string
  cwd: string
  title: string
  createdAt: number
  /** False for a saved session opened from history whose agent isn't running. */
  live: boolean
  /** Watched from a terminal session; Harness can show it but not send to it while it runs. */
  observed: boolean
  status: SessionStatus
  model?: string
  permissionMode: PermissionMode
  slashCommands: string[]
  claudeCodeVersion?: string
  items: Item[]
  streamingText: string
  streamingThinking: string
  tools: Record<string, ToolCall>
  subagents: Record<string, Subagent>
  todos: TodoItem[]
  visuals: Record<string, AgentVisuals>
  files: Record<string, FileActivity>
  changes: FileChange[]
  permissions: PermissionRequest[]
  contextTokens: number
  contextWindow: number
  totalCostUsd: number
  /** Session cost accrued before the current agent process (total_cost_usd restarts on resume). */
  costOffset: number
  outputTokens: number
  turnStartedAt?: number
  /** Absent for sessions from before the Usage saver, and for terminal sessions. */
  saver?: SaverView
}

const DEFAULT_CONTEXT_WINDOW = 200_000

export function createSession(s: SessionSummary, permissionMode: PermissionMode = 'default', live = true): SessionState {
  return {
    id: s.id,
    cwd: s.cwd,
    title: s.title,
    createdAt: s.createdAt,
    model: s.model,
    live,
    observed: !!s.observed,
    status: 'starting',
    permissionMode,
    slashCommands: [],
    items: [],
    streamingText: '',
    streamingThinking: '',
    tools: {},
    subagents: {},
    todos: [],
    visuals: {},
    files: {},
    changes: [],
    permissions: [],
    contextTokens: 0,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    totalCostUsd: 0,
    costOffset: 0,
    outputTokens: 0,
  }
}

/** Applies one event to a session draft. Written for immer: mutate `s` freely. */
export function applyEvent(s: SessionState, e: HarnessEvent): void {
  switch (e.type) {
    case 'session.init':
      s.model = e.model
      s.permissionMode = e.permissionMode
      s.slashCommands = e.slashCommands
      s.claudeCodeVersion = e.claudeCodeVersion
      break

    case 'cost':
      s.totalCostUsd = Math.max(s.totalCostUsd, e.totalCostUsd)
      break

    case 'session.resumed':
      s.live = true
      s.observed = false
      s.costOffset = s.totalCostUsd
      break

    case 'status':
      s.status = e.status
      if (e.status === 'running' && s.turnStartedAt === undefined) s.turnStartedAt = e.ts
      if (e.status === 'closed') {
        s.live = false
        // The agent process is gone (closed or crashed mid-turn): nothing it started is still running,
        // background subagents included.
        for (const t of Object.values(s.tools)) if (t.status === 'running') t.status = 'error'
        for (const sub of Object.values(s.subagents)) if (sub.status === 'running') sub.status = 'stopped'
      }
      if (e.status === 'idle' || e.status === 'closed') {
        s.turnStartedAt = undefined
        s.streamingText = ''
        s.streamingThinking = ''
      }
      break

    case 'user.message':
      if (!s.title) s.title = e.text.replace(/\s+/g, ' ').trim().slice(0, 80)
      s.items.push({ kind: 'user', id: e.id, text: e.text, ts: e.ts })
      break

    case 'text.delta':
      if (e.agentId === null) s.streamingText += e.text
      break

    case 'thinking.delta':
      if (e.agentId === null) s.streamingThinking += e.text
      break

    case 'assistant.text':
      if (e.agentId === null) {
        s.items.push({ kind: 'text', id: e.id, text: e.text })
        s.streamingText = ''
      } else if (s.subagents[e.agentId]) {
        s.subagents[e.agentId].lastText = e.text
      }
      break

    case 'assistant.thinking':
      if (e.agentId === null) {
        s.items.push({ kind: 'thinking', id: e.id, text: e.text })
        s.streamingThinking = ''
      }
      break

    case 'tool.start': {
      // The SDK can resend a tool_use block; keep the first.
      if (s.tools[e.toolUseId]) break
      s.tools[e.toolUseId] = {
        id: e.toolUseId,
        name: e.name,
        input: e.input,
        agentId: e.agentId,
        status: 'running',
        startedAt: e.ts,
      }
      if (QUIET_HARNESS_TOOLS.has(e.name)) {
        // Visible on the agent's card instead.
      } else if (e.agentId === null) {
        s.items.push({ kind: 'tool', id: e.toolUseId })
        // A tool call means the text that preceded it is complete.
        s.streamingText = ''
      } else {
        s.subagents[e.agentId]?.toolIds.push(e.toolUseId)
      }
      const raw = typeof e.input.file_path === 'string' ? e.input.file_path : typeof e.input.notebook_path === 'string' ? e.input.notebook_path : null
      const path = raw && normPath(raw)
      if (path && (READ_TOOLS.has(e.name) || WRITE_TOOLS.has(e.name))) {
        const write = WRITE_TOOLS.has(e.name)
        const f = (s.files[path] ??= { reads: 0, writes: 0, diskChanges: 0, lastTs: e.ts, lastKind: 'read', agents: [] })
        if (write) f.writes++
        else f.reads++
        f.lastTs = e.ts
        f.lastKind = write ? 'write' : 'read'
        const key = agentKey(e.agentId)
        if (!f.agents.includes(key)) f.agents.push(key)
      }
      if (SUBAGENT_TOOLS.has(e.name)) {
        s.subagents[e.toolUseId] ??= {
          id: e.toolUseId,
          description: String(e.input.description ?? 'Subagent'),
          subagentType: e.input.subagent_type as string | undefined,
          status: 'running',
          background: e.input.run_in_background === true,
          toolIds: [],
          startedAt: e.ts,
        }
      }
      break
    }

    case 'tool.progress': {
      const t = s.tools[e.toolUseId]
      if (t) t.elapsedSeconds = e.elapsedSeconds
      break
    }

    case 'tool.end': {
      const t = s.tools[e.toolUseId]
      if (!t) break
      t.status = e.isError ? 'error' : 'done'
      t.output = e.output
      t.endedAt = e.ts
      const sub = s.subagents[e.toolUseId]
      if (sub && e.background) {
        sub.background = true
      } else if (sub && sub.status === 'running') {
        sub.status = e.isError ? 'failed' : 'completed'
        sub.endedAt = e.ts
      }
      break
    }

    case 'subagent.start': {
      if (!e.toolUseId) break
      const sub = s.subagents[e.toolUseId]
      if (sub) {
        sub.description = e.description || sub.description
        sub.subagentType ??= e.subagentType
        sub.background ||= e.background
      }
      break
    }

    case 'subagent.progress': {
      const sub = s.subagents[e.toolUseId]
      if (!sub) break
      if (e.summary) sub.progress = e.summary
      sub.totalTokens = e.totalTokens
      break
    }

    case 'subagent.end': {
      const sub = e.toolUseId ? s.subagents[e.toolUseId] : undefined
      if (!sub) break
      sub.status = e.status
      sub.summary = e.summary
      sub.totalTokens = e.totalTokens
      sub.endedAt = e.ts
      break
    }

    case 'todo.update':
      s.todos = e.todos
      break

    case 'visual':
      applyVisual(s, e)
      break

    case 'file.change': {
      // A file that came and went without an agent touching it (atomic-write temp files) isn't news.
      const existing = s.files[e.path]
      if (e.change === 'deleted' && existing && existing.reads === 0 && existing.writes === 0 && !s.changes.some((c) => c.path === e.path)) {
        delete s.files[e.path]
        break
      }
      const f = (s.files[e.path] ??= { reads: 0, writes: 0, diskChanges: 0, lastTs: e.ts, lastKind: 'disk', agents: [] })
      // An edit tool's own write echoes back from the watcher; don't count it twice.
      const echo = f.lastKind === 'write' && e.ts - f.lastTs < 3000
      if (!echo) {
        f.diskChanges++
        f.lastKind = 'disk'
        f.lastTs = e.ts
      }
      break
    }

    case 'changes.updated':
      s.changes = e.files
      break

    case 'permission.request': {
      const { type: _t, sessionId: _s, ...req } = e
      s.permissions.push(req)
      break
    }

    case 'permission.resolved':
      s.permissions = s.permissions.filter((p) => p.requestId !== e.requestId)
      break

    case 'usage':
      s.contextTokens = e.contextTokens
      break

    case 'compact':
      s.items.push({ kind: 'compact', id: `compact-${e.ts}`, preTokens: e.preTokens, postTokens: e.postTokens, trigger: e.trigger })
      if (e.postTokens !== undefined) s.contextTokens = e.postTokens
      break

    case 'turn.end': {
      // total_cost_usd is cumulative for the CLI process, i.e. the whole session.
      const cumulative = s.costOffset + e.costUsd
      const turnCost = Math.max(0, cumulative - s.totalCostUsd)
      s.totalCostUsd = Math.max(s.totalCostUsd, cumulative)
      if (e.contextWindow) s.contextWindow = e.contextWindow
      s.outputTokens += e.outputTokens
      // Harness's own turn (the saver compacting before your message): your turn follows.
      if (e.internal) break
      s.items.push({
        kind: 'turn',
        id: `turn-${e.ts}-${s.items.length}`,
        costUsd: turnCost,
        durationMs: e.durationMs,
        isError: e.isError,
        result: e.result,
      })
      // Main-agent work still marked running belonged to an interrupted turn.
      // Background subagents (and their tools) legitimately outlive the turn.
      for (const t of Object.values(s.tools)) {
        const owner = t.agentId ? s.subagents[t.agentId] : undefined
        if (t.status === 'running' && !owner?.background && !s.subagents[t.id]?.background) t.status = 'error'
      }
      for (const sub of Object.values(s.subagents)) if (sub.status === 'running' && !sub.background) sub.status = 'stopped'
      break
    }

    case 'error':
      s.items.push({ kind: 'error', id: `error-${e.ts}-${s.items.length}`, message: e.message })
      break

    case 'saver':
      applySaver(s, e)
      break

    case 'notice':
      s.items.push({ kind: 'notice', id: `notice-${e.ts}-${s.items.length}`, tone: e.tone, text: e.text, source: e.source })
      break
  }
}

const newSaverView = (): SaverView => ({
  enabled: false,
  auto: false,
  compact: false,
  skipGenerated: false,
  leanOutput: false,
  stats: { sonnetTurns: 0, opusTurns: 0, takeovers: 0, compactions: 0, compactedTokens: 0, skipped: 0, skippedTokens: 0 },
})

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

function applySaver(s: SessionState, e: EventOf<'saver'>) {
  const n = e.note
  const say = (tone: 'saving' | 'power' | 'info', text: string) => s.items.push({ kind: 'saver', id: `saver-${e.ts}-${s.items.length}`, tone, text })
  if (n.kind === 'config') {
    const before = s.saver
    s.saver = { ...(before ?? newSaverView()), enabled: n.enabled, auto: n.auto, compact: n.compact, skipGenerated: n.skipGenerated, leanOutput: n.leanOutput }
    if (before && before.auto !== n.auto) {
      say('info', n.auto ? 'Auto is back on: the Usage saver picks Opus or Sonnet for each message.' : 'You picked the model for this session, so the saver won’t switch models (compaction and skipping generated files still apply).')
    }
    return
  }
  const v = (s.saver ??= { ...newSaverView(), enabled: true })
  switch (n.kind) {
    case 'route': {
      const first = v.tier === undefined
      v.tier = n.model
      v.turn = n.turn
      v.text = n.text
      v.held = n.held
      if (n.midTurn) {
        if (n.model === 'opus') v.stats.takeovers++
      } else if (n.model === 'sonnet') v.stats.sonnetTurns++
      else v.stats.opusTurns++
      if (first || n.switched || n.held || n.midTurn) say(n.model === 'sonnet' ? 'saving' : 'power', n.text)
      break
    }
    case 'compact': {
      const trimmed = Math.max(0, n.preTokens - (n.postTokens ?? 0))
      v.stats.compactions++
      v.stats.compactedTokens += trimmed
      say('saving', `Compacted the conversation before your message (${k(n.preTokens)} → ${k(n.postTokens ?? 0)} tokens), so every step from here re-reads less.`)
      break
    }
    case 'skip': {
      const tokens = approxTokens(n.bytes)
      v.stats.skipped++
      v.stats.skippedTokens += tokens
      say('saving', `Didn’t read ${baseName(n.path)} whole (a ${n.what}, ${Math.round(n.bytes / 1024)} KB ≈ ${k(tokens)} tokens). Claude searches it or reads just the part it needs.`)
      break
    }
    case 'notice':
      say('info', n.text)
      break
  }
}

function visualsFor(s: SessionState, agentId: AgentId): AgentVisuals {
  return (s.visuals[agentKey(agentId)] ??= { progress: {}, metrics: {}, shows: [] })
}

function pushMetric(v: AgentVisuals, name: string, value: number, step: number | undefined, structured: boolean) {
  const series = (v.metrics[name] ??= { points: [], structured })
  if (structured && !series.structured) {
    // Structured reports supersede numbers scraped from output.
    series.points = []
    series.structured = true
  } else if (!structured && series.structured) {
    return
  }
  series.points.push({ step: step ?? series.points.length, value })
  if (series.points.length > MAX_METRIC_POINTS) series.points.splice(0, series.points.length - MAX_METRIC_POINTS)
}

function applyVisual(s: SessionState, e: EventOf<'visual'>) {
  const v = visualsFor(s, e.agentId)
  const u = e.update
  const structured = e.source !== 'parsed'
  switch (u.kind) {
    case 'status':
      v.status = u.text
      break
    case 'progress': {
      const prev = v.progress[u.label]
      v.progress[u.label] = {
        label: u.label,
        current: u.current,
        total: u.total,
        unit: u.unit,
        source: e.source,
        startedAt: prev && prev.current <= u.current ? prev.startedAt : e.ts,
        updatedAt: e.ts,
      }
      for (const [name, value] of Object.entries(u.metrics ?? {})) pushMetric(v, name, value, u.current, structured)
      break
    }
    case 'metric':
      pushMetric(v, u.name, u.value, u.step, structured)
      break
    case 'show':
      if (!v.shows.some((x) => x.id === u.id)) v.shows.push({ ...u, ts: e.ts })
      break
  }
}

/**
 * After replaying a saved log: whatever was in flight when it was saved is over now.
 * Leaves the transcript, tools, visuals and costs as they were.
 */
export function finalizeLoaded(s: SessionState): void {
  s.live = false
  s.status = 'closed'
  s.permissions = []
  s.streamingText = ''
  s.streamingThinking = ''
  s.turnStartedAt = undefined
  for (const t of Object.values(s.tools)) if (t.status === 'running') t.status = 'error'
  for (const sub of Object.values(s.subagents)) if (sub.status === 'running') sub.status = 'stopped'
}
