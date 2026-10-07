import { create } from 'zustand'
import type { PitchScript, PitchState, Voice } from '@shared/pitch'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from './app'

interface PitchStore {
  state: PitchState | null
  /** Local edits, saved shortly after typing stops. */
  draft: PitchScript | null
  dirty: boolean
  voices: Voice[] | null
  voicesError: string | null
  error: string | null
  load(): Promise<void>
  edit(fn: (s: PitchScript) => PitchScript): void
  replace(script: PitchScript): Promise<void>
  scaffold(eventName: string): Promise<void>
  install(): Promise<void>
  narrate(): Promise<void>
  loadVoices(): Promise<void>
  setKey(key: string | null): Promise<void>
}

let listening = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

export const usePitch = create<PitchStore>((set, get) => {
  const apply = (state: PitchState) => {
    // Take the file's version unless the user has unsaved edits.
    set((s) => ({ state, draft: s.dirty ? s.draft : state.script }))
  }
  const run = async (fn: () => Promise<PitchState>) => {
    try {
      apply(await fn())
      set({ error: null })
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  }
  const flush = async () => {
    const d = get().draft
    if (!d) return
    try {
      const state = await window.harness.pitchSave(d)
      // Edits typed while saving stay dirty and save next round.
      set((s) => ({ state, dirty: s.draft !== d, error: null }))
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  }
  return {
    state: null,
    draft: null,
    dirty: false,
    voices: null,
    voicesError: null,
    error: null,
    async load() {
      if (!listening) {
        listening = true
        window.harness.onPitch(apply)
      }
      await run(() => window.harness.pitchState())
    },
    edit(fn) {
      const d = get().draft
      if (!d) return
      set({ draft: fn(d), dirty: true })
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void flush(), 700)
    },
    async replace(script) {
      clearTimeout(saveTimer)
      set({ draft: script, dirty: true })
      await flush()
    },
    scaffold: (name) => run(() => window.harness.pitchScaffold(name)),
    async install() {
      await run(() => window.harness.pitchInstall())
    },
    async narrate() {
      clearTimeout(saveTimer)
      if (get().dirty) await flush()
      await run(() => window.harness.pitchNarrate())
    },
    async loadVoices() {
      try {
        set({ voices: await window.harness.pitchVoices(), voicesError: null })
      } catch (err) {
        set({ voices: null, voicesError: ipcErrorMessage(err) })
      }
    },
    async setKey(key) {
      try {
        const settings = await window.harness.setElevenLabsKey(key)
        useApp.setState({ settings })
        set({ voices: null, voicesError: null })
        if (key) await get().loadVoices()
      } catch (err) {
        set({ error: ipcErrorMessage(err) })
      }
    },
  }
})
