import { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, powerSaveBlocker, safeStorage, shell } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isAdvisorChoice, type AdvisorChoice } from '@shared/advisor'
import { eccEnv } from '@shared/ecc'
import { IPC, type ObserveStatus, type PermissionDecision, type PtyOptions, type StartSessionOptions } from '@shared/ipc'
import type { ImageAttachment, PermissionMode, TodoItem } from '@shared/events'
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
import { PitchService } from './pitch/PitchService'
import { CartoonSkill } from './pitch/CartoonSkill'
import { Kit3dService } from './kit3d/Kit3dService'
import type { Kit3dQuality } from '@shared/kit3d'
import { PhoneAlerts } from './system/phone'
import { ResetQueue } from './system/resetQueue'
import { PartnerService } from './keys/PartnerService'
import { UsageMonitor } from './system/UsageMonitor'
import { cancelPick, pickElement, type Rect } from './preview/pick'
import { chooseEcc, eccInfo } from './ecc/plugin'
import { installedNamed } from './plugins/bundled'
import { DesignService } from './design/DesignService'
import { designGuide } from '@shared/design'
import { DevToolsService } from './devtools/DevToolsService'
import { BlenderService } from './devtools/blender'

// Tests (and a second, throwaway profile) can keep everything out of the real profile folder.
if (process.env.HARNESS_USER_DATA) app.setPath('userData', process.env.HARNESS_USER_DATA)
/** Optional port overrides, so a test instance doesn't collide with a running Harness. */
const envPort = (name: string) => Number(process.env[name]) || undefined

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
let usage: UsageMonitor
let pitch: PitchService
let cartoon: CartoonSkill
let kit3d: Kit3dService
let partners: PartnerService
let resetQueue: ResetQueue
const design = new DesignService({
  appPath: app.getAppPath(),
  claudeDir,
  settings: () => settings.get().designSkills,
  push: (state) => broadcast(IPC.designPush, state),
})
const blender = new BlenderService({ dataDir: app.getPath('userData') })
const devTools = new DevToolsService({
  appPath: app.getAppPath(),
  dataDir: app.getPath('userData'),
  blender,
  settings: () => settings.get().devTools,
  context7Key: () => settings.getContext7Key(),
  partnerServers: (cwd) => partners?.mcpServers(cwd) ?? [],
  projectDir: () => settings.get().project ?? undefined,
  push: (state) => broadcast(IPC.devToolsPush, state),
})
/** Sends to every window (there's normally one). */
const broadcast = (channel: string, payload: unknown) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}
const phone = new PhoneAlerts({
  settings: () => settings.get().phoneAlerts,
  // Away = screen locked, or no keyboard/mouse input for 90 seconds.
  away: () => powerMonitor.getSystemIdleState(90) !== 'active',
})
/** ECC: the built-in copy, or the user's installed ecc@ecc when it's newer. */
const eccPlugin = () => chooseEcc(app.getAppPath(), claudeDir)
/** macOS: inset traffic lights over the graphite rail. Windows/Linux: the standard frame and menu bar. */
function windowChrome(): Electron.BrowserWindowConstructorOptions {
  // The rail's colour (styles.css --rail), so the window never flashes another one while loading.
  const backgroundColor = nativeTheme.shouldUseDarkColors ? '#0e0f14' : '#15161d'
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, backgroundColor }
  return { backgroundColor, autoHideMenuBar: false }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Harness',
    icon: appIcon,
    ...windowChrome(),
    show: false,
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
    },
  })

  win.once('ready-to-show', () => win.show())
  bus.attach(win.webContents)

  // A file dropped on the window must not replace the app with it.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })
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

