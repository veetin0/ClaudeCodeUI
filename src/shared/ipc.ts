import type { HarnessEvent, PermissionMode } from './events'

export interface StartSessionOptions {
  cwd: string
  model?: string
  permissionMode?: PermissionMode
}

export interface SessionSummary {
  id: string
  /** Watched from a Claude Code session running elsewhere (terminal), not run by Harness. */
  observed?: boolean
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

export interface FileDiff {
  path: string
  /** null: the file didn't exist before the session (or no baseline is known). */
  original: string | null
  /** null: the file has been deleted. */
  current: string | null
  /** False when we only know the file changed but have no "before" to compare with. */
  hasBaseline: boolean
}

export type PermissionDecision =
  | { behavior: 'allow'; always?: boolean; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string }

export interface ObserveStatus {
  /** Watching ~/.claude/projects for sessions started outside Harness. */
  enabled: boolean
  hooksInstalled: boolean
  /** Port the status hooks post to; null if it couldn't be bound. */
  hookPort: number | null
  settingsPath: string
  watching: number
}

export interface PtyOptions {
  cwd: string
  cols: number
  rows: number
  /** Run this instead of an interactive shell, e.g. 'claude'. */
  command?: string
}

export interface AppSettings {
  hasApiKey: boolean
  observeTerminalSessions: boolean
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
  /** Project files (relative paths), from git when available. */
  listFiles(cwd: string): Promise<string[]>
  getFileDiff(sessionId: string, path: string): Promise<FileDiff>
  /** Restores the file to its pre-session content. */
  revertFile(sessionId: string, path: string): Promise<void>
  /** Marks the change as reviewed; it leaves the changes list until edited again. */
  acceptFile(sessionId: string, path: string): Promise<void>
  setPermissionMode(sessionId: string, mode: PermissionMode): Promise<void>
  setModel(sessionId: string, model: string): Promise<void>
  respondPermission(sessionId: string, requestId: string, decision: PermissionDecision): Promise<void>
  pickDirectory(): Promise<string | null>
  getSettings(): Promise<AppSettings>
  setApiKey(key: string | null): Promise<void>
  updateSettings(patch: Partial<Omit<AppSettings, 'hasApiKey'>>): Promise<AppSettings>
  getObserveStatus(): Promise<ObserveStatus>
  setObserveEnabled(enabled: boolean): Promise<ObserveStatus>
  /** Adds status hooks to ~/.claude/settings.json (after backing it up). */
  installObserveHooks(): Promise<ObserveStatus>
  removeObserveHooks(): Promise<ObserveStatus>
  ptyCreate(opts: PtyOptions): Promise<string>
  ptyWrite(id: string, data: string): void
  ptyResize(id: string, cols: number, rows: number): void
  ptyKill(id: string): void
  onPtyData(cb: (id: string, data: string) => void): () => void
  onPtyExit(cb: (id: string, code: number) => void): () => void
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
  listFiles: 'files:list',
  getFileDiff: 'files:diff',
  revertFile: 'files:revert',
  acceptFile: 'files:accept',
  setPermissionMode: 'session:permission-mode',
  setModel: 'session:model',
  respondPermission: 'permission:respond',
  pickDirectory: 'dialog:pick-directory',
  getSettings: 'settings:get',
  setApiKey: 'settings:api-key',
  updateSettings: 'settings:update',
  observeStatus: 'observe:status',
  observeEnable: 'observe:enable',
  observeInstallHooks: 'observe:install-hooks',
  observeRemoveHooks: 'observe:remove-hooks',
  ptyCreate: 'pty:create',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyData: 'pty:data',
  ptyExit: 'pty:exit',
  events: 'events',
} as const
