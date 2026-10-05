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
  onEvents: (cb) => {
    const listener = (_: unknown, events: HarnessEvent[]) => cb(events)
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
}

contextBridge.exposeInMainWorld('harness', api)
