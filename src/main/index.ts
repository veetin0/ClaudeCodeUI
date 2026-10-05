import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC, type PermissionDecision, type StartSessionOptions } from '@shared/ipc'
import type { PermissionMode, TodoItem } from '@shared/events'
import { AgentService } from './agent/AgentService'
import { EventBus } from './events/bus'
import { SessionStore } from './store/SessionStore'
import { ChangeTracker } from './project/ChangeTracker'
import { listFiles } from './project/projectFiles'
import { agentEnv, loadLoginShellPath, resolveClaudeExecutable } from './system/environment'
import { handleFileScheme, registerFileScheme } from './system/fileProtocol'
import { TelemetryServer } from './system/telemetry'
import { SettingsStore } from './system/settings'

loadLoginShellPath()
registerFileScheme()

const bus = new EventBus()
const telemetry = new TelemetryServer()
let settings: SettingsStore
let store: SessionStore
let agents: AgentService
let waitingCount = 0

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Harness',
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

/** Dock badge counts sessions waiting on a permission decision. */
function trackWaiting() {
  const waiting = new Set<string>()
  bus.subscribe((e) => {
    if (e.type !== 'status') return
    if (e.status === 'waiting') waiting.add(e.sessionId)
    else waiting.delete(e.sessionId)
    if (waiting.size !== waitingCount) {
      waitingCount = waiting.size
      app.dock?.setBadge(waitingCount ? String(waitingCount) : '')
      if (waitingCount && !BrowserWindow.getFocusedWindow()) app.dock?.bounce('informational')
    }
  })
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

function registerIpc() {
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
  ipcMain.handle(IPC.getSettings, () => settings.get())
  ipcMain.handle(IPC.setApiKey, (_e, key: string | null) => settings.setApiKey(key))
  ipcMain.handle(IPC.updateSettings, (_e, patch) => settings.update(patch))
}

app.whenReady().then(async () => {
  handleFileScheme()
  await telemetry.start()
  settings = new SettingsStore()
  store = new SessionStore(join(app.getPath('userData'), 'harness.db'))
  bus.subscribe((e) => store.record(e))
  agents = new AgentService({
    bus,
    telemetry,
    snapshots: store,
    claudeExecutablePath: resolveClaudeExecutable(),
    getEnv: () => {
      const key = settings.getApiKey()
      return agentEnv(key ? { ANTHROPIC_API_KEY: key } : {})
    },
  })
  registerIpc()
  trackWaiting()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  agents?.closeAll()
  store?.close()
  telemetry.stop()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
