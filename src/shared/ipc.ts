import type { HarnessEvent, PermissionMode } from './events'
import type { PitchChoice, PitchScript, PitchState, Voice } from './pitch'
import type { Kit3dQuality, Kit3dState } from './kit3d'
export type { PitchState, Voice, PitchJob } from './pitch'
import type { Composition, PreviewServer, PreviewState, ProjectInfo, RenderJob } from './preview'
import type { UsageSaverSettings } from './usageSaver'
import type { PhoneAlertSettings } from './alerts'
import type { QueuedPrompt, ResetQueueState } from './resetQueue'
import type { PartnersState } from './partners'
import type { DesignSkillsSettings, DesignState } from './design'
import type { DevToolsSettings, DevToolsState } from './devtools'

export interface StartSessionOptions {
  cwd: string
  /** A model alias or ID, or 'auto' for the Usage saver to pick per turn. */
  model?: string
  permissionMode?: PermissionMode
  /** The advisor for this session, instead of the one in Settings. */
  advisor?: import('./advisor').AdvisorChoice
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

export type PermissionDecision = { behavior: 'allow'; always?: boolean; updatedInput?: Record<string, unknown> } | { behavior: 'deny'; message?: string }

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
  /** ECC (agents, skills, commands, hooks) in every session, and how strict its hooks are. */
  ecc: import('./ecc').EccSettings
  /** Claude Code's advisor for the sessions Harness starts ('' = Claude Code's own setting). */
  advisor: import('./advisor').AdvisorChoice
  defaultPermissionMode: PermissionMode
  recentProjects: string[]
  /** macOS notifications when Claude needs approval or finishes while Harness is in the background. */
  notifications: boolean
  /** The team: agents shown as pixel characters (animated, still, or off for plain icons). */
  teamCharacters: 'animated' | 'still' | 'off'
  /** The project Harness is building (the Project place, promo video, API keys). */
  project: string | null
  /** Where new projects go (the last place you picked); null: ~/Projects. */
  projectsRoot: string | null
  /** An ElevenLabs key is stored (for promo narration). */
  hasElevenLabsKey: boolean
  /** Auto model, compaction between tasks, skipping generated files, lean output. */
  usageSaver: UsageSaverSettings
  /** Pushes to your phone (ntfy) when you're away. */
  phoneAlerts: PhoneAlertSettings
  /** Run queued messages when the usage limit resets. */
  resetQueue: { enabled: boolean; keepAwake: boolean }
  /** impeccable and UI/UX Pro Max, loaded into every session. */
  designSkills: DesignSkillsSettings
  /** Browser (Playwright), library docs (Context7) and partner MCP servers in sessions. */
  devTools: DevToolsSettings
  /** A Context7 key is stored (higher rate limits for library docs). */
  hasContext7Key: boolean
}

/** Settings the renderer may change directly (stored keys have their own setters). */
export type SettingsPatch = Partial<Omit<AppSettings, 'hasApiKey' | 'hasElevenLabsKey' | 'hasContext7Key'>>


