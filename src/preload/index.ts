import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { HarnessEvent } from '../shared/events'
import { IPC, type HarnessApi } from '../shared/ipc'

const api: HarnessApi = {
  platform: process.platform,
  startSession: (opts) => ipcRenderer.invoke(IPC.startSession, opts),
  sendMessage: (id, text, images, via) => ipcRenderer.invoke(IPC.sendMessage, id, text, images, via),
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
  openProjectFile: (path) => ipcRenderer.invoke(IPC.openProjectFile, path),
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
  setElevenLabsKey: (key) => ipcRenderer.invoke(IPC.setElevenLabsKey, key),
  setContext7Key: (key) => ipcRenderer.invoke(IPC.setContext7Key, key),
  pitchState: () => ipcRenderer.invoke(IPC.pitchState),
  pitchScaffold: (name) => ipcRenderer.invoke(IPC.pitchScaffold, name),
  pitchChoose: (choice, name) => ipcRenderer.invoke(IPC.pitchChoose, choice, name),
  pitchInstallCartoon: () => ipcRenderer.invoke(IPC.pitchInstallCartoon),
  pitchSave: (script) => ipcRenderer.invoke(IPC.pitchSave, script),
  pitchInstall: () => ipcRenderer.invoke(IPC.pitchInstall),
  pitchNarrate: () => ipcRenderer.invoke(IPC.pitchNarrate),
  pitchVoices: () => ipcRenderer.invoke(IPC.pitchVoices),
  kit3dState: () => ipcRenderer.invoke(IPC.kit3dState),
  kit3dSetup: () => ipcRenderer.invoke(IPC.kit3dSetup),
  kit3dCapture: () => ipcRenderer.invoke(IPC.kit3dCapture),
  kit3dStills: (clip) => ipcRenderer.invoke(IPC.kit3dStills, clip),
  kit3dRender: (clip, quality) => ipcRenderer.invoke(IPC.kit3dRender, clip, quality),
  kit3dCancel: () => ipcRenderer.invoke(IPC.kit3dCancel),
  kit3dAddToPitch: (clip) => ipcRenderer.invoke(IPC.kit3dAddToPitch, clip),
  onKit3d: (cb) => {
    const l = (_: unknown, s: import('../shared/kit3d').Kit3dState) => cb(s)
    ipcRenderer.on(IPC.kit3dPush, l)
    return () => ipcRenderer.removeListener(IPC.kit3dPush, l)
  },
  onPitch: (cb) => {
    const l = (_: unknown, s: import('../shared/ipc').PitchState) => cb(s)
    ipcRenderer.on(IPC.pitchPush, l)
    return () => ipcRenderer.removeListener(IPC.pitchPush, l)
  },
  resetQueueState: () => ipcRenderer.invoke(IPC.resetQueueState),
  resetQueueAdd: (item) => ipcRenderer.invoke(IPC.resetQueueAdd, item),
  resetQueueRemove: (id) => ipcRenderer.invoke(IPC.resetQueueRemove, id),
  resetQueueDone: (id) => ipcRenderer.send(IPC.resetQueueDone, id),
  onResetQueue: (cb) => {
    const l = (_: unknown, s: import('../shared/resetQueue').ResetQueueState) => cb(s)
    ipcRenderer.on(IPC.resetQueuePush, l)
    return () => ipcRenderer.removeListener(IPC.resetQueuePush, l)
  },
  onResetQueueFire: (cb) => {
    const l = (_: unknown, items: import('../shared/resetQueue').QueuedPrompt[]) => cb(items)
    ipcRenderer.on(IPC.resetQueueFire, l)
    return () => ipcRenderer.removeListener(IPC.resetQueueFire, l)
  },
  phoneTest: () => ipcRenderer.invoke(IPC.phoneTest),
  partnersState: () => ipcRenderer.invoke(IPC.partnersState),
  partnerSetKey: (env, value) => ipcRenderer.invoke(IPC.partnerSetKey, env, value),
  partnerSetDocs: (kitId, url) => ipcRenderer.invoke(IPC.partnerSetDocs, kitId, url),
  partnerSetMcp: (kitId, url) => ipcRenderer.invoke(IPC.partnerSetMcp, kitId, url),
  partnerAdd: (opts) => ipcRenderer.invoke(IPC.partnerAdd, opts),
  partnerRemove: (id) => ipcRenderer.invoke(IPC.partnerRemove, id),
  partnerTest: (kitId) => ipcRenderer.invoke(IPC.partnerTest, kitId),
  onPartners: (cb) => {
    const l = (_: unknown, s: import('../shared/partners').PartnersState) => cb(s)
    ipcRenderer.on(IPC.partnersPush, l)
    return () => ipcRenderer.removeListener(IPC.partnersPush, l)
  },
  previewPick: (url, frame) => ipcRenderer.invoke(IPC.previewPick, url, frame),
  previewPickCancel: (url) => ipcRenderer.invoke(IPC.previewPickCancel, url),
  usageHistory: (days) => ipcRenderer.invoke(IPC.usageHistory, days),
  designState: () => ipcRenderer.invoke(IPC.designState),
  designPrepare: () => ipcRenderer.invoke(IPC.designPrepare),
  onDesign: (cb) => {
    const l = (_: unknown, s: import('../shared/design').DesignState) => cb(s)
    ipcRenderer.on(IPC.designPush, l)
    return () => ipcRenderer.removeListener(IPC.designPush, l)
  },
  devToolsState: () => ipcRenderer.invoke(IPC.devToolsState),
  projectSet: (dir) => ipcRenderer.invoke(IPC.projectSet, dir),
  projectCreate: (opts) => ipcRenderer.invoke(IPC.projectCreate, opts),
  projectState: () => ipcRenderer.invoke(IPC.projectState),
  onProjectState: (cb) => {
    const l = (_: unknown, s: Parameters<typeof cb>[0]) => cb(s)
    ipcRenderer.on(IPC.projectPush, l)
    return () => ipcRenderer.removeListener(IPC.projectPush, l)
  },
  projectLink: (id) => ipcRenderer.invoke(IPC.projectLink, id),
  projectCatalog: () => ipcRenderer.invoke(IPC.projectCatalog),
  projectSetMcp: (id, on) => ipcRenderer.invoke(IPC.projectSetMcp, id, on),
  projectDefaults: () => ipcRenderer.invoke(IPC.projectDefaults),
  usageState: () => ipcRenderer.invoke(IPC.usageState),
  onUsage: (cb) => {
    const l = (_: unknown, u: import('../shared/planUsage').PlanUsage) => cb(u)
    ipcRenderer.on(IPC.usagePush, l)
    return () => ipcRenderer.removeListener(IPC.usagePush, l)
  },
  eccInfo: () => ipcRenderer.invoke(IPC.eccInfo),
  devToolsInstallBrowser: () => ipcRenderer.invoke(IPC.devToolsInstallBrowser),
  devToolsInstallRea: () => ipcRenderer.invoke(IPC.devToolsInstallRea),
  devToolsSetupBlender: () => ipcRenderer.invoke(IPC.devToolsSetupBlender),
  devToolsOpenBlender: (file) => ipcRenderer.invoke(IPC.devToolsOpenBlender, file),
  previewPickModel: () => ipcRenderer.invoke(IPC.previewPickModel),
  onDevTools: (cb) => {
    const l = (_: unknown, s: import('../shared/devtools').DevToolsState) => cb(s)
    ipcRenderer.on(IPC.devToolsPush, l)
    return () => ipcRenderer.removeListener(IPC.devToolsPush, l)
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  onEvents: (cb) => {
    const listener = (_: unknown, events: HarnessEvent[]) => cb(events)
    ipcRenderer.on(IPC.events, listener)
    return () => ipcRenderer.removeListener(IPC.events, listener)
  },
}

contextBridge.exposeInMainWorld('harness', api)
