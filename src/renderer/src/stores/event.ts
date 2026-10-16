import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { EventState } from '@shared/event'
import type { EventProgressPatch } from '@shared/ipc'
import type { ChallengePatch } from '@shared/challenges'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from './app'

export type EventTab = 'overview' | 'challenges' | 'partners' | 'pitch'

interface EventStore {
  state: EventState | null
  error: string | null
  tab: EventTab
  /** Shown after a prompt was handed to Claude, with the session to watch. */
  notice: { text: string; sessionId: string } | null
  setTab(tab: EventTab): void
  dismissNotice(): void
  /** Sends a prompt to a Claude session in the event project (reusing an open one), staying in event mode. */
  askClaude(prompt: string, what: string): Promise<void>
  addChallenge(c: { partner: string; title: string; description: string; link?: string }): Promise<boolean>
  updateChallenge(id: string, patch: ChallengePatch): Promise<void>
  deleteChallenge(id: string): Promise<void>
  chooseChallenge(id: string): Promise<void>
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
    tab: 'overview',
    notice: null,
    setTab: (tab) => set({ tab }),
    dismissNotice: () => set({ notice: null }),
    async askClaude(prompt, what) {
      const dir = get().state?.projectDir
      if (!dir) {
        set({ error: 'Set up or link the event project first.' })
        return
      }
      const app = useApp.getState()
      const existing = app.order.find((id) => {
        const s = app.sessions[id]
        return s && s.cwd === dir && s.live && !s.observed && s.status !== 'closed'
      })
      if (existing) app.select(existing)
      else await app.startSession(dir)
      const after = useApp.getState()
      const id = after.activeId
      if (!id || after.startError) {
        set({ error: after.startError ?? 'Could not start a Claude session.' })
        return
      }
      await after.send(prompt)
      // select/startSession leave event mode; come back to it.
      after.setEventOpen(true)
      set({ notice: { text: `${what}: sent to Claude.`, sessionId: id }, error: null })
    },
    addChallenge: async (c) => {
      try {
        set({ state: await window.harness.challengeAdd(c), error: null })
        return true
      } catch (err) {
        set({ error: ipcErrorMessage(err) })
        return false
      }
    },
    updateChallenge: (id, patch) => run(() => window.harness.challengeUpdate(id, patch)),
    deleteChallenge: (id) => run(() => window.harness.challengeDelete(id)),
    chooseChallenge: (id) => run(() => window.harness.challengeChoose(id)),
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
