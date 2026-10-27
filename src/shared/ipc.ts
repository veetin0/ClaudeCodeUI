import type { HarnessEvent, PermissionMode } from './events'
import type { HackforgeMode, HackforgeSnapshot } from './hackforge'
import type { EventState } from './event'
import type { ChallengePatch } from './challenges'
import type { PitchScript, PitchState, Voice } from './pitch'
export type { PitchState, Voice, PitchJob } from './pitch'
import type { MemberSession, TeamConfig, TeamState } from './team'
import type { Composition, PreviewServer, PreviewState, ProjectInfo, RenderJob } from './preview'
import type { UsageSaverSettings } from './usageSaver'
import type { PhoneAlertSettings } from './alerts'
import type { QueuedPrompt, ResetQueueState } from './resetQueue'
import type { HandoffPlan } from './handoff'
import type { PartnersState } from './partners'
import type { DesignSkillsSettings, DesignState } from './design'
import type { DevToolsSettings, DevToolsState } from './devtools'
import type { TeamState as TeamStateT } from './team'

export interface StartSessionOptions {
  cwd: string
  /** A model alias or ID, or 'auto' for the Usage saver to pick per turn. */
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
  defaultPermissionMode: PermissionMode
  recentProjects: string[]
  /** macOS notifications when Claude needs approval or finishes while Harness is in the background. */
  notifications: boolean
  /** Route work through the HackForge plugin: never, in projects that use it, or in every session. */
  hackforgeMode: HackforgeMode
  /** Folder of the project linked to event mode (shared with the team through git). */
  eventProject: string | null
  /** Team board membership (relay URL, team token, my name). */
  team: TeamConfig | null
  /** Stable id for this install on team boards. */
  teamMemberId: string
  /** An ElevenLabs key is stored (for pitch narration). */
  hasElevenLabsKey: boolean
  /** Auto model, compaction between tasks, skipping generated files, lean output. */
  usageSaver: UsageSaverSettings
  /** Pushes to your phone (ntfy) when you're away. */
  phoneAlerts: PhoneAlertSettings
  /** Run queued messages when the usage limit resets. */
  resetQueue: { enabled: boolean; keepAwake: boolean }
  /** Folders created for handoffs you took (they get the partner keys too). */
  handoffDirs: string[]
  /** impeccable and UI/UX Pro Max, loaded into every session. */
  designSkills: DesignSkillsSettings
  /** Browser (Playwright), library docs (Context7) and partner MCP servers in sessions. */
  devTools: DevToolsSettings
  /** A Context7 key is stored (higher rate limits for library docs). */
  hasContext7Key: boolean
  /** Crew reports and messages start a turn in the session that sent the mission. */
  crewAutoReports: boolean
  /** The team server teams start on (e.g. a Render URL); empty: host it on this laptop. */
  teamServer: string
}

/** Settings the renderer may change directly (stored keys have their own setters). */
export type SettingsPatch = Partial<Omit<AppSettings, 'hasApiKey' | 'hasElevenLabsKey' | 'hasContext7Key'>>

export type EventProgressPatch = { done?: Record<string, boolean>; partner?: { name: string; keys?: boolean; kit?: boolean } }

