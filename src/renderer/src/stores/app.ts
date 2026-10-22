import { create } from 'zustand'
import { produce } from 'immer'
import type { HarnessEvent, PermissionMode } from '@shared/events'
import type { AppSettings, PermissionDecision, SessionSummary, SettingsPatch } from '@shared/ipc'
import type { Composition, PreviewState, ProjectInfo } from '@shared/preview'
import { ipcErrorMessage } from '@/lib/time'
import { AUTO_MODEL } from '@shared/usageSaver'
import type { ImageAttachment } from '@shared/events'
import { applyEvent, createSession, finalizeLoaded, type SessionState } from './reducer'
import { appendEvents, dropLog, getLog, seedLog } from './eventLog'

export interface ReplayState {
  sessionId: string
  /** Wall-clock time (ms) the replay is showing. */
  t: number
  playing: boolean
  speed: number
}

export interface TerminalTab {
  id: string
  title: string
  cwd: string
  exitCode?: number
}

export type InspectorTab = 'agents' | 'tasks' | 'files' | 'activity'
export type MainView = 'chat' | 'board' | 'mission' | 'preview' | 'hackforge'

/** What the Preview view is showing for a project. */
export type PreviewTarget = { kind: 'server'; id: string } | { kind: 'url'; url: string }

interface AppState {
  /** Sessions open in the sidebar (live, or saved ones opened from history). */
  sessions: Record<string, SessionState>
  /** All saved sessions, most recent first. */
  history: SessionSummary[]
  order: string[]
  activeId: string | null
  settings: AppSettings | null
  inspectorTab: InspectorTab
  view: MainView
  /** agentKey of the agent whose detail panel is open. */
  detailAgent: string | null
  /** Tool call to preselect in the agent detail view. */
  detailTool: string | null
  /** Absolute path of the file open in the diff view. */
  diffPath: string | null
  /** Unsent prompt text per session. */
  drafts: Record<string, string>
  focusMode: boolean
  settingsOpen: boolean
  preview: PreviewState
  /** package.json facts per project folder (Remotion? dev scripts?). */
  projects: Record<string, ProjectInfo>
  previewTargets: Record<string, PreviewTarget | undefined>
  compositions: Record<string, { list?: Composition[]; loading: boolean; error?: string }>
  paletteOpen: boolean
  /** Id of the quick action (or 'cmd:<name>') whose form is open above the prompt. */
  actionForm: string | null
  replay: ReplayState | null
  terminals: TerminalTab[]
  activeTerminal: string | null
  terminalOpen: boolean
  terminalHeight: number
  startError: string | null
  /** Event mode (the hackathon war room) fills the main area. */
  eventOpen: boolean
  /** Usage history fills the main area. */
  usageOpen: boolean
  /** The team run (Team → Setup → Plan → Run → Done) fills the main area: Harness's home. */
  teamOpen: boolean
  /** Session whose handoff dialog is open. */
  handoffFor: string | null

  init(): Promise<void>
  applyEvents(events: HarnessEvent[]): void
  startSession(cwd: string): Promise<void>
  refreshHistory(): Promise<void>
  openSaved(id: string): Promise<void>
  deleteSaved(id: string): Promise<void>
  openProject(): Promise<void>
  select(id: string): void
  closeSession(id: string): Promise<void>
  send(text: string, images?: ImageAttachment[]): Promise<void>
  /** Sends to a given session (resuming it if it's saved), e.g. a queued message at the reset. */
  sendTo(id: string, text: string, images?: ImageAttachment[]): Promise<void>
  openHandoff(sessionId: string | null): void
  /** Opens a teammate's handed-off work: a session in its folder with the first message ready. */
  takeOver(dir: string, prompt: string): Promise<void>
  setUsageOpen(open: boolean): void
  setTeamOpen(open: boolean): void
  /** Starts a session in the background (the team run's lead): it opens in the sidebar, the view stays. */
  startQuiet(cwd: string, permissionMode: PermissionMode): Promise<string>
  /** Brings a saved session back to life in the background (the team run's lead after a restart). */
  resumeQuiet(id: string, permissionMode: PermissionMode): Promise<void>
  interrupt(): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setModel(model: string): Promise<void>
  respondPermission(requestId: string, decision: PermissionDecision): Promise<void>
  setInspectorTab(tab: InspectorTab): void
  setView(view: MainView): void
  setEventOpen(open: boolean): void
  openAgent(key: string, toolId?: string): void
  closeAgent(): void
  openDiff(path: string): void
  closeDiff(): void
  setDraft(text: string): void
  toggleFocusMode(): void
  setSettingsOpen(open: boolean): void
  detectProject(cwd: string): Promise<void>
  setPreviewTarget(cwd: string, target: PreviewTarget | undefined): void
  loadCompositions(cwd: string): Promise<void>
  setPaletteOpen(open: boolean): void
  setActionForm(id: string | null): void
  startReplay(sessionId?: string): void
  setReplay(patch: Partial<ReplayState> | null): void
  openTerminal(command?: string): Promise<void>
  closeTerminal(id: string): void
  selectTerminal(id: string): void
  toggleTerminalPanel(): void
  setTerminalHeight(h: number): void
  saveApiKey(key: string | null): Promise<void>
  updateSettings(patch: SettingsPatch): Promise<void>
}