/** The API the preload script exposes on `window.harness`. */
export interface HarnessApi {
  platform: string
  startSession(opts: StartSessionOptions): Promise<SessionSummary>
  /** `via: 'harness'`: a message Harness sends for you (a project build's instructions), shown as such. */
  sendMessage(sessionId: string, text: string, images?: import('./events').ImageAttachment[], via?: 'harness'): Promise<void>
  interrupt(sessionId: string): Promise<void>
  closeSession(sessionId: string): Promise<void>
  /** Saved sessions, most recently active first. */
  listHistory(): Promise<SessionSummary[]>
  loadSession(sessionId: string): Promise<LoadedSession | null>
  /** Restarts a saved session's agent, continuing its Claude conversation. */
  resumeSession(sessionId: string, opts?: { permissionMode?: PermissionMode; model?: string; advisor?: import('./advisor').AdvisorChoice }): Promise<SessionSummary>
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
  updateSettings(patch: SettingsPatch): Promise<AppSettings>
  setElevenLabsKey(key: string | null): Promise<AppSettings>
  setContext7Key(key: string | null): Promise<AppSettings>
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
  previewDetect(cwd: string): Promise<ProjectInfo>
  previewState(): Promise<PreviewState>
  startStudio(cwd: string): Promise<PreviewServer>
  startScript(cwd: string, script: string): Promise<PreviewServer>
  stopServer(id: string): Promise<void>
  listCompositions(cwd: string): Promise<Composition[]>
  render(cwd: string, composition: string): Promise<RenderJob>
  cancelRender(id: string): Promise<void>
  /** Shows a file in Finder. */
  revealFile(path: string): Promise<void>
  /** Opens a file in the current project with its default app (a PRD or plan in your editor). */
  openProjectFile(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  onPreviewState(cb: (state: PreviewState) => void): () => void
  /** Menu items, notifications and the menu-bar item send commands here. */
  onCommand(cb: (cmd: import('./commands').CommandMessage) => void): () => void
  /** Tells main which session is in front, so notifications skip it while the window is focused. */
  setActiveSession(sessionId: string | null): void
  pitchState(): Promise<PitchState>
  /** Creates promo/ (Remotion template + a starter script.json) in the current project. */
  pitchScaffold(eventName: string): Promise<PitchState>
  /** Saves what kind of video you want (null: ask again); slides and 3D set up promo/. */
  pitchChoose(choice: Omit<PitchChoice, 'at'> | null, eventName: string): Promise<PitchState>
  /** Downloads the cartoon short skill (once). */
  pitchInstallCartoon(): Promise<PitchState>
  pitchSave(script: PitchScript): Promise<PitchState>
  pitchInstall(): Promise<PitchState>
  /** Generates ElevenLabs narration for scenes whose audio is missing or out of date. */
  pitchNarrate(): Promise<PitchState>
  pitchVoices(): Promise<Voice[]>
  /** 3D clips (Harness's 3D kit in the current project's video/kit3d). */
  kit3dState(): Promise<Kit3dState>
  kit3dSetup(): Promise<Kit3dState>
  kit3dCapture(): Promise<Kit3dState>
  kit3dStills(clip: string): Promise<Kit3dState>
  kit3dRender(clip: string, quality: Kit3dQuality): Promise<Kit3dState>
  kit3dCancel(): Promise<Kit3dState>
  /** Copies the rendered clip into promo/public/3d/; returns its media path and length. */
  kit3dAddToPitch(clip: string): Promise<{ media: string; seconds?: number }>
  onKit3d(cb: (state: Kit3dState) => void): () => void
  onPitch(cb: (state: PitchState) => void): () => void
  resetQueueState(): Promise<ResetQueueState>
  resetQueueAdd(item: { sessionId: string; cwd: string; title: string; text: string }): Promise<ResetQueueState>
  resetQueueRemove(id: string): Promise<ResetQueueState>
  /** The window sent a queued message. */
  resetQueueDone(id: string): void
  onResetQueue(cb: (state: ResetQueueState) => void): () => void
  /** Queued messages are due: send them. */
  onResetQueueFire(cb: (items: QueuedPrompt[]) => void): () => void
  phoneTest(): Promise<void>
  partnersState(): Promise<PartnersState>
  partnerSetKey(env: string, value: string | null): Promise<PartnersState>
  partnerSetDocs(kitId: string, url: string): Promise<PartnersState>
  /** An MCP server URL a service gives out (empty clears it). */
  partnerSetMcp(kitId: string, url: string): Promise<PartnersState>
  /** Adds an API key; a known service gets its kit, anything else is left for Claude to research. */
  partnerAdd(opts: { key: string; name?: string }): Promise<{ state: PartnersState; kitId: string; known: boolean }>
  partnerRemove(id: string): Promise<PartnersState>
  partnerTest(kitId: string): Promise<PartnersState>
  onPartners(cb: (state: PartnersState) => void): () => void
  /** Click to change: lets you click an element in the preview; its description and a screenshot, or null. */
  previewPick(
    url: string,
    frame: { x: number; y: number; width: number; height: number },
  ): Promise<{ element: import('./pick').PickedElement; image?: import('./events').ImageAttachment } | null>
  previewPickCancel(url: string): Promise<void>
  /** Which design plugins sessions get, and whether impeccable's engine is ready. */
  designState(): Promise<DesignState>
  /** Downloads impeccable's engine if it isn't on this computer yet. */
  designPrepare(): Promise<DesignState>
  onDesign(cb: (state: DesignState) => void): () => void
  /** Browser, library docs, partner servers and reverse engineering (REA) sessions get. */
  devToolsState(): Promise<DevToolsState>
  /** Makes a folder the current project (null: none); returns the settings. */
  projectSet(dir: string | null): Promise<AppSettings>
  /** Creates a project folder from an idea (git, ECC's rules, Harness's record) and makes it the current project. */
  projectCreate(opts: import('./project').CreateProject): Promise<{ dir: string; settings: AppSettings }>
  /** Where the current project's build is (null without a project). */
  projectState(): Promise<import('./project').ProjectState | null>
  onProjectState(cb: (state: import('./project').ProjectState | null) => void): () => void
  /** Records the session that builds the current project. */
  projectLink(sessionId: string): Promise<void>
  /** ECC's MCP catalog: servers the current project can add, and the keys each needs. */
  projectCatalog(): Promise<import('./mcpCatalog').CatalogEntry[]>
  projectSetMcp(id: string, on: boolean): Promise<import('./mcpCatalog').CatalogEntry[]>
  /** Where a new project goes by default. */
  projectDefaults(): Promise<{ parent: string }>
  /** This laptop's Claude plan usage (5-hour and weekly windows). */
  usageState(): Promise<import('./planUsage').PlanUsage>
  onUsage(cb: (usage: import('./planUsage').PlanUsage) => void): () => void
  /** The ECC copy sessions get and what's in it. */
  eccInfo(): Promise<import('./ecc').EccInfo>
  /** Downloads Chromium for the browser tools when there's no Chrome or Edge. */
  devToolsInstallBrowser(): Promise<DevToolsState>
  /** Installs REA (reverse engineering) with the user's npm. */
  devToolsInstallRea(): Promise<DevToolsState>
  /** Installs and enables MCP for Blender's add-on in Blender. */
  devToolsSetupBlender(): Promise<DevToolsState>
  /** Opens Blender (its add-on connects by itself), importing a model if given. */
  devToolsOpenBlender(file?: string): Promise<void>
  /** Asks for a .glb/.gltf file to open in the 3D viewer. */
  previewPickModel(): Promise<string | null>
  onDevTools(cb: (state: DevToolsState) => void): () => void
  /** The path of a file dropped on the window. */
  pathForFile(file: File): string
  /** Tokens per day and model, top sessions, the saver's work and plan readings. */
  usageHistory(days: number): Promise<import('./usageHistory').UsageHistory>
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
  previewDetect: 'preview:detect',
  previewState: 'preview:state-get',
  previewStateUpdate: 'preview:state',
  startStudio: 'preview:studio',
  startScript: 'preview:script',
  stopServer: 'preview:stop',
  listCompositions: 'preview:compositions',
  render: 'preview:render',
  cancelRender: 'preview:cancel-render',
  revealFile: 'shell:reveal',
  openProjectFile: 'shell:open-project-file',
  openExternal: 'shell:open-external',
  command: 'app:command',
  activeSession: 'app:active-session',
  setElevenLabsKey: 'settings:elevenlabs-key',
  setContext7Key: 'settings:context7-key',
  pitchState: 'pitch:state',
  pitchScaffold: 'pitch:scaffold',
  pitchChoose: 'pitch:choose',
  pitchInstallCartoon: 'pitch:install-cartoon',
  pitchSave: 'pitch:save',
  pitchInstall: 'pitch:install',
  pitchNarrate: 'pitch:narrate',
  pitchVoices: 'pitch:voices',
  pitchPush: 'pitch:push',
  kit3dState: 'kit3d:state',
  kit3dSetup: 'kit3d:setup',
  kit3dCapture: 'kit3d:capture',
  kit3dStills: 'kit3d:stills',
  kit3dRender: 'kit3d:render',
  kit3dCancel: 'kit3d:cancel',
  kit3dAddToPitch: 'kit3d:add-to-pitch',
  kit3dPush: 'kit3d:push',
  resetQueueState: 'reset-queue:state',
  resetQueueAdd: 'reset-queue:add',
  resetQueueRemove: 'reset-queue:remove',
  resetQueueDone: 'reset-queue:done',
  resetQueuePush: 'reset-queue:push',
  resetQueueFire: 'reset-queue:fire',
  phoneTest: 'phone:test',
  partnersState: 'partners:state',
  partnerSetKey: 'partners:set-key',
  partnerSetDocs: 'partners:set-docs',
  partnerSetMcp: 'partners:set-mcp',
  partnerAdd: 'partners:add',
  partnerRemove: 'partners:remove',
  partnerTest: 'partners:test',
  partnersPush: 'partners:push',
  previewPick: 'preview:pick',
  previewPickCancel: 'preview:pick-cancel',
  usageHistory: 'usage:history',
  designState: 'design:state',
  designPrepare: 'design:prepare',
  designPush: 'design:push',
  devToolsState: 'devtools:state',
  projectSet: 'project:set',
  projectCreate: 'project:create',
  projectState: 'project:state',
  projectPush: 'project:push',
  projectLink: 'project:link',
  projectCatalog: 'project:catalog',
  projectSetMcp: 'project:set-mcp',
  projectDefaults: 'project:defaults',
  usageState: 'usage:state',
  usagePush: 'usage:push',
  eccInfo: 'ecc:info',
  devToolsInstallBrowser: 'devtools:install-browser',
  devToolsInstallRea: 'devtools:install-rea',
  devToolsSetupBlender: 'devtools:setup-blender',
  devToolsOpenBlender: 'devtools:open-blender',
  previewPickModel: 'preview:pick-model',
  devToolsPush: 'devtools:push',
  events: 'events',
} as const
