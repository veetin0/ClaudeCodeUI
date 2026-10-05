import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC, type PermissionDecision, type StartSessionOptions } from '@shared/ipc'
import type { PermissionMode } from '@shared/events'
import { AgentService } from './agent/AgentService'
import { EventBus } from './events/bus'
import { agentEnv, loadLoginShellPath, resolveClaudeExecutable } from './system/environment'
import { handleFileScheme, registerFileScheme } from './system/fileProtocol'
import { TelemetryServer } from './system/telemetry'
import { SettingsStore } from './system/settings'

loadLoginShellPath()
registerFileScheme()

const bus = new EventBus()
const telemetry = new TelemetryServer()
let settings: SettingsStore
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

function registerIpc() {
  ipcMain.handle(IPC.startSession, (_e, opts: StartSessionOptions) => {
    settings.addRecentProject(opts.cwd)
    return agents.start(opts)
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
  agents = new AgentService({
    bus,
    telemetry,
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
  telemetry.stop()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