const api = () => window.harness

let historyTimer: ReturnType<typeof setTimeout> | null = null
function scheduleHistoryRefresh() {
  historyTimer ??= setTimeout(() => {
    historyTimer = null
    void useApp.getState().refreshHistory()
  }, 600)
}

export const useApp = create<AppState>((set, get) => ({
  sessions: {},
  history: [],
  order: [],
  activeId: null,
  settings: null,
  inspectorTab: 'agents',
  view: 'chat',
  detailAgent: null,
  detailTool: null,
  diffPath: null,
  drafts: {},
  focusMode: false,
  settingsOpen: false,
  preview: { servers: [], renders: [], detected: [] },
  projects: {},
  previewTargets: {},
  compositions: {},
  paletteOpen: false,
  actionForm: null,
  replay: null,
  terminals: [],
  activeTerminal: null,
  terminalOpen: false,
  terminalHeight: 260,
  startError: null,
  eventOpen: false,
  usageOpen: false,
  teamOpen: true,
  handoffFor: null,

  async init() {
    set({ settings: await api().getSettings() })
    api().onEvents((events) => get().applyEvents(events))
    set({ preview: await api().previewState() })
    api().onPreviewState((preview) => {
      set({ preview })
      // Point a project's preview at its server as soon as that server is up.
      for (const srv of preview.servers) {
        if (srv.status === 'ready' && !get().previewTargets[srv.cwd]) get().setPreviewTarget(srv.cwd, { kind: 'server', id: srv.id })
      }
    })
    api().onPtyExit((id, code) =>
      set((st) => ({ terminals: st.terminals.map((t) => (t.id === id ? { ...t, exitCode: code } : t)) })),
    )
    await get().refreshHistory()
  },

  async refreshHistory() {
    set({ history: await api().listHistory() })
  },

  async openSaved(id) {
    if (get().sessions[id]) return get().select(id)
    const loaded = await api().loadSession(id)
    if (!loaded) return
    seedLog(id, loaded.events)
    const session = produce(createSession(loaded.summary, get().settings?.defaultPermissionMode, false), (draft) => {
      for (const e of loaded.events) applyEvent(draft, e)
      finalizeLoaded(draft)
    })
    set((st) => ({
      sessions: { ...st.sessions, [id]: session },
      order: [id, ...st.order.filter((x) => x !== id)],
      activeId: id,
      detailAgent: null,
      teamOpen: false,
    }))
    void get().detectProject(loaded.summary.cwd)
  },

  async deleteSaved(id) {
    await api().deleteSession(id)
    dropLog(id)
    set((st) => {
      const { [id]: _removed, ...sessions } = st.sessions
      const order = st.order.filter((x) => x !== id)
      return { sessions, order, activeId: st.activeId === id ? (order[0] ?? null) : st.activeId }
    })
    await get().refreshHistory()
  },

  applyEvents(events) {
    appendEvents(events)
    set((state) =>
      produce(state, (draft) => {
        for (const e of events) {
          // A terminal session started being watched: show it in the sidebar right away.
          if (e.type === 'session.observed' && !draft.sessions[e.sessionId]) {
            draft.sessions[e.sessionId] = createSession(e.summary, 'default', true)
            draft.order.unshift(e.sessionId)
            draft.activeId ??= e.sessionId
            continue
          }
          const s = draft.sessions[e.sessionId]
          if (s) applyEvent(s, e)
        }
      }),
    )
    // Titles, costs and recency in the history list change on these.
    if (events.some((e) => e.type === 'user.message' || e.type === 'turn.end' || e.type === 'session.init' || e.type === 'session.observed' || e.type === 'cost'))
      scheduleHistoryRefresh()
  },

  async startSession(cwd) {
    const { settings } = get()
    const permissionMode = settings?.defaultPermissionMode ?? 'default'
    try {
      const saver = settings?.usageSaver
      const model = saver?.enabled && saver.autoModel ? AUTO_MODEL : settings?.defaultModel || undefined
      const summary = await api().startSession({ cwd, permissionMode, model })
      set((st) => ({
        sessions: { ...st.sessions, [summary.id]: createSession(summary, permissionMode, true) },
        order: [summary.id, ...st.order],
        activeId: summary.id,
        startError: null,
        eventOpen: false,
        teamOpen: false,
      }))
      set({ settings: await api().getSettings() })
      void get().detectProject(cwd)
      await get().refreshHistory()
    } catch (err) {
      set({ startError: ipcErrorMessage(err) })
    }
  },

  async openProject() {
    const dir = await api().pickDirectory()
    if (dir) await get().startSession(dir)
  },

  select(id) {
    set({ activeId: id, detailAgent: null, diffPath: null, replay: null, eventOpen: false, teamOpen: false, usageOpen: false })
    const cwd = get().sessions[id]?.cwd
    if (cwd) void get().detectProject(cwd)
  },

  async detectProject(cwd) {
    if (get().projects[cwd]) return
    const info = await api().previewDetect(cwd)
    set((st) => ({ projects: { ...st.projects, [cwd]: info } }))
  },

  setPreviewTarget(cwd, target) {
    set((st) => ({ previewTargets: { ...st.previewTargets, [cwd]: target } }))
  },

  async loadCompositions(cwd) {
    set((st) => ({ compositions: { ...st.compositions, [cwd]: { ...st.compositions[cwd], loading: true, error: undefined } } }))
    try {
      const list = await api().listCompositions(cwd)
      set((st) => ({ compositions: { ...st.compositions, [cwd]: { list, loading: false } } }))
    } catch (err) {
      set((st) => ({ compositions: { ...st.compositions, [cwd]: { ...st.compositions[cwd], loading: false, error: ipcErrorMessage(err) } } }))
    }
  },

  async closeSession(id) {
    // Closing stops the agent; the session stays in history and can be resumed.
    const s = get().sessions[id]
    if (s?.live && !s.observed) await api().closeSession(id)
    set((st) => {
      const { [id]: _removed, ...sessions } = st.sessions
      const order = st.order.filter((x) => x !== id)
      return { sessions, order, activeId: st.activeId === id ? (order[0] ?? null) : st.activeId }
    })
    await get().refreshHistory()
  },

  async send(text, images) {
    const id = get().activeId
    if (id) await get().sendTo(id, text, images)
  },

  async sendTo(id, text, images) {
    if (!get().sessions[id]) await get().openSaved(id)
    const s = get().sessions[id]
    if (!s) throw new Error('That session no longer exists.')
    if (s && !s.live) {
      // Sending to a saved session resumes its Claude conversation first.
      try {
        await api().resumeSession(id, { permissionMode: s.permissionMode, model: s.saver?.auto ? AUTO_MODEL : s.model })
      } catch (err) {
        set((st) =>
          produce(st, (d) => {
            d.sessions[id].items.push({ kind: 'error', id: `resume-${Date.now()}`, message: ipcErrorMessage(err) })
          }),
        )
        return
      }
    }
    await api().sendMessage(id, text, images)
  },

  openHandoff: (handoffFor) => set({ handoffFor }),

  async takeOver(dir, prompt) {
    await get().startSession(dir)
    get().setDraft(prompt)
  },

  setUsageOpen: (usageOpen) => set({ usageOpen, ...(usageOpen ? { eventOpen: false, teamOpen: false } : {}) }),
  setTeamOpen: (teamOpen) => set({ teamOpen, ...(teamOpen ? { eventOpen: false, usageOpen: false } : {}) }),

  async startQuiet(cwd, permissionMode) {
    const saver = get().settings?.usageSaver
    const model = saver?.enabled && saver.autoModel ? AUTO_MODEL : get().settings?.defaultModel || undefined
    const summary = await api().startSession({ cwd, permissionMode, model })
    set((st) => ({
      sessions: { ...st.sessions, [summary.id]: createSession(summary, permissionMode, true) },
      order: [summary.id, ...st.order],
      activeId: st.activeId ?? summary.id,
    }))
    void get().detectProject(cwd)
    void get().refreshHistory()
    return summary.id
  },

  async resumeQuiet(id, permissionMode) {
    if (!get().sessions[id]) {
      const loaded = await api().loadSession(id)
      if (!loaded) throw new Error('Your Claude’s session is no longer in history.')
      seedLog(id, loaded.events)
      const session = produce(createSession(loaded.summary, permissionMode, false), (draft) => {
        for (const e of loaded.events) applyEvent(draft, e)
        finalizeLoaded(draft)
      })
      set((st) => ({ sessions: { ...st.sessions, [id]: session }, order: [id, ...st.order.filter((x) => x !== id)] }))
    }
    const s = get().sessions[id]
    if (!s.live) await api().resumeSession(id, { permissionMode, model: s.saver?.auto ? AUTO_MODEL : s.model })
  },

  async interrupt() {
    const id = get().activeId
    if (id) await api().interrupt(id)
  },

  // A saved session has no agent to tell yet: keep the choice, and send() resumes with it.
  async setPermissionMode(mode) {
    const id = get().activeId
    if (!id) return
    if (get().sessions[id]?.live) await api().setPermissionMode(id, mode)
    set((st) => produce(st, (d) => void (d.sessions[id].permissionMode = mode)))
  },

  async setModel(model) {
    const id = get().activeId
    if (!id) return
    const live = get().sessions[id]?.live
    if (live) await api().setModel(id, model)
    set((st) =>
      produce(st, (d) => {
        const s = d.sessions[id]
        // Auto keeps showing the model it's on.
        if (model !== AUTO_MODEL) s.model = model
        // A live session confirms Auto on/off with a saver event (which also notes it in the chat).
        if (!live && s.saver) s.saver.auto = model === AUTO_MODEL && s.saver.enabled
      }),
    )
  },

  async respondPermission(requestId, decision) {
    const id = get().activeId
    if (id) await api().respondPermission(id, requestId, decision)
  },

  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setView: (view) => set({ view, eventOpen: false, usageOpen: false, teamOpen: false }),
  setEventOpen: (eventOpen) => set({ eventOpen, ...(eventOpen ? { usageOpen: false, teamOpen: false } : {}) }),
  openAgent: (detailAgent, toolId) => set({ detailAgent, detailTool: toolId ?? null }),
  closeAgent: () => set({ detailAgent: null, detailTool: null }),
  openDiff: (diffPath) => set({ diffPath, detailAgent: null }),
  closeDiff: () => set({ diffPath: null }),
  setDraft: (text) =>
    set((st) => (st.activeId ? { drafts: { ...st.drafts, [st.activeId]: text } } : {})),
  toggleFocusMode: () => set((st) => ({ focusMode: !st.focusMode })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setActionForm: (actionForm) => set({ actionForm }),

  startReplay(sessionId) {
    const id = sessionId ?? get().activeId
    if (!id) return
    const log = getLog(id)
    if (log.length === 0) return
    set({ replay: { sessionId: id, t: log[0].ts, playing: true, speed: 4 }, activeId: id, detailAgent: null, diffPath: null })
  },
  setReplay: (patch) => set((st) => ({ replay: patch === null || !st.replay ? null : { ...st.replay, ...patch } })),

  async openTerminal(command) {
    const { activeId, sessions } = get()
    const cwd = (activeId && sessions[activeId]?.cwd) || get().settings?.recentProjects[0] || '~'
    const id = await api().ptyCreate({ cwd: cwd === '~' ? '' : cwd, cols: 100, rows: 24, command })
    const title = command ? command.split(' ')[0] : 'shell'
    set((st) => ({ terminals: [...st.terminals, { id, title, cwd }], activeTerminal: id, terminalOpen: true }))
  },
  closeTerminal(id) {
    api().ptyKill(id)
    set((st) => {
      const terminals = st.terminals.filter((t) => t.id !== id)
      return { terminals, activeTerminal: st.activeTerminal === id ? (terminals.at(-1)?.id ?? null) : st.activeTerminal, terminalOpen: terminals.length > 0 && st.terminalOpen }
    })
  },
  selectTerminal: (activeTerminal) => set({ activeTerminal }),
  toggleTerminalPanel() {
    const { terminalOpen, terminals } = get()
    if (!terminalOpen && terminals.length === 0) void get().openTerminal()
    else set({ terminalOpen: !terminalOpen })
  },
  setTerminalHeight: (h) => set({ terminalHeight: Math.max(120, Math.min(h, window.innerHeight - 200)) }),

  async saveApiKey(key) {
    await api().setApiKey(key)
    set({ settings: await api().getSettings() })
  },

  async updateSettings(patch) {
    set({ settings: await api().updateSettings(patch) })
  },
}))

export const useActiveSession = () => useApp((st) => (st.activeId ? st.sessions[st.activeId] : null))
