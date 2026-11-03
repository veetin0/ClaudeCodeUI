import { useEffect } from 'react'
import { create } from 'zustand'
import { partnerResearchPrompt, type PartnersState } from '@shared/partners'
import { ipcErrorMessage } from '@/lib/time'
import { useEvent } from './event'

interface PartnersStore {
  state: PartnersState | null
  error: string | null
  /** Kit ids being checked right now. */
  checking: string[]
  load(): Promise<void>
  run(fn: () => Promise<PartnersState>): Promise<boolean>
  test(kitId: string): Promise<void>
  /** Adds a key: a known service is checked right away, anything else goes to Claude to research. */
  add(key: string, name?: string): Promise<boolean>
  /** Asks Claude (in a new session in the project) what a key is for and how to use it. */
  research(kitId: string): Promise<void>
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
  async add(key, name) {
    try {
      const r = await window.harness.partnerAdd({ key, name })
      set({ state: r.state, error: null })
      const kit = r.state.kits.find((k) => k.id === r.kitId)
      if (r.known && kit?.checkable) void get().test(kit.id)
      else if (!r.known && r.state.project) await get().research(r.kitId)
      return true
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    }
  },
  async research(kitId) {
    const kit = get().state?.kits.find((k) => k.id === kitId)
    if (!kit) return
    await useEvent.getState().askClaude(partnerResearchPrompt(kit), `Looking into ${kit.label ? `the ${kit.label} key` : 'the new API key'}`, { fresh: true })
  },
}))

export function usePartnersState(): PartnersState | null {
  const state = usePartners((s) => s.state)
  useEffect(() => {
    if (!usePartners.getState().state) void usePartners.getState().load()
  }, [])
  return state
}
