import { app, BrowserWindow, dialog, ipcMain, nativeTheme, powerMonitor, powerSaveBlocker, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
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
import { HackforgeService } from './hackforge/HackforgeService'
import { builtinPlugin, choosePlugin, installedPlugin } from './hackforge/plugin'
import { EventService } from './event/EventService'
import { newMemberId, TeamService } from './team/TeamService'
import { PitchService } from './pitch/PitchService'
import { hackforgeLean, readHackforge } from './hackforge/HackforgeService'
import { hackforgeGuide } from '@shared/hackforge'
import { takeOverPrompt } from '@shared/handoff'
import { PhoneAlerts } from './system/phone'
import { ResetQueue } from './system/resetQueue'
import { PartnerService } from './event/PartnerService'
import { checkoutHandoff, planHandoff, pushSnapshot } from './team/handoff'
import { cancelPick, pickElement, type Rect } from './preview/pick'
import { DesignService } from './design/DesignService'
import { designGuide } from '@shared/design'

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
let team: TeamService
let pitch: PitchService
let partners: PartnerService
let resetQueue: ResetQueue
const design = new DesignService({
  appPath: app.getAppPath(),
  claudeDir,
  settings: () => settings.get().designSkills,
  push: (state) => broadcast(IPC.designPush, state),
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
/** HackForge loops seen running, so their end can be announced. */
const loopsRunning = new Set<string>()
const eventService = new EventService(
  () => settings?.get().eventProject ?? undefined,
  (state) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.eventPush, state)
  },
)
/** The HackForge sessions get: the copy built into Harness, unless an installed one is newer. */
const hackforgePlugin = () => choosePlugin(builtinPlugin(app.getAppPath()), installedPlugin(claudeDir))
const hackforge = new HackforgeService(hackforgePlugin, (snap) => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.hackforgeUpdate, snap)
  // An improvement loop that was running has ended: worth a ping when you're away.
  if (snap.loop?.active) loopsRunning.add(snap.cwd)
  else if (loopsRunning.delete(snap.cwd)) {
    const best = snap.loop?.bestScore
    void phone.alert('finished', 'HackForge loop finished', `${basename(snap.cwd)}${best !== undefined ? ` · best score ${best.toFixed(1)}` : ''}`, { tags: ['checkered_flag'] })
  }
})

