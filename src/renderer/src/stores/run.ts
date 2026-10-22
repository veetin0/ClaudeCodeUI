import { useEffect } from 'react'
import { create } from 'zustand'
import { EMPTY_RUN, type RunState, type SetupInfo } from '@shared/run'
import { ipcErrorMessage } from '@/lib/time'

interface RunStore {
  state: RunState
  loaded: boolean
  setup: SetupInfo | null
  /** What's being done right now (a button's spinner), and the last thing that failed. */
  busy: string | null
  error: string | null
  load(): Promise<void>
  refreshSetup(): Promise<void>
  /** Runs an action, showing `label` while it's busy and its error if it fails. */
  act<T>(label: string, fn: () => Promise<T>): Promise<T | undefined>
  clearError(): void
}

let listening = false

export const useRunStore = create<RunStore>((set, get) => ({
  state: EMPTY_RUN,
  loaded: false,
  setup: null,
  busy: null,
  error: null,
  async load() {
    if (!listening) {
      listening = true
      window.harness.onRun((state) => {
        const before = get().state
        set({ state, loaded: true })
        if (state.project?.dir !== before.project?.dir) void get().refreshSetup()
      })
    }
    set({ state: await window.harness.runState(), loaded: true })
    await get().refreshSetup()
  },
  async refreshSetup() {
    set({ setup: await window.harness.runSetupInfo() })
  },
  async act(label, fn) {
    set({ busy: label, error: null })
    try {
      return await fn()
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return undefined
    } finally {
      set({ busy: null })
    }
  },
  clearError: () => set({ error: null }),
}))

/** The team run, kept live. */
export function useRun(): RunState {
  const state = useRunStore((s) => s.state)
  useEffect(() => {
    if (!useRunStore.getState().loaded) void useRunStore.getState().load()
  }, [])
  return state
}