/** Makes a folder the current project: API keys, partner servers, the promo video and the 3D kit follow it. */
async function setProject(dir: string | null) {
  settings.update({ project: dir })
  if (dir) settings.addRecentProject(dir)
  partners.changed()
  devTools.publish()
  pitch.refresh()
  broadcast(IPC.kit3dPush, await kit3d.state(true))
  return settings.get()
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
  ipcMain.handle(IPC.resumeSession, (_e, id: string, opts?: { permissionMode?: PermissionMode; model?: string; advisor?: AdvisorChoice }) => {
    const loaded = store.load(id)
    if (!loaded) throw new Error('Session not found')
    const { summary, events } = loaded
    if (agents.isLive(id)) return summary
    detachedTrackers.get(id)?.dispose()
    detachedTrackers.delete(id)
    if (!summary.claudeSessionId) throw new Error('This session never reached Claude, so there is no conversation to resume.')
    const lastTodos = events.findLast((e) => e.type === 'todo.update')
    const todos: TodoItem[] = lastTodos?.type === 'todo.update' ? lastTodos.todos : []
    // An Auto session picks up on the model the saver last chose.
    const lastRoute = events.findLast((e) => e.type === 'saver' && e.note.kind === 'route')
    const saverTier = lastRoute?.type === 'saver' && lastRoute.note.kind === 'route' ? lastRoute.note.model : undefined
    const resumed = agents.start(
      {
        cwd: summary.cwd,
        permissionMode: opts?.permissionMode ?? settings.get().defaultPermissionMode,
        model: opts?.model ?? summary.model,
        advisor: isAdvisorChoice(opts?.advisor) ? opts.advisor : undefined,
      },
      { summary, claudeSessionId: summary.claudeSessionId, todos, saverTier },
    )
    store.open(resumed)
    settings.addRecentProject(summary.cwd)
    return resumed
  })
  ipcMain.handle(IPC.sendMessage, (_e, id: string, text: string, images?: ImageAttachment[]) => agents.send(id, text, images))
  ipcMain.handle(IPC.interrupt, (_e, id: string) => agents.interrupt(id))
  ipcMain.handle(IPC.closeSession, (_e, id: string) => agents.close(id))
  ipcMain.handle(IPC.setPermissionMode, (_e, id: string, mode: PermissionMode) => agents.setPermissionMode(id, mode))
  ipcMain.handle(IPC.setModel, (_e, id: string, model: string) => agents.setModel(id, model))
  ipcMain.handle(IPC.respondPermission, (_e, id: string, requestId: string, d: PermissionDecision) => agents.respondPermission(id, requestId, d))
  ipcMain.handle(IPC.pickDirectory, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.setElevenLabsKey, (_e, key: string | null) => {
    settings.setElevenLabsKey(key)
    return settings.get()
  })
  ipcMain.handle(IPC.setContext7Key, (_e, key: string | null) => {
    settings.setContext7Key(key)
    devTools.publish()
    return settings.get()
  })
  ipcMain.handle(IPC.pitchState, () => pitch.state())
  ipcMain.handle(IPC.pitchScaffold, (_e, name: string) => pitch.scaffold(name))
  ipcMain.handle(IPC.pitchChoose, (_e, choice, name: string) => pitch.choose(choice, name))
  ipcMain.handle(IPC.pitchInstallCartoon, async () => {
    await cartoon.install()
    return pitch.state()
  })
  ipcMain.handle(IPC.pitchSave, (_e, script) => pitch.saveScript(script))
  ipcMain.handle(IPC.pitchInstall, () => pitch.install())
  ipcMain.handle(IPC.pitchNarrate, () => pitch.narrate())
  ipcMain.handle(IPC.pitchVoices, () => pitch.voices())
  ipcMain.handle(IPC.kit3dState, () => kit3d.state(true))
  ipcMain.handle(IPC.kit3dSetup, () => kit3d.setup())
  ipcMain.handle(IPC.kit3dCapture, () => kit3d.capture())
  ipcMain.handle(IPC.kit3dStills, (_e, clip: string) => kit3d.stills(clip))
  ipcMain.handle(IPC.kit3dRender, (_e, clip: string, quality: Kit3dQuality) => kit3d.render(clip, quality))
  ipcMain.handle(IPC.kit3dCancel, () => kit3d.cancel())
  ipcMain.handle(IPC.kit3dAddToPitch, (_e, clip: string) => kit3d.addToPitch(clip))
  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.setApiKey, (_e, key: string | null) => settings.setApiKey(key))
  ipcMain.handle(IPC.updateSettings, (_e, patch) => {
    const before = settings.get().designSkills
    const next = settings.update(patch)
    if ('resetQueue' in patch) resetQueue.refresh()
    if ('designSkills' in patch) {
      // Switched impeccable on: fetch its engine now rather than in the first session.
      if (next.designSkills.impeccable && !before.impeccable) void design.prepare()
      else broadcast(IPC.designPush, design.state())
    }
    if ('devTools' in patch || 'project' in patch) devTools.publish()
    return next
  })
  ipcMain.handle(IPC.projectSet, (_e, dir: string | null) => setProject(dir))
  ipcMain.handle(IPC.usageState, () => usage.state())
  ipcMain.handle(IPC.designState, () => design.state())
  ipcMain.handle(IPC.designPrepare, () => design.prepare())
  ipcMain.handle(IPC.devToolsState, () => devTools.stateFresh())
  ipcMain.handle(IPC.eccInfo, () => {
    const p = eccPlugin()
    return eccInfo(p, p.source === 'installed' ? installedNamed(claudeDir, 'ecc')?.path : undefined)
  })
  ipcMain.handle(IPC.devToolsInstallBrowser, () => devTools.installBrowser())
  ipcMain.handle(IPC.devToolsInstallRea, () => devTools.installRea())
  ipcMain.handle(IPC.devToolsSetupBlender, () => devTools.setupBlender())
  ipcMain.handle(IPC.devToolsOpenBlender, (_e, file?: string) => devTools.openBlender(file))
  ipcMain.handle(IPC.previewPickModel, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: '3D models', extensions: ['glb', 'gltf'] }] })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  // Run when the limit resets.
  ipcMain.handle(IPC.resetQueueState, () => resetQueue.state())
  ipcMain.handle(IPC.resetQueueAdd, (_e, item) => resetQueue.add(item))
  ipcMain.handle(IPC.resetQueueRemove, (_e, id: string) => resetQueue.remove(id))
  ipcMain.on(IPC.resetQueueDone, (_e, id: string) => resetQueue.done(id))

  ipcMain.handle(IPC.phoneTest, () => phone.test())
  ipcMain.handle(IPC.previewPick, (e, url: string, frame: Rect) => pickElement(e.sender, url, frame))
  ipcMain.handle(IPC.previewPickCancel, (e, url: string) => cancelPick(e.sender, url))
  ipcMain.handle(IPC.usageHistory, (_e, days: number) => store.usageHistory(Math.max(1, Math.min(90, Math.round(days) || 14))))

  // Partner API keys.
  ipcMain.handle(IPC.partnersState, () => partners.state())
  ipcMain.handle(IPC.partnerSetKey, (_e, env: string, value: string | null) => partners.setKey(env, value))
  ipcMain.handle(IPC.partnerSetDocs, (_e, kitId: string, url: string) => partners.setDocs(kitId, url))
  ipcMain.handle(IPC.partnerSetMcp, (_e, kitId: string, url: string) => partners.setMcp(kitId, url))
  ipcMain.handle(IPC.partnerAdd, (_e, opts: { key: string; name?: string }) => partners.addKey(opts))
  ipcMain.handle(IPC.partnerRemove, (_e, id: string) => partners.remove(id))
  ipcMain.handle(IPC.partnerTest, (_e, kitId: string) => partners.test(kitId))
}