/** macOS: inset traffic lights over a translucent sidebar. Windows/Linux: the standard frame and menu bar. */
function windowChrome(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
  }
  return { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f4f3f1', autoHideMenuBar: false }
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
    // An Auto session picks up on the model the saver last chose.
    const lastRoute = events.findLast((e) => e.type === 'saver' && e.note.kind === 'route')
    const saverTier = lastRoute?.type === 'saver' && lastRoute.note.kind === 'route' ? lastRoute.note.model : undefined
    const resumed = agents.start(
      { cwd: summary.cwd, permissionMode: opts?.permissionMode ?? settings.get().defaultPermissionMode, model: opts?.model ?? summary.model },
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
  ipcMain.handle(IPC.respondPermission, (_e, id: string, requestId: string, d: PermissionDecision) =>
    agents.respondPermission(id, requestId, d),
  )
  ipcMain.handle(IPC.pickDirectory, async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.hackforgeWatch, (_e, cwd: string) => hackforge.watch(cwd))
  ipcMain.on(IPC.hackforgeUnwatch, (_e, cwd: string) => hackforge.unwatch(cwd))
  ipcMain.handle(IPC.hackforgeOpenView, (_e, cwd: string, name: string) => shell.openPath(hackforge.viewPath(cwd, name)))
  ipcMain.handle(IPC.hackforgeStopLoop, (_e, cwd: string) => hackforge.stopLoop(cwd))
  ipcMain.handle(IPC.hackforgeSetProfile, (_e, cwd: string, profile: string) => hackforge.setProfile(cwd, profile))
  ipcMain.handle(IPC.eventState, () => eventService.state())
  ipcMain.handle(IPC.eventLink, (_e, dir: string | null) => {
    settings.update({ eventProject: dir })
    partners.changed()
    return eventService.state()
  })
  ipcMain.handle(IPC.eventSetup, async (_e, dir: string) => {
    settings.update({ eventProject: dir })
    settings.addRecentProject(dir)
    const state = await eventService.setup(dir)
    partners.changed()
    return state
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
  ipcMain.handle(IPC.updateSettings, (_e, patch) => {
    const before = settings.get().designSkills
    const next = settings.update(patch)
    if ('resetQueue' in patch) resetQueue.refresh()
    if ('designSkills' in patch) {
      // Switched impeccable on: fetch its engine now rather than in the first session.
      if (next.designSkills.impeccable && !before.impeccable) void design.prepare()
      else broadcast(IPC.designPush, design.state())
    }
    return next
  })
  ipcMain.handle(IPC.designState, () => design.state())
  ipcMain.handle(IPC.designPrepare, () => design.prepare())

  // Handoffs: put work on the team board, or take a teammate's.
  ipcMain.handle(IPC.handoffPlan, async (_e, sessionId: string) => {
    const s = store.get(sessionId)
    if (!s) throw new Error('Session not found')
    const member = settings.get().team?.memberName ?? null
    return { ...(await planHandoff(s.cwd, member ?? 'teammate')), member }
  })
  ipcMain.handle(IPC.handoffOffer, async (_e, o: { sessionId: string; title: string; note: string; reason: 'limit' | 'manual'; push: boolean }) => {
    const s = store.get(o.sessionId)
    if (!s) throw new Error('Session not found')
    const member = settings.get().team?.memberName ?? 'teammate'
    const plan = await planHandoff(s.cwd, member)
    let pushError: string | undefined
    let branch: string | undefined
    if (o.push && plan.git && plan.remote) {
      try {
        await pushSnapshot(s.cwd, plan.branch, `WIP handoff from ${member}: ${o.title}`.slice(0, 200), member)
        branch = plan.branch
      } catch (err) {
        pushError = err instanceof Error ? err.message : String(err)
      }
    }
    const state = team.offerHandoff({ id: randomUUID(), title: o.title.slice(0, 160), note: o.note, branch, repo: plan.repo, project: basename(s.cwd), reason: o.reason, createdAt: Date.now() })
    return { state, pushError }
  })
  ipcMain.handle(IPC.handoffWithdraw, (_e, id: string) => team.withdrawHandoff(id))
  ipcMain.handle(IPC.handoffTake, async (_e, id: string) => {
    const h = team.findHandoff(id)
    if (!h) throw new Error('That handoff is no longer on the board.')
    const project = settings.get().eventProject
    let dir: string
    if (h.branch) {
      if (!project) throw new Error('Link the team’s project in event mode first, so Harness knows which repository to check the work out from.')
      dir = await checkoutHandoff(project, h.branch, h.repo)
      const dirs = settings.get().handoffDirs
      if (!dirs.includes(dir)) settings.update({ handoffDirs: [dir, ...dirs].slice(0, 20) })
      partners.changed()
    } else if (project) dir = project
    else throw new Error('This handoff has no branch, and no event project is linked to open it in.')
    team.markTaken(id)
    settings.addRecentProject(dir)
    return { dir, prompt: takeOverPrompt(h.note) }
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
  ipcMain.handle(IPC.partnerSetKey, (_e, env: string, value: string | null, share?: boolean) => partners.setKey(env, value, share))
  ipcMain.handle(IPC.partnerSetShare, (_e, env: string, share: boolean) => partners.setShare(env, share))
  ipcMain.handle(IPC.partnerSetDocs, (_e, kitId: string, url: string) => partners.setDocs(kitId, url))
  ipcMain.handle(IPC.partnerAddCustom, (_e, opts) => partners.addCustom(opts))
  ipcMain.handle(IPC.partnerRemoveCustom, (_e, id: string) => partners.removeCustom(id))
  ipcMain.handle(IPC.partnerTest, (_e, kitId: string) => partners.test(kitId))
}

app.whenReady().then(start).catch((err: unknown) => {
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
    encrypt: (v) => (safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(v).toString('base64')}` : `plain:${Buffer.from(v).toString('base64')}`),
    decrypt: (stored) => {
      try {
        if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
        return safeStorage.decryptString(Buffer.from(stored.replace(/^enc:/, ''), 'base64'))
      } catch {
        return undefined
      }
    },
    projectDir: () => settings.get().eventProject ?? undefined,
    extraDirs: () => settings.get().handoffDirs,
    push: (state) => broadcast(IPC.partnersPush, state),
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
      const mode = settings.get().hackforgeMode
      const present = mode !== 'off' && hackforge.isProject(cwd)
      const hf = mode !== 'off' && (present || mode === 'always') ? hackforgeGuide(present) : undefined
      const loaded = design.plugins().filter((p) => p.source === 'builtin' || p.source === 'installed')
      const ds = designGuide({ impeccable: loaded.some((p) => p.key === 'impeccable'), uiUxProMax: loaded.some((p) => p.key === 'uiUxProMax') })
      return [hf, ds].filter(Boolean).join('\n\n') || undefined
    },
    // Every session (unless HackForge is off) gets the plugin, so /hackforge:init works in a new folder too.
    // Its hooks do nothing outside HackForge projects. The design skills (impeccable, UI/UX Pro Max) come too.
    plugins: () => {
      const p = hackforgePlugin()
      const hf = settings.get().hackforgeMode !== 'off' && p.source === 'builtin' && p.path ? [{ type: 'local' as const, path: p.path }] : []
      return [...hf, ...design.sdkPlugins()]
    },
    claudeExecutablePath: resolveClaudeExecutable(),
    onRateLimit: (info) => team?.onRateLimit(info),
    usageSaver: () => settings.get().usageSaver,
    hackforgeLean,
    teamRadar: (abs) => team?.radarFor(abs),
    extraEnv: (cwd) => ({ ...design.env(), ...partners.envFor(cwd) }),
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
    onAlert: (kind, title, body) => void phone.alert(kind, title, body, { tags: [kind === 'approvals' ? 'raised_hand' : 'white_check_mark'], priority: kind === 'approvals' ? 4 : 3 }),
  })
  presence.createTray()
  installMenu()
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(appIcon)
  if (!settings.get().teamMemberId) settings.update({ teamMemberId: newMemberId() })
  team = new TeamService({
    port: envPort('HARNESS_RELAY_PORT'),
    getConfig: () => settings.get().team,
    setConfig: (c) => settings.update({ team: c }),
    memberId: () => settings.get().teamMemberId,
    usesApiKey: () => settings.get().hasApiKey,
    planUsage: () => agents.planUsage(),
    projectDir: () => settings.get().eventProject ?? undefined,
    hackforge: async (dir) => {
      const s = await readHackforge(dir, hackforgePlugin)
      if (!s.present) return undefined
      return { phase: s.state.phase, milestone: s.state.milestone, mockScore: s.verify?.mockScore ?? s.state.latestMockScore, loopIteration: s.loop?.iteration, loopActive: s.loop?.active }
    },
    push: (state) => {
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.teamPush, state)
      // New usage readings can move (or reveal) the reset time.
      resetQueue?.refresh()
      const u = state.myUsage
      const live = (w?: { pct: number; resetsAt?: number }) => (w && (!w.resetsAt || w.resetsAt > Date.now()) ? w.pct : w ? 0 : undefined)
      if (u.source === 'plan') store.recordPlanSample(live(u.fiveHour), live(u.sevenDay))
    },
    today: () => store.usageToday(),
    sharedSecrets: () => partners.sharedSecrets(),
    onTeamKeys: (keys) => partners.setTeamKeys(keys),
    onConflicts: (list) => {
      const c = list[0]
      const others = c.members.filter((m) => m.id !== settings.get().teamMemberId).map((m) => m.name)
      const title = list.length > 1 ? `${list.length} files are being changed by two people` : `${others.join(' and ')} is also changing ${c.path.split('/').pop()}`
      const body =
        list.length > 1
          ? list.slice(0, 3).map((x) => x.path).join(', ')
          : `${c.overlap === 'lines' ? 'Same lines: merging will conflict.' : 'Different parts of the file.'} Agree who merges first.`
      presence.notifyApp(title, body)
      void phone.alert('team', title, body, { tags: ['warning'] })
    },
    onHandoff: (h) => {
      presence.notifyApp(`${h.fromName} handed off work`, `${h.title} · open the Team board to take it over`)
      void phone.alert('team', `${h.fromName} handed off work`, h.title, { tags: ['handshake'], priority: 4 })
    },
    onLimitReached: (resetsAt) => {
      const at = resetsAt ? new Date(resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
      void phone.alert('limits', 'Claude usage limit reached', `${at ? `Resets ${at}. ` : ''}Hand off to a teammate, or queue messages to run at the reset.`, { tags: ['hourglass'], priority: 4 })
    },
  })
  team.start()
  resetQueue = new ResetQueue({
    file: join(app.getPath('userData'), 'reset-queue.json'),
    settings: () => settings.get().resetQueue,
    usage: () => team.state().myUsage,
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
  hackforge.dispose()
  eventService.dispose()
  team?.dispose()
  pitch?.dispose()
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
