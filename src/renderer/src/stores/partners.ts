import { useEffect } from 'react'
import { create } from 'zustand'
import type { PartnersState } from '@shared/partners'
import { ipcErrorMessage } from '@/lib/time'

interface PartnersStore {
  state: PartnersState | null
  error: string | null
  /** Kit ids being checked right now. */
  checking: string[]
  load(): Promise<void>
  run(fn: () => Promise<PartnersState>): Promise<boolean>
  test(kitId: string): Promise<void>
}

let listening = false

export const usePartners = create<PartnersStore>((set, get) => ({
  state: null,
  error: null,
  checking: [],
  async load() {
    if (!listening) {
      listening = true
      window.harness.onPartners((state) => set({ state }))
    }
    set({ state: await window.harness.partnersState() })
  },
  async run(fn) {
    try {
      set({ state: await fn(), error: null })
      return true
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    }
  },
  async test(kitId) {
    set({ checking: [...get().checking, kitId] })
    await get().run(() => window.harness.partnerTest(kitId))
    set({ checking: get().checking.filter((k) => k !== kitId) })
  },
}))

export function usePartnersState(): PartnersState | null {
  const state = usePartners((s) => s.state)
  useEffect(() => {
    if (!usePartners.getState().state) void usePartners.getState().load()
  }, [])
  return state
}
