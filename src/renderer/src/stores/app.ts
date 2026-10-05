import { create } from 'zustand'
import { produce } from 'immer'
import type { HarnessEvent, PermissionMode } from '@shared/events'
import type { AppSettings, PermissionDecision } from '@shared/ipc'
import { applyEvent, createSession, type SessionState } from './reducer'

export type InspectorTab = 'agents' | 'tasks' | 'activity'

interface AppState {
  sessions: Record<string, SessionState>
  order: string[]
  activeId: string | null
  settings: AppSettings | null
  inspectorTab: InspectorTab
  focusMode: boolean
  settingsOpen: boolean
  startError: string | null

  init(): Promise<void>
  applyEvents(events: HarnessEvent[]): void
  startSession(cwd: string): Promise<void>
  openProject(): Promise<void>
  select(id: string): void
  closeSession(id: string): Promise<void>
  send(text: string): Promise<void>
  interrupt(): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  setModel(model: string): Promise<void>
  respondPermission(requestId: string, decision: PermissionDecision): Promise<void>
  setInspectorTab(tab: InspectorTab): void
  toggleFocusMode(): void
  setSettingsOpen(open: boolean): void
  saveApiKey(key: string | null): Promise<void>
  updateSettings(patch: Partial<Omit<AppSettings, 'hasApiKey'>>): Promise<void>
}

const api = () => window.harness

export const useApp = create<AppState>((set, get) => ({
  sessions: {},
  order: [],
  activeId: null,
  settings: null,
  inspectorTab: 'agents',
  focusMode: false,
  settingsOpen: false,
  startError: null,

  async init() {
    set({ settings: await api().getSettings() })
    api().onEvents((events) => get().applyEvents(events))
  },

  applyEvents(events) {
    set((state) =>
      produce(state, (draft) => {
        for (const e of events) {
          const s = draft.sessions[e.sessionId]
          if (s) applyEvent(s, e)
        }
      }),
    )
  },

  async startSession(cwd) {
    const { settings } = get()
    const permissionMode = settings?.defaultPermissionMode ?? 'default'
    try {
      const summary = await api().startSession({ cwd, permissionMode, model: settings?.defaultModel || undefined })
      set((st) => ({
        sessions: { ...st.sessions, [summary.id]: createSession(summary, permissionMode) },
        order: [summary.id, ...st.order],
        activeId: summary.id,
        startError: null,
      }))
      set({ settings: await api().getSettings() })
    } catch (err) {
      set({ startError: err instanceof Error ? err.message : String(err) })
    }
  },

  async openProject() {
    const dir = await api().pickDirectory()
    if (dir) await get().startSession(dir)
  },

  select(id) {
    set({ activeId: id })
  },

  async closeSession(id) {
    await api().closeSession(id)
    set((st) => {
      const { [id]: _removed, ...sessions } = st.sessions
      const order = st.order.filter((x) => x !== id)
      return { sessions, order, activeId: st.activeId === id ? (order[0] ?? null) : st.activeId }
    })
  },

  async send(text) {
    const id = get().activeId
    if (id) await api().sendMessage(id, text)
  },

  async interrupt() {
    const id = get().activeId
    if (id) await api().interrupt(id)
  },

  async setPermissionMode(mode) {
    const id = get().activeId
    if (!id) return
    await api().setPermissionMode(id, mode)
    set((st) => produce(st, (d) => void (d.sessions[id].permissionMode = mode)))
  },

  async setModel(model) {
    const id = get().activeId
    if (!id) return
    await api().setModel(id, model)
    set((st) => produce(st, (d) => void (d.sessions[id].model = model)))
  },

  async respondPermission(requestId, decision) {
    const id = get().activeId
    if (id) await api().respondPermission(id, requestId, decision)
  },

  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  toggleFocusMode: () => set((st) => ({ focusMode: !st.focusMode })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),

  async saveApiKey(key) {
    await api().setApiKey(key)
    set({ settings: await api().getSettings() })
  },

  async updateSettings(patch) {
    set({ settings: await api().updateSettings(patch) })
  },
}))

export const useActiveSession = () => useApp((st) => (st.activeId ? st.sessions[st.activeId] : null))