app
  .whenReady()
  .then(start)
  .catch((err: unknown) => {
    // Fail loudly rather than run with no window.
    console.error(err)
    dialog.showErrorBox('Harness could not start', err instanceof Error ? (err.stack ?? err.message) : String(err))
    app.exit(1)
  })

async function start() {
  // Windows only shows notifications for apps with an AppUserModelID (matches appId in electron-builder.yml).
  if (process.platform === 'win32') app.setAppUserModelId('dev.harness.app')
  handleFileScheme()
  await telemetry.start()
  settings = new SettingsStore()
  store = new SessionStore(join(app.getPath('userData'), 'harness.db'))
  partners = new PartnerService({
    file: join(app.getPath('userData'), 'partner-keys.json'),
    // Keychain (macOS) / DPAPI (Windows) when available. Without one (some Linux setups) the key is
    // kept in an owner-only file instead: it goes into the project's .env in plain text anyway.
    encrypt: (v) =>
      safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(v).toString('base64')}` : `plain:${Buffer.from(v).toString('base64')}`,
    decrypt: (stored) => {
      try {
        if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
        return safeStorage.decryptString(Buffer.from(stored.replace(/^enc:/, ''), 'base64'))
      } catch {
        return undefined
      }
    },
    projectDir: () => settings.get().project ?? undefined,
    push: (state) => {
      broadcast(IPC.partnersPush, state)
      // A key set or removed changes which partner servers sessions get.
      devTools.publish()
    },
  })
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
      const loaded = design.plugins().filter((p) => p.source === 'builtin' || p.source === 'installed')
      const ds = designGuide({ impeccable: loaded.some((p) => p.key === 'impeccable'), uiUxProMax: loaded.some((p) => p.key === 'uiUxProMax') })
      return [ds, devTools.guide(cwd)].filter(Boolean).join('\n\n') || undefined
    },
    // Every session gets ECC and the design skills (impeccable, UI/UX Pro Max).
    plugins: () => {
      // ECC in every session: its agents, skills, commands and hooks (an installed copy loads by itself).
      const e = eccPlugin()
      const ecc = settings.get().ecc.enabled && e.source === 'builtin' && e.path ? [{ type: 'local' as const, path: e.path }] : []
      // The cartoon short skill, once you picked it in Project › Promo (it's downloaded then).
      const extra = cartoon?.plugin()
      return [...ecc, ...design.sdkPlugins(), ...(extra ? [extra] : [])]
    },
    claudeExecutablePath: resolveClaudeExecutable(),
    onRateLimit: (info) => usage?.onRateLimit(info),
    usageSaver: () => settings.get().usageSaver,
    advisor: () => settings.get().advisor,
    extraEnv: (cwd) => ({ ...design.env(), ...eccEnv(settings.get().ecc), ...partners.envFor(cwd) }),
    mcp: (cwd) => ({ servers: devTools.mcpServers(cwd), allow: devTools.allowedTools(cwd) }),
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
  await hookBridge.start(envPort('HARNESS_HOOK_PORT'))
  if (settings.get().observeTerminalSessions) await observer.start()
  presence = new Presence({
    bus,
    describe: (id) => {
      const s = store.get(id)
      return s ? { title: s.title, project: projectName(s.cwd) } : null
    },
    notificationsEnabled: () => settings.get().notifications,
    onAlert: (kind, title, body) =>
      void phone.alert(kind, title, body, { tags: [kind === 'approvals' ? 'raised_hand' : 'white_check_mark'], priority: kind === 'approvals' ? 4 : 3 }),
  })
  presence.createTray()
  installMenu()
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
  usage = new UsageMonitor({
    usesApiKey: () => settings.get().hasApiKey,
    planUsage: () => agents.planUsage(),
    push: (u) => {
      broadcast(IPC.usagePush, u)
      // New readings can move (or reveal) the reset time.
      resetQueue?.refresh()
      const live = (w?: { pct: number; resetsAt?: number }) => (w && (!w.resetsAt || w.resetsAt > Date.now()) ? w.pct : w ? 0 : undefined)
      if (u.source === 'plan') store.recordPlanSample(live(u.fiveHour), live(u.sevenDay))
    },
    onLimitReached: (resetsAt) => {
      const at = resetsAt ? new Date(resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
      void phone.alert('limits', 'Claude usage limit reached', `${at ? `Resets ${at}. ` : ''}Queue messages to run at the reset.`, { tags: ['hourglass'], priority: 4 })
    },
  })
  usage.start()
  resetQueue = new ResetQueue({
    file: join(app.getPath('userData'), 'reset-queue.json'),
    settings: () => settings.get().resetQueue,
    usage: () => usage.state(),
    push: (state) => broadcast(IPC.resetQueuePush, state),
    fire: (items) => {
      const w = BrowserWindow.getAllWindows()[0]
      if (!w) return false
      w.webContents.send(IPC.resetQueueFire, items)
      return true
    },
    onRan: () => void phone.alert('limits', 'Queued messages started', 'Your usage limit reset and Harness sent what you queued.', { tags: ['alarm_clock'] }),
    block: () => powerSaveBlocker.start('prevent-app-suspension'),
    unblock: (id) => powerSaveBlocker.stop(id),
  })
  resetQueue.start()
  // Waking from sleep after the reset: catch up straight away.
  powerMonitor.on('resume', () => resetQueue.check())
  partners.changed()
  cartoon = new CartoonSkill({ dir: join(app.getPath('userData'), 'skills'), onChange: () => pitch?.refresh() })
  pitch = new PitchService({
    cartoon: () => cartoon.state(),
    projectDir: () => settings.get().project ?? undefined,
    elevenLabsKey: () => settings.getElevenLabsKey(),
    templateDir: join(app.getAppPath(), 'resources', 'pitch-template'),
    push: (state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.pitchPush, state)
    },
  })
  kit3d = new Kit3dService({
    projectDir: () => settings.get().project ?? undefined,
    templateDir: () => join(app.getAppPath(), 'resources', 'kit3d'),
    push: (state) => broadcast(IPC.kit3dPush, state),
    browserPath: () => devTools.browser().path,
    node: { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } },
  })
  registerIpc()
  createWindow()
  // impeccable's detector engine: fetched once per computer, in the background.
  if (settings.get().designSkills.impeccable) setTimeout(() => void design.prepare(), 8000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('before-quit', () => {
  agents?.closeAll()
  ptys.killAll()
  presence?.destroy()
  preview.stopAll()
  usage?.dispose()
  pitch?.dispose()
  kit3d?.dispose()
  resetQueue?.dispose()
  partners?.dispose()
  observer?.stop()
  hookBridge?.stop()
  store?.close()
  telemetry.stop()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
