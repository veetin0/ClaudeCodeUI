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
  previewDetect: (cwd) => ipcRenderer.invoke(IPC.previewDetect, cwd),
  previewState: () => ipcRenderer.invoke(IPC.previewState),
  startStudio: (cwd) => ipcRenderer.invoke(IPC.startStudio, cwd),
  startScript: (cwd, script) => ipcRenderer.invoke(IPC.startScript, cwd, script),
  stopServer: (id) => ipcRenderer.invoke(IPC.stopServer, id),
  listCompositions: (cwd) => ipcRenderer.invoke(IPC.listCompositions, cwd),
  render: (cwd, composition) => ipcRenderer.invoke(IPC.render, cwd, composition),
  cancelRender: (id) => ipcRenderer.invoke(IPC.cancelRender, id),
  revealFile: (path) => ipcRenderer.invoke(IPC.revealFile, path),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  onPreviewState: (cb) => {
    const l = (_: unknown, state: import('../shared/preview').PreviewState) => cb(state)
    ipcRenderer.on(IPC.previewStateUpdate, l)
    return () => ipcRenderer.removeListener(IPC.previewStateUpdate, l)
  },
  onCommand: (cb) => {
    const l = (_: unknown, cmd: import('../shared/commands').CommandMessage) => cb(cmd)
    ipcRenderer.on(IPC.command, l)
    return () => ipcRenderer.removeListener(IPC.command, l)
  },
  setActiveSession: (id) => ipcRenderer.send(IPC.activeSession, id),
  hackforgeWatch: (cwd) => ipcRenderer.invoke(IPC.hackforgeWatch, cwd),
  hackforgeUnwatch: (cwd) => ipcRenderer.send(IPC.hackforgeUnwatch, cwd),
  hackforgeStopLoop: (cwd) => ipcRenderer.invoke(IPC.hackforgeStopLoop, cwd),
  hackforgeSetProfile: (cwd, profile) => ipcRenderer.invoke(IPC.hackforgeSetProfile, cwd, profile),
  onHackforge: (cb) => {
    const l = (_: unknown, s: import('../shared/hackforge').HackforgeSnapshot) => cb(s)
    ipcRenderer.on(IPC.hackforgeUpdate, l)
    return () => ipcRenderer.removeListener(IPC.hackforgeUpdate, l)
  },
  eventState: () => ipcRenderer.invoke(IPC.eventState),
  eventLink: (dir) => ipcRenderer.invoke(IPC.eventLink, dir),
  eventSetup: (dir) => ipcRenderer.invoke(IPC.eventSetup, dir),
  eventUpdate: (patch) => ipcRenderer.invoke(IPC.eventUpdate, patch),
  onEvent: (cb) => {
    const l = (_: unknown, s: import('../shared/event').EventState) => cb(s)
    ipcRenderer.on(IPC.eventPush, l)
    return () => ipcRenderer.removeListener(IPC.eventPush, l)
  },
  teamState: () => ipcRenderer.invoke(IPC.teamState),
  teamCreate: (opts) => ipcRenderer.invoke(IPC.teamCreate, opts),
  teamJoin: (code, name) => ipcRenderer.invoke(IPC.teamJoin, code, name),
  teamLeave: () => ipcRenderer.invoke(IPC.teamLeave),
  teamUpdate: (patch) => ipcRenderer.invoke(IPC.teamUpdate, patch),
  teamSetLocal: (local) => ipcRenderer.send(IPC.teamSetLocal, local),
  onTeam: (cb) => {
    const l = (_: unknown, s: import('../shared/team').TeamState) => cb(s)
    ipcRenderer.on(IPC.teamPush, l)
    return () => ipcRenderer.removeListener(IPC.teamPush, l)
  },
  onEvents: (cb) => {
    const listener = (_: unknown, events: HarnessEvent[]) => cb(events)
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
}

contextBridge.exposeInMainWorld('harness', api)