/** The API the preload script exposes on `window.harness`. */
export interface HarnessApi {
  platform: string
  startSession(opts: StartSessionOptions): Promise<SessionSummary>
  sendMessage(sessionId: string, text: string, images?: import('./events').ImageAttachment[]): Promise<void>
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
  openExternal(url: string): Promise<void>
  onPreviewState(cb: (state: PreviewState) => void): () => void
  /** Menu items, notifications and the menu-bar item send commands here. */
  onCommand(cb: (cmd: import('./commands').CommandMessage) => void): () => void
  /** Tells main which session is in front, so notifications skip it while the window is focused. */
  setActiveSession(sessionId: string | null): void
  /** Current HackForge state of a project; keeps it live via onHackforge until unwatched. */
  hackforgeWatch(cwd: string): Promise<HackforgeSnapshot>
  hackforgeUnwatch(cwd: string): void
  /** Creates .hackforge/STOP_LOOP: the improvement loop ends after its current iteration. */
  hackforgeStopLoop(cwd: string): Promise<void>
  /** Rewrites `profile:` in challenge/hackforge.yaml. */
  hackforgeSetProfile(cwd: string, profile: string): Promise<void>
  /** Opens .hackforge/views/<name>.html (HackForge's decision pages) in the default browser. */
  hackforgeOpenView(cwd: string, name: string): Promise<string>
  onHackforge(cb: (snapshot: HackforgeSnapshot) => void): () => void
  /** Event mode: config, clock data and the team's shared checklist progress. */
  eventState(): Promise<EventState>
  /** Links (or with null unlinks) the event project folder. */
  eventLink(dir: string | null): Promise<EventState>
  /** Sets a folder up from the event preset (challenge/, event.yaml, HackForge settings) and links it. */
  eventSetup(dir: string): Promise<EventState>
  eventUpdate(patch: EventProgressPatch): Promise<EventState>
  onEvent(cb: (state: EventState) => void): () => void
  challengeAdd(c: { partner: string; title: string; description: string; link?: string }): Promise<EventState>
  challengeUpdate(id: string, patch: ChallengePatch): Promise<EventState>
  challengeDelete(id: string): Promise<EventState>
  /** Marks it chosen, writes challenge/brief/00-chosen-challenge.md and names it in hackforge.yaml. */
  challengeChoose(id: string): Promise<EventState>
  pitchState(): Promise<PitchState>
  /** Creates pitch/ (Remotion template + a starter script.json) in the event project. */
  pitchScaffold(eventName: string): Promise<PitchState>
  pitchSave(script: PitchScript): Promise<PitchState>
  pitchInstall(): Promise<PitchState>
  /** Generates ElevenLabs narration for scenes whose audio is missing or out of date. */
  pitchNarrate(): Promise<PitchState>
  pitchVoices(): Promise<Voice[]>
  onPitch(cb: (state: PitchState) => void): () => void
  teamState(): Promise<TeamState>
  /** New team: host the relay on this computer, or use a relay server URL. */
  teamCreate(opts: { name: string; host: boolean; relayUrl?: string }): Promise<TeamState>
  teamJoin(code: string, name: string): Promise<TeamState>
  teamLeave(): Promise<TeamState>
  teamUpdate(patch: { name?: string; focus?: string }): Promise<TeamState>
  /** This machine's open sessions, for the team board. */
  teamSetLocal(local: { sessions: MemberSession[]; cwd?: string }): void
  onTeam(cb: (state: TeamState) => void): () => void
  /** What handing this session off would do (branch, files, remote). */
  handoffPlan(sessionId: string): Promise<HandoffPlan & { member: string | null }>
  /** Pushes a snapshot of the folder (when asked and possible) and puts the handoff on the team board. */
  handoffOffer(opts: {
    sessionId: string
    title: string
    note: string
    reason: 'limit' | 'manual'
    push: boolean
  }): Promise<{ state: TeamStateT; pushError?: string }>
  handoffWithdraw(id: string): Promise<TeamStateT>
  /** Checks the work out next to the project and returns the folder and the first message. */
  handoffTake(id: string): Promise<{ dir: string; prompt: string }>
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
  partnerSetKey(env: string, value: string | null, share?: boolean): Promise<PartnersState>
  partnerSetShare(env: string, share: boolean): Promise<PartnersState>
  partnerSetDocs(kitId: string, url: string): Promise<PartnersState>
  /** An MCP server URL a partner gave out at the event (empty clears it). */
  partnerSetMcp(kitId: string, url: string): Promise<PartnersState>
  partnerAddCustom(opts: { name: string; env: string; docs?: string }): Promise<PartnersState>
  partnerRemoveCustom(id: string): Promise<PartnersState>
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
  /** Downloads Chromium for the browser tools when there's no Chrome or Edge. */
  devToolsInstallBrowser(): Promise<DevToolsState>
  /** Installs REA (reverse engineering) with the user's npm. */
  devToolsInstallRea(): Promise<DevToolsState>
  onDevTools(cb: (state: DevToolsState) => void): () => void
  /** Crew mode: teammates' Claudes (harness-crew), their missions and questions. */
  crewState(): Promise<import('./crew').CrewState>
  /** Answers a crew Claude's permission question. */
  crewAnswer(askId: string, allow: boolean, always?: boolean): Promise<void>
  crewCancel(missionId: string): Promise<void>
  onCrew(cb: (state: import('./crew').CrewState) => void): () => void
  /** Team run: Team → Setup → Plan → Run → Done. */
  runState(): Promise<import('./run').RunState>
  onRun(cb: (state: import('./run').RunState) => void): () => void
  /** Starts the team on the team server from Settings (or hosted here). */
  runStartTeam(name: string): Promise<void>
  runGoTo(stage: import('./run').RunStage): Promise<void>
  runCreateProject(o: { name: string; parent: string; deadline?: string; plan: import('./run').ClaudePlan }): Promise<void>
  runUseFolder(o: { dir: string; name: string; deadline?: string; plan: import('./run').ClaudePlan }): Promise<void>
  runSetupInfo(): Promise<import('./run').SetupInfo | null>
  runSetChallenge(text: string): Promise<import('./run').SetupInfo | null>
  runAddFiles(kind: import('./run').FileKind, paths: string[]): Promise<import('./run').SetupInfo | null>
  /** File picker for a drop zone; the chosen paths (empty when cancelled). */
  runPickFiles(): Promise<string[]>
  runGithub(): Promise<void>
  /** The lead's session is started: HackForge plans in it. */
  runPlan(sessionId: string): Promise<void>
  runAccept(): Promise<void>
  runRevise(change: string): Promise<void>
  runAnswer(itemId: string, a: { allow?: boolean; always?: boolean; answers?: Record<string, string>; text?: string }): Promise<void>
  runPause(): Promise<void>
  runResume(): Promise<void>
  runStop(): Promise<void>
  runReset(): Promise<void>
  runReconnect(sessionId: string): Promise<void>
  /** Checks a team server URL: reachable, and new enough for crew mode. */
  teamTestServer(url: string): Promise<{ ok: boolean; files?: boolean; error?: string }>
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
  openExternal: 'shell:open-external',
  command: 'app:command',
  activeSession: 'app:active-session',
  hackforgeWatch: 'hackforge:watch',
  hackforgeUnwatch: 'hackforge:unwatch',
  hackforgeStopLoop: 'hackforge:stop-loop',
  hackforgeSetProfile: 'hackforge:set-profile',
  hackforgeOpenView: 'hackforge:open-view',
  hackforgeUpdate: 'hackforge:snapshot',
  eventState: 'event:state',
  eventLink: 'event:link',
  eventSetup: 'event:setup',
  eventUpdate: 'event:update',
  eventPush: 'event:push',
  challengeAdd: 'challenge:add',
  challengeUpdate: 'challenge:update',
  challengeDelete: 'challenge:delete',
  challengeChoose: 'challenge:choose',
  teamState: 'team:state',
  teamCreate: 'team:create',
  teamJoin: 'team:join',
  teamLeave: 'team:leave',
  teamUpdate: 'team:update',
  teamSetLocal: 'team:set-local',
  teamPush: 'team:push',
  setElevenLabsKey: 'settings:elevenlabs-key',
  setContext7Key: 'settings:context7-key',
  pitchState: 'pitch:state',
  pitchScaffold: 'pitch:scaffold',
  pitchSave: 'pitch:save',
  pitchInstall: 'pitch:install',
  pitchNarrate: 'pitch:narrate',
  pitchVoices: 'pitch:voices',
  pitchPush: 'pitch:push',
  handoffPlan: 'handoff:plan',
  handoffOffer: 'handoff:offer',
  handoffWithdraw: 'handoff:withdraw',
  handoffTake: 'handoff:take',
  resetQueueState: 'reset-queue:state',
  resetQueueAdd: 'reset-queue:add',
  resetQueueRemove: 'reset-queue:remove',
  resetQueueDone: 'reset-queue:done',
  resetQueuePush: 'reset-queue:push',
  resetQueueFire: 'reset-queue:fire',
  phoneTest: 'phone:test',
  partnersState: 'partners:state',
  partnerSetKey: 'partners:set-key',
  partnerSetShare: 'partners:set-share',
  partnerSetDocs: 'partners:set-docs',
  partnerSetMcp: 'partners:set-mcp',
  partnerAddCustom: 'partners:add-custom',
  partnerRemoveCustom: 'partners:remove-custom',
  partnerTest: 'partners:test',
  partnersPush: 'partners:push',
  previewPick: 'preview:pick',
  previewPickCancel: 'preview:pick-cancel',
  usageHistory: 'usage:history',
  designState: 'design:state',
  designPrepare: 'design:prepare',
  designPush: 'design:push',
  devToolsState: 'devtools:state',
  devToolsInstallBrowser: 'devtools:install-browser',
  devToolsInstallRea: 'devtools:install-rea',
  devToolsPush: 'devtools:push',
  crewState: 'crew:state',
  crewAnswer: 'crew:answer',
  crewCancel: 'crew:cancel',
  crewPush: 'crew:push',
  runState: 'run:state',
  runPush: 'run:push',
  runStartTeam: 'run:start-team',
  runGoTo: 'run:go-to',
  runCreateProject: 'run:create-project',
  runUseFolder: 'run:use-folder',
  runSetupInfo: 'run:setup-info',
  runSetChallenge: 'run:set-challenge',
  runAddFiles: 'run:add-files',
  runPickFiles: 'run:pick-files',
  runGithub: 'run:github',
  runPlan: 'run:plan',
  runAccept: 'run:accept',
  runRevise: 'run:revise',
  runAnswer: 'run:answer',
  runPause: 'run:pause',
  runResume: 'run:resume',
  runStop: 'run:stop',
  runReset: 'run:reset',
  runReconnect: 'run:reconnect',
  teamTestServer: 'team:test-server',
  events: 'events',
} as const
