import type { AgentId, EventOf, HarnessEvent, PermissionMode, SessionStatus, TodoItem } from '@shared/events'
import { SUBAGENT_TOOLS } from '@shared/events'
import type { SessionSummary } from '@shared/ipc'

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

export type PermissionRequest = Omit<EventOf<'permission.request'>, 'type' | 'sessionId'>

export interface SessionState {
  id: string
  cwd: string
  title: string
  createdAt: number
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
  permissions: PermissionRequest[]
  contextTokens: number
  contextWindow: number
  totalCostUsd: number
  outputTokens: number
  turnStartedAt?: number
}

const DEFAULT_CONTEXT_WINDOW = 200_000

export function createSession(s: SessionSummary, permissionMode: PermissionMode = 'default'): SessionState {
  return {
    ...s,
    status: 'starting',
    permissionMode,
    slashCommands: [],
    items: [],
    streamingText: '',
    streamingThinking: '',
    tools: {},
    subagents: {},
    todos: [],
    permissions: [],
    contextTokens: 0,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    totalCostUsd: 0,
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

    case 'status':
      s.status = e.status
      if (e.status === 'running' && s.turnStartedAt === undefined) s.turnStartedAt = e.ts
      if (e.status === 'idle' || e.status === 'closed') {
        s.turnStartedAt = undefined
        s.streamingText = ''
        s.streamingThinking = ''
      }
      break

    case 'user.message':
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
      if (e.agentId === null) {
        s.items.push({ kind: 'tool', id: e.toolUseId })
        // A tool call means the text that preceded it is complete.
        s.streamingText = ''
      } else {
        s.subagents[e.agentId]?.toolIds.push(e.toolUseId)
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
      const turnCost = Math.max(0, e.costUsd - s.totalCostUsd)
      s.totalCostUsd = Math.max(s.totalCostUsd, e.costUsd)
      if (e.contextWindow) s.contextWindow = e.contextWindow
      s.outputTokens += e.outputTokens
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
  }
}
