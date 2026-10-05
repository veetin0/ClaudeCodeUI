import type { HarnessEvent, PermissionMode } from './events'

export interface StartSessionOptions {
  cwd: string
  model?: string
  permissionMode?: PermissionMode
}

export interface SessionSummary {
  id: string
  cwd: string
  /** From the first prompt; empty until one is sent. */
  title: string
  createdAt: number
  updatedAt: number
  costUsd: number
  model?: string
  /** The Claude Code session id, needed to resume. */
  claudeSessionId?: string
}

export interface LoadedSession {
  summary: SessionSummary
  events: HarnessEvent[]
}

export type PermissionDecision =
  | { behavior: 'allow'; always?: boolean; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string }

export interface AppSettings {
  hasApiKey: boolean
  defaultModel: string
  defaultPermissionMode: PermissionMode
  recentProjects: string[]
}

/** The API the preload script exposes on `window.harness`. */
export interface HarnessApi {
  platform: string
  startSession(opts: StartSessionOptions): Promise<SessionSummary>
  sendMessage(sessionId: string, text: string): Promise<void>
  interrupt(sessionId: string): Promise<void>
  closeSession(sessionId: string): Promise<void>
  /** Saved sessions, most recently active first. */
  listHistory(): Promise<SessionSummary[]>
  loadSession(sessionId: string): Promise<LoadedSession | null>
  /** Restarts a saved session's agent, continuing its Claude conversation. */
  resumeSession(sessionId: string, opts?: { permissionMode?: PermissionMode; model?: string }): Promise<SessionSummary>
  deleteSession(sessionId: string): Promise<void>
  setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void>
  setModel(sessionId: string, model: string): Promise<void>
  respondPermission(sessionId: string, requestId: string, decision: PermissionDecision): Promise<void>
  pickDirectory(): Promise<string | null>
  getSettings(): Promise<AppSettings>
  setApiKey(key: string | null): Promise<void>
  updateSettings(patch: Partial<Omit<AppSettings, 'hasApiKey'>>): Promise<AppSettings>
  /** Events arrive batched (~30fps) to keep the renderer smooth during heavy streaming. */
  onEvents(cb: (events: HarnessEvent[]) => void): () => void
}

export const IPC = {
  startSession: 'session:start',
  sendMessage: 'session:send',
  interrupt: 'session:interrupt',
  closeSession: 'session:close',
  listHistory: 'history:list',
  loadSession: 'history:load',
  resumeSession: 'history:resume',
  deleteSession: 'history:delete',
  setPermissionMode: 'session:permission-mode',
  setModel: 'session:model',
  respondPermission: 'permission:respond',
  pickDirectory: 'dialog:pick-directory',
  getSettings: 'settings:get',
  setApiKey: 'settings:api-key',
  updateSettings: 'settings:update',
  events: 'events',
} as const
