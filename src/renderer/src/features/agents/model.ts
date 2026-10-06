import { hackforgeRole } from '@shared/hackforge'
import type { AgentId } from '@shared/events'
import { basename } from '@/lib/format'
import { toolKind } from '@/lib/tools'
import { agentKey, type AgentVisuals, type SessionState, type ToolCall } from '@/stores/reducer'

export type AgentRunState = 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'stopped'

/** The main agent and each subagent, normalized so cards and detail views treat them alike. */
export interface AgentView {
  key: string
  id: AgentId
  name: string
  role: string
  state: AgentRunState
  background: boolean
  startedAt?: number
  endedAt?: number
  tools: ToolCall[]
  visuals: AgentVisuals
  /** Latest prose from the agent (last message, or the subagent's final report). */
  text?: string
  totalTokens?: number
}

const EMPTY_VISUALS: AgentVisuals = { progress: {}, metrics: {}, shows: [] }

export function agentViews(s: SessionState): AgentView[] {
  const mainState: AgentRunState =
    s.status === 'running' || s.status === 'compacting' ? 'running' : s.status === 'waiting' ? 'waiting' : 'idle'
  const lastText = [...s.items].reverse().find((i) => i.kind === 'text')
  const all = Object.values(s.tools)

  const main: AgentView = {
    key: 'main',
    id: null,
    name: 'Main agent',
    role: s.model ?? 'claude',
    state: mainState,
    background: false,
    startedAt: s.turnStartedAt,
    tools: all.filter((t) => t.agentId === null),
    visuals: s.visuals.main ?? EMPTY_VISUALS,
    text: s.streamingText || (lastText?.kind === 'text' ? lastText.text : undefined),
  }

  const subs = Object.values(s.subagents)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map<AgentView>((sub) => ({
      key: agentKey(sub.id),
      id: sub.id,
      name: sub.description,
      role: hackforgeRole(sub.subagentType) ?? sub.subagentType ?? 'general-purpose',
      // A subagent waiting on approval shows as waiting.
      state: s.permissions.some((p) => p.agentId === sub.id) ? 'waiting' : sub.status,
      background: sub.background,
      startedAt: sub.startedAt,
      endedAt: sub.endedAt,
      tools: sub.toolIds.map((id) => s.tools[id]).filter(Boolean),
      visuals: s.visuals[sub.id] ?? EMPTY_VISUALS,
      text: sub.summary || sub.lastText,
      totalTokens: sub.totalTokens,
    }))

  return [main, ...subs]
}

export const isActive = (a: AgentView) => a.state === 'running' || a.state === 'waiting'

export type ActivityKind = 'writing' | 'editing' | 'running' | 'reading' | 'searching' | 'browsing' | 'delegating' | 'planning' | 'thinking' | 'waiting' | 'idle' | 'done'

export interface Activity {
  kind: ActivityKind
  /** e.g. "Writing train.py" */
  title: string
  tool?: ToolCall
}

const VERB: Record<string, ActivityKind> = {
  write: 'writing',
  read: 'reading',
  search: 'searching',
  exec: 'running',
  web: 'browsing',
  agent: 'delegating',
  plan: 'planning',
}

/** What the agent is doing right now, derived from its newest running tool call. */
export function currentActivity(a: AgentView): Activity {
  if (a.state === 'waiting') return { kind: 'waiting', title: 'Waiting for your approval' }
  const running = [...a.tools].reverse().find((t) => t.status === 'running')
  if (running) {
    const k = toolKind(running.name)
    let kind = VERB[k] ?? 'running'
    if (running.name === 'Edit' || running.name === 'MultiEdit') kind = 'editing'
    return { kind, title: activityTitle(kind, running), tool: running }
  }
  if (a.state === 'running') return { kind: 'thinking', title: a.visuals.status ?? 'Thinking…' }
  if (a.state === 'idle') return { kind: 'idle', title: 'Idle' }
  return { kind: 'done', title: a.state === 'completed' ? 'Finished' : a.state === 'failed' ? 'Failed' : 'Stopped' }
}

function activityTitle(kind: ActivityKind, t: ToolCall): string {
  const file = typeof t.input.file_path === 'string' ? basename(t.input.file_path) : ''
  switch (kind) {
    case 'writing':
      return `Writing ${file}`
    case 'editing':
      return `Editing ${file}`
    case 'reading':
      return `Reading ${file}`
    case 'running':
      return typeof t.input.description === 'string' ? t.input.description : 'Running a command'
    case 'searching':
      return `Searching for ${String(t.input.pattern ?? t.input.query ?? '')}`
    case 'browsing':
      return `Fetching ${String(t.input.url ?? t.input.query ?? '')}`
    case 'delegating':
      return `Delegating: ${String(t.input.description ?? '')}`
    case 'planning':
      return 'Updating the plan'
    default:
      return t.name
  }
}

/** Files an agent touched, newest first, with what it did to each. */
export function filesTouched(a: AgentView): { path: string; reads: number; writes: number; last: ToolCall }[] {
  const map = new Map<string, { path: string; reads: number; writes: number; last: ToolCall }>()
  for (const t of a.tools) {
    const path = typeof t.input.file_path === 'string' ? t.input.file_path : typeof t.input.notebook_path === 'string' ? t.input.notebook_path : null
    if (!path) continue
    const e = map.get(path) ?? { path, reads: 0, writes: 0, last: t }
    if (toolKind(t.name) === 'write') e.writes++
    else e.reads++
    e.last = t
    map.set(path, e)
  }
  return [...map.values()].sort((x, y) => y.last.startedAt - x.last.startedAt)
}
