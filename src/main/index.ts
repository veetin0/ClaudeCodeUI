import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { IPC, type ObserveStatus, type PermissionDecision, type PtyOptions, type StartSessionOptions } from '@shared/ipc'
import type { PermissionMode, TodoItem } from '@shared/events'
import { AgentService } from './agent/AgentService'
import { EventBus } from './events/bus'
import { SessionStore } from './store/SessionStore'
import { ChangeTracker } from './project/ChangeTracker'
import { listFiles } from './project/projectFiles'
import { agentEnv, loadLoginShellPath, resolveClaudeExecutable } from './system/environment'
import { handleFileScheme, registerFileScheme } from './system/fileProtocol'
import { TelemetryServer } from './system/telemetry'
import { HookBridge, hooksInstalled, updateClaudeSettings, withHarnessHooks, withoutHarnessHooks } from './observe/hooks'
import { TranscriptObserver } from './observe/TranscriptObserver'
import { PtyService } from './pty/PtyService'
import { PreviewService } from './preview/PreviewService'
import { EXEC_TOOLS } from '@shared/events'
import { installMenu } from './system/menu'
import { Presence, projectName } from './system/presence'
import appIcon from '../../resources/icon.png?asset'
import { SettingsStore } from './system/settings'
import { HackforgeService } from './hackforge/HackforgeService'
import { EventService } from './event/EventService'
import { newMemberId, TeamService } from './team/TeamService'
import { PitchService } from './pitch/PitchService'
import { readHackforge } from './hackforge/HackforgeService'
import { hackforgeGuide } from '@shared/hackforge'

loadLoginShellPath()
registerFileScheme()

const bus = new EventBus()
const telemetry = new TelemetryServer()
const preview = new PreviewService((state) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.previewStateUpdate, state)
})
const ptys = new PtyService((cwd, data) => preview.noteOutput(data, 'terminal', cwd))
const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const claudeSettingsPath = join(claudeDir, 'settings.json')
let observer: TranscriptObserver
let hookBridge: HookBridge
let settings: SettingsStore
let store: SessionStore
let agents: AgentService
let presence: Presence
let team: TeamService
let pitch: PitchService
const eventService = new EventService(
  () => settings?.get().eventProject ?? undefined,
  (state) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.eventPush, state)
  },
)
const hackforge = new HackforgeService(claudeSettingsPath, (snap) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.hackforgeUpdate, snap)
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Harness',
    icon: appIcon,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: 'sidebar',
    visualEffectState: 'followWindow',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  bus.attach(win.webContents)

  // Open links in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
}

/** Saved sessions get a tracker too, so their diffs can be reviewed and reverted without resuming. */
const detachedTrackers = new Map<string, ChangeTracker>()
function trackerFor(id: string): ChangeTracker {
  const live = agents.tracker(id)
  if (live) return live
  let t = detachedTrackers.get(id)
  if (!t) {
    const summary = store.get(id)
    if (!summary) throw new Error('Session not found')
    t = new ChangeTracker(id, summary.cwd, store, (e) => bus.emit(e))
    detachedTrackers.set(id, t)
  }
  return t
}

async function observeStatus(): Promise<ObserveStatus> {
  return {
    enabled: settings.get().observeTerminalSessions,
    hooksInstalled: await hooksInstalled(claudeSettingsPath),
    hookPort: hookBridge.port,
    settingsPath: claudeSettingsPath,
    watching: observer.count,
  }
}

