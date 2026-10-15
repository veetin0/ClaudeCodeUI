import type { SessionSummary } from './ipc'
import type { SaverNote } from './usageSaver'
import type { VisualSource, VisualUpdate } from './visuals'

/**
 * HarnessEvent: the single stream every panel renders from.
 * The main process turns SDK messages into these; the renderer reduces them into state.
 * Live view, history and (later) replay all consume the same events.
 */

export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'

export type SessionStatus = 'starting' | 'idle' | 'running' | 'waiting' | 'compacting' | 'closed'

/** `null` means the main agent; otherwise the tool_use id of the Task/Agent call that spawned the subagent. */
export type AgentId = string | null

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface TodoItem {
  /** Set for TaskCreate-style tasks; absent for TodoWrite lists. */
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface FileChange {
  /** Absolute path. */
  path: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
}

type E<T extends string, P> = { type: T; sessionId: string; ts: number } & P

export type HarnessEvent =
  | E<'session.init', {
      claudeSessionId: string
      model: string
      cwd: string
      tools: string[]
      permissionMode: PermissionMode
      slashCommands: string[]
      claudeCodeVersion: string
    }>
  /** A Claude Code session running outside Harness (e.g. in a terminal) is now being watched. */
  | E<'session.observed', { summary: SessionSummary }>
  /** Session total cost reported by the CLI (observed sessions). */
  | E<'cost', { totalCostUsd: number }>
  /** A saved session was reopened and its Claude conversation resumed in a fresh process. */
  | E<'session.resumed', { claudeSessionId: string }>
  | E<'status', { status: SessionStatus }>
  | E<'user.message', { id: string; text: string }>
  | E<'text.delta', { agentId: AgentId; text: string }>
  | E<'thinking.delta', { agentId: AgentId; text: string }>
  | E<'assistant.text', { id: string; agentId: AgentId; text: string }>
  | E<'assistant.thinking', { id: string; agentId: AgentId; text: string }>
  | E<'tool.start', { toolUseId: string; agentId: AgentId; name: string; input: Record<string, unknown> }>
  | E<'tool.progress', { toolUseId: string; elapsedSeconds: number }>
  /** `background`: the call only launched async work (e.g. a background subagent), which ends later. */
  | E<'tool.end', { toolUseId: string; isError: boolean; output: string; background?: boolean }>
  | E<'subagent.start', {
      taskId: string
      toolUseId: string | null
      description: string
      subagentType?: string
      background: boolean
    }>
  | E<'subagent.progress', { toolUseId: string; summary?: string; lastToolName?: string; totalTokens: number; toolUses: number }>
  | E<'subagent.end', {
      taskId: string
      toolUseId: string | null
      status: 'completed' | 'failed' | 'stopped'
      summary: string
      totalTokens?: number
      toolUses?: number
      durationMs?: number
    }>
  | E<'todo.update', { todos: TodoItem[] }>
  /** A file in the project changed on disk (by an agent, a command it ran, or you). */
  | E<'file.change', { path: string; change: 'created' | 'modified' | 'deleted' }>
  /** Files that differ from how they were when the session first touched them. */
  | E<'changes.updated', { files: FileChange[] }>
  /** Progress bars, metric points, images/charts/tables and status lines for one agent. */
  | E<'visual', { agentId: AgentId; toolUseId?: string; source: VisualSource; update: VisualUpdate }>
  | E<'permission.request', {
      requestId: string
      toolUseId: string
      agentId: AgentId
      toolName: string
      input: Record<string, unknown>
      title?: string
      description?: string
      decisionReason?: string
      canAlwaysAllow: boolean
    }>
  | E<'permission.resolved', { requestId: string; behavior: 'allow' | 'deny' }>
  | E<'usage', { usage: Usage; contextTokens: number }>
  | E<'compact', { trigger: 'manual' | 'auto'; preTokens: number; postTokens?: number }>
  | E<'turn.end', {
      isError: boolean
      result: string
      costUsd: number
      durationMs: number
      numTurns: number
      /** Output tokens generated during this turn by the main agent. */
      outputTokens: number
      contextWindow?: number
      /** A turn Harness ran itself (the Usage saver's compaction): no divider, no "finished" notification. */
      internal?: boolean
    }>
  /** What the Usage saver did: the model it picked for a turn, a compaction, a skipped file… */
  | E<'saver', { note: SaverNote }>
  | E<'error', { message: string }>

export type HarnessEventType = HarnessEvent['type']

/** High-frequency streaming events that are not saved; their final forms (assistant.text etc.) are. */
export const EPHEMERAL_EVENTS = new Set<HarnessEventType>(['text.delta', 'thinking.delta', 'tool.progress'])
export type EventOf<T extends HarnessEventType> = Extract<HarnessEvent, { type: T }>

/** Tools that spawn a subagent. */
export const SUBAGENT_TOOLS = new Set(['Task', 'Agent'])

/** Tools whose output we scan for progress counters and metrics. */
export const EXEC_TOOLS = new Set(['Bash', 'BashOutput', 'Monitor'])

/** Prefix of the in-process visualization tools (see main/agent/harnessTools.ts). */
export const HARNESS_TOOL_PREFIX = 'mcp__harness__'
