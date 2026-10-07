import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { EventState } from '@shared/event'
import type { EventProgressPatch } from '@shared/ipc'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from './app'

interface EventStore {
  state: EventState | null
  error: string | null
  load(): Promise<void>
  link(dir: string | null): Promise<void>
  /** Pick (or create) a folder and set it up from the event preset. */
  setupProject(dir?: string): Promise<void>
  linkExisting(): Promise<void>
  update(patch: EventProgressPatch): Promise<void>
}

let listening = false

export const useEvent = create<EventStore>((set, get) => {
  const run = async (fn: () => Promise<EventState>) => {
    try {
      set({ state: await fn(), error: null })
      // eventProject lives in app settings.
      void useApp.getState().updateSettings({})
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
    }
  }
  return {
    state: null,
    error: null,
    async load() {
      if (!listening) {
        listening = true
        window.harness.onEvent((state) => set({ state }))
      }
      await run(() => window.harness.eventState())
    },
    link: (dir) => run(() => window.harness.eventLink(dir)),
    async setupProject(dir) {
      const target = dir ?? (await window.harness.pickDirectory())
      if (target) await run(() => window.harness.eventSetup(target))
    },
    async linkExisting() {
      const dir = await window.harness.pickDirectory()
      if (dir) await get().link(dir)
    },
    update: (patch) => run(() => window.harness.eventUpdate(patch)),
  }
})

/** Loads event state once and keeps it live. */
export function useEventState(): EventState | null {
  const state = useEvent((s) => s.state)
  useEffect(() => {
    if (!useEvent.getState().state) void useEvent.getState().load()
  }, [])
  return state
}

/** Re-renders every `ms` so countdowns tick. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}