function registerIpc() {
  ipcMain.handle(IPC.observeStatus, () => observeStatus())
  ipcMain.handle(IPC.observeEnable, async (_e, enabled: boolean) => {
    settings.update({ observeTerminalSessions: enabled })
    if (enabled) await observer.start()
    else observer.stop()
    return observeStatus()
  })
  ipcMain.handle(IPC.observeInstallHooks, async () => {
    await updateClaudeSettings(claudeSettingsPath, (s) => withHarnessHooks(s))
    return observeStatus()
  })
  ipcMain.handle(IPC.observeRemoveHooks, async () => {
    await updateClaudeSettings(claudeSettingsPath, withoutHarnessHooks)
    return observeStatus()
  })
  ipcMain.on(IPC.activeSession, (_e, id: string | null) => presence.setActiveSession(id))
  ipcMain.handle(IPC.previewDetect, (_e, cwd: string) => preview.detect(cwd))
  ipcMain.handle(IPC.previewState, () => preview.state())
  ipcMain.handle(IPC.startStudio, (_e, cwd: string) => preview.startStudio(cwd))
  ipcMain.handle(IPC.startScript, (_e, cwd: string, script: string) => preview.startScript(cwd, script))
  ipcMain.handle(IPC.stopServer, (_e, id: string) => preview.stop(id))
  ipcMain.handle(IPC.listCompositions, (_e, cwd: string) => preview.compositions(cwd))
  ipcMain.handle(IPC.render, (_e, cwd: string, composition: string) => preview.render(cwd, composition))
  ipcMain.handle(IPC.cancelRender, (_e, id: string) => preview.cancelRender(id))
  ipcMain.handle(IPC.revealFile, (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    // Only local dev servers and web pages; never file:// or custom schemes.
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle(IPC.ptyCreate, (e, opts: PtyOptions) => ptys.create(e.sender, opts))
  ipcMain.on(IPC.ptyWrite, (_e, id: string, data: string) => ptys.write(id, data))
  ipcMain.on(IPC.ptyResize, (_e, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on(IPC.ptyKill, (_e, id: string) => ptys.kill(id))

  ipcMain.handle(IPC.startSession, (_e, opts: StartSessionOptions) => {
    settings.addRecentProject(opts.cwd)
    const summary = agents.start(opts)
    store.open(summary)
    return summary
  })
  ipcMain.handle(IPC.listHistory, () => store.list())
  ipcMain.handle(IPC.listFiles, (_e, cwd: string) => listFiles(cwd))
  ipcMain.handle(IPC.getFileDiff, (_e, id: string, path: string) => trackerFor(id).diff(path))
  ipcMain.handle(IPC.revertFile, (_e, id: string, path: string) => trackerFor(id).revert(path))
  ipcMain.handle(IPC.acceptFile, (_e, id: string, path: string) => trackerFor(id).accept(path))
  ipcMain.handle(IPC.loadSession, (_e, id: string) => store.load(id))
  ipcMain.handle(IPC.deleteSession, (_e, id: string) => {
    agents.close(id)
    store.delete(id)
  })
  ipcMain.handle(IPC.resumeSession, (_e, id: string, opts?: { permissionMode?: PermissionMode; model?: string }) => {
    const loaded = store.load(id)
    if (!loaded) throw new Error('Session not found')
    const { summary, events } = loaded
    if (agents.isLive(id)) return summary
    detachedTrackers.get(id)?.dispose()
    detachedTrackers.delete(id)
    if (!summary.claudeSessionId) throw new Error('This session never reached Claude, so there is no conversation to resume.')
    const lastTodos = events.findLast((e) => e.type === 'todo.update')
    const todos: TodoItem[] = lastTodos?.type === 'todo.update' ? lastTodos.todos : []
    const resumed = agents.start(
      { cwd: summary.cwd, permissionMode: opts?.permissionMode ?? settings.get().defaultPermissionMode, model: opts?.model ?? summary.model },
      { summary, claudeSessionId: summary.claudeSessionId, todos },
    )
    store.open(resumed)
    settings.addRecentProject(summary.cwd)
    return resumed
  })
  ipcMain.handle(IPC.sendMessage, (_e, id: string, text: string) => agents.send(id, text))
  ipcMain.handle(IPC.interrupt, (_e, id: string) => agents.interrupt(id))
  ipcMain.handle(IPC.closeSession, (_e, id: string) => agents.close(id))
  ipcMain.handle(IPC.setPermissionMode, (_e, id: string, mode: PermissionMode) => agents.setPermissionMode(id, mode))
  ipcMain.handle(IPC.setModel, (_e, id: string, model: string) => agents.setModel(id, model))
  ipcMain.handle(IPC.respondPermission, (_e, id: string, requestId: string, d: PermissionDecision) =>
    agents.respondPermission(id, requestId, d),
  )
  ipcMain.handle(IPC.pickDirectory, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.hackforgeWatch, (_e, cwd: string) => hackforge.watch(cwd))
  ipcMain.on(IPC.hackforgeUnwatch, (_e, cwd: string) => hackforge.unwatch(cwd))
  ipcMain.handle(IPC.hackforgeStopLoop, (_e, cwd: string) => hackforge.stopLoop(cwd))
  ipcMain.handle(IPC.hackforgeSetProfile, (_e, cwd: string, profile: string) => hackforge.setProfile(cwd, profile))
  ipcMain.handle(IPC.eventState, () => eventService.state())
  ipcMain.handle(IPC.eventLink, (_e, dir: string | null) => {
    settings.update({ eventProject: dir })
    return eventService.state()
  })
  ipcMain.handle(IPC.eventSetup, async (_e, dir: string) => {
    settings.update({ eventProject: dir })
    settings.addRecentProject(dir)
    return eventService.setup(dir)
  })
  ipcMain.handle(IPC.eventUpdate, (_e, patch) => eventService.updateProgress(patch))
  ipcMain.handle(IPC.challengeAdd, (_e, c) => eventService.addChallenge(c))
  ipcMain.handle(IPC.challengeUpdate, (_e, id: string, patch) => eventService.updateChallenge(id, patch))
  ipcMain.handle(IPC.challengeDelete, (_e, id: string) => eventService.deleteChallenge(id))
  ipcMain.handle(IPC.challengeChoose, (_e, id: string) => eventService.chooseChallenge(id))
  ipcMain.handle(IPC.setElevenLabsKey, (_e, key: string | null) => {
    settings.setElevenLabsKey(key)
    return settings.get()
  })
  ipcMain.handle(IPC.pitchState, () => pitch.state())
  ipcMain.handle(IPC.pitchScaffold, (_e, name: string) => pitch.scaffold(name))
  ipcMain.handle(IPC.pitchSave, (_e, script) => pitch.saveScript(script))
  ipcMain.handle(IPC.pitchInstall, () => pitch.install())
  ipcMain.handle(IPC.pitchNarrate, () => pitch.narrate())
  ipcMain.handle(IPC.pitchVoices, () => pitch.voices())
  ipcMain.handle(IPC.teamState, () => team.state())
  ipcMain.handle(IPC.teamCreate, (_e, opts: { name: string; host: boolean; relayUrl?: string }) => team.create(opts))
  ipcMain.handle(IPC.teamJoin, (_e, code: string, name: string) => team.join(code, name))
  ipcMain.handle(IPC.teamLeave, () => team.leave())
  ipcMain.handle(IPC.teamUpdate, (_e, patch: { name?: string; focus?: string }) => team.update(patch))
  ipcMain.on(IPC.teamSetLocal, (_e, local) => team.setLocal(local))
  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.setApiKey, (_e, key: string | null) => settings.setApiKey(key))
  ipcMain.handle(IPC.updateSettings, (_e, patch) => settings.update(patch))
}

app.whenReady().then(start).catch((err: unknown) => {
  // Fail loudly rather than run with no window.
  console.error(err)
  dialog.showErrorBox('Harness could not start', err instanceof Error ? (err.stack ?? err.message) : String(err))
  app.exit(1)
})

async function start() {
  handleFileScheme()
  await telemetry.start()
  settings = new SettingsStore()
  store = new SessionStore(join(app.getPath('userData'), 'harness.db'))
  bus.subscribe((e) => store.record(e))
  // Dev servers an agent starts announce their URL in command output; offer them in Preview.
  const execCalls = new Set<string>()
  bus.subscribe((e) => {
    if (e.type === 'tool.start' && EXEC_TOOLS.has(e.name)) execCalls.add(e.toolUseId)
    else if (e.type === 'tool.end' && execCalls.delete(e.toolUseId)) preview.noteOutput(e.output, 'command', store.get(e.sessionId)?.cwd)
  })
  agents = new AgentService({
    bus,
    telemetry,
    snapshots: store,
    promptAppend: (cwd) => {
      const mode = settings.get().hackforgeMode
      if (mode === 'off') return undefined
      const present = hackforge.isProject(cwd)
      return present || mode === 'always' ? hackforgeGuide(present) : undefined
    },
    claudeExecutablePath: resolveClaudeExecutable(),
    onRateLimit: (info) => team?.onRateLimit(info),
    getEnv: () => {
      const key = settings.getApiKey()
      return agentEnv(key ? { ANTHROPIC_API_KEY: key } : {})
    },
  })
  observer = new TranscriptObserver({
    emit: (e) => bus.emit(e),
    open: (summary) => store.open(summary),
    isOwned: (sid) => agents.ownsClaudeSession(sid),
    projectsDir: join(claudeDir, 'projects'),
  })
  hookBridge = new HookBridge((input) => observer.onHook(input))
  await hookBridge.start()
  if (settings.get().observeTerminalSessions) await observer.start()
  presence = new Presence({
    bus,
    describe: (id) => {
      const s = store.get(id)
      return s ? { title: s.title, project: projectName(s.cwd) } : null
    },
    notificationsEnabled: () => settings.get().notifications,
  })
  presence.createTray()
  installMenu()
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
  if (!settings.get().teamMemberId) settings.update({ teamMemberId: newMemberId() })
  team = new TeamService({
    getConfig: () => settings.get().team,
    setConfig: (c) => settings.update({ team: c }),
    memberId: () => settings.get().teamMemberId,
    usesApiKey: () => settings.get().hasApiKey,
    planUsage: () => agents.planUsage(),
    projectDir: () => settings.get().eventProject ?? undefined,
    hackforge: async (dir) => {
      const s = await readHackforge(dir, claudeSettingsPath)
      if (!s.present) return undefined
      return { phase: s.state.phase, milestone: s.state.milestone, mockScore: s.verify?.mockScore ?? s.state.latestMockScore, loopIteration: s.loop?.iteration, loopActive: s.loop?.active }
    },
    push: (state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.teamPush, state)
    },
  })
  team.start()
  pitch = new PitchService({
    projectDir: () => settings.get().eventProject ?? undefined,
    elevenLabsKey: () => settings.getElevenLabsKey(),
    templateDir: join(app.getAppPath(), 'resources', 'pitch-template'),
    push: (state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.pitchPush, state)
    },
  })
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('before-quit', () => {
  agents?.closeAll()
  ptys.killAll()
  presence?.destroy()
  preview.stopAll()
  hackforge.dispose()
  eventService.dispose()
  team?.dispose()
  pitch?.dispose()
  observer?.stop()
  hookBridge?.stop()
  store?.close()
  telemetry.stop()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
