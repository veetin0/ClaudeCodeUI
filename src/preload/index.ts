import { contextBridge, ipcRenderer } from 'electron'
import type { HarnessEvent } from '../shared/events'
import { IPC, type HarnessApi } from '../shared/ipc'

const api: HarnessApi = {
  platform: process.platform,
  startSession: (opts) => ipcRenderer.invoke(IPC.startSession, opts),
  sendMessage: (id, text) => ipcRenderer.invoke(IPC.sendMessage, id, text),
  interrupt: (id) => ipcRenderer.invoke(IPC.interrupt, id),
  closeSession: (id) => ipcRenderer.invoke(IPC.closeSession, id),
  listHistory: () => ipcRenderer.invoke(IPC.listHistory),
  loadSession: (id) => ipcRenderer.invoke(IPC.loadSession, id),
  resumeSession: (id, opts) => ipcRenderer.invoke(IPC.resumeSession, id, opts),
  deleteSession: (id) => ipcRenderer.invoke(IPC.deleteSession, id),
  listFiles: (cwd) => ipcRenderer.invoke(IPC.listFiles, cwd),
  getFileDiff: (id, path) => ipcRenderer.invoke(IPC.getFileDiff, id, path),
  revertFile: (id, path) => ipcRenderer.invoke(IPC.revertFile, id, path),
  acceptFile: (id, path) => ipcRenderer.invoke(IPC.acceptFile, id, path),
  setPermissionMode: (id, mode) => ipcRenderer.invoke(IPC.setPermissionMode, id, mode),
  setModel: (id, model) => ipcRenderer.invoke(IPC.setModel, id, model),
  respondPermission: (id, requestId, decision) => ipcRenderer.invoke(IPC.respondPermission, id, requestId, decision),
  pickDirectory: () => ipcRenderer.invoke(IPC.pickDirectory),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  setApiKey: (key) => ipcRenderer.invoke(IPC.setApiKey, key),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  getObserveStatus: () => ipcRenderer.invoke(IPC.observeStatus),
  setObserveEnabled: (enabled) => ipcRenderer.invoke(IPC.observeEnable, enabled),
  installObserveHooks: () => ipcRenderer.invoke(IPC.observeInstallHooks),
  removeObserveHooks: () => ipcRenderer.invoke(IPC.observeRemoveHooks),
  ptyCreate: (opts) => ipcRenderer.invoke(IPC.ptyCreate, opts),
  ptyWrite: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
  ptyResize: (id, cols, rows) => ipcRenderer.send(IPC.ptyResize, id, cols, rows),
  ptyKill: (id) => ipcRenderer.send(IPC.ptyKill, id),
  onPtyData: (cb) => {
    const l = (_: unknown, id: string, data: string) => cb(id, data)
    ipcRenderer.on(IPC.ptyData, l)
    return () => ipcRenderer.removeListener(IPC.ptyData, l)
  },
  onPtyExit: (cb) => {
    const l = (_: unknown, id: string, code: number) => cb(id, code)
    ipcRenderer.on(IPC.ptyExit, l)
    return () => ipcRenderer.removeListener(IPC.ptyExit, l)
  },
  onEvents: (cb) => {
    const listener = (_: unknown, events: HarnessEvent[]) => cb(events)
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
}

contextBridge.exposeInMainWorld('harness', api)
