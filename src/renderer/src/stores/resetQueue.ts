import { useEffect } from 'react'
import { create } from 'zustand'
import type { QueuedPrompt, ResetQueueState } from '@shared/resetQueue'
import { useApp } from './app'

interface ResetQueueStore {
  state: ResetQueueState | null
  load(): Promise<void>
  add(item: { sessionId: string; cwd: string; title: string; text: string }): Promise<void>
  remove(id: string): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
}

let listening = false

export const useResetQueue = create<ResetQueueStore>((set) => ({
  state: null,
  async load() {
    if (!listening) {
      listening = true
      window.harness.onResetQueue((state) => set({ state }))
    }
    set({ state: await window.harness.resetQueueState() })
  },
  async add(item) {
    set({ state: await window.harness.resetQueueAdd(item) })
  },
  async remove(id) {
    set({ state: await window.harness.resetQueueRemove(id) })
  },
  async setEnabled(enabled) {
    const app = useApp.getState()
    const current = app.settings?.resetQueue ?? { enabled: true, keepAwake: true }
    await app.updateSettings({ resetQueue: { ...current, enabled } })
  },
}))

const isBusy = (id: string) => {
  const s = useApp.getState().sessions[id]
  return !!s && s.live && (s.status === 'running' || s.status === 'waiting' || s.status === 'compacting' || s.status === 'starting')
}

/** Waits until the session has finished its turn (or gives up after 30 minutes). */
function whenIdle(id: string): Promise<void> {
  return new Promise((resolve) => {
    if (!isBusy(id)) return resolve()
    const stop = setTimeout(() => {
      off()
      resolve()
    }, 30 * 60_000)
    const off = useApp.subscribe(() => {
      if (isBusy(id)) return
      clearTimeout(stop)
      off()
      resolve()
    })
  })
}

/** Sends due messages: in order, one at a time per session, each after the previous turn ends. */
async function runDue(items: QueuedPrompt[]) {
  const bySession = new Map<string, QueuedPrompt[]>()
  for (const i of [...items].sort((a, b) => a.createdAt - b.createdAt)) bySession.set(i.sessionId, [...(bySession.get(i.sessionId) ?? []), i])
  await Promise.all(
    [...bySession.values()].map(async (list) => {
      for (const item of list) {
        try {
          const app = useApp.getState()
          // The session was deleted meanwhile: start a fresh one in the same folder.
          const exists = app.sessions[item.sessionId] || app.history.some((h) => h.id === item.sessionId)
          if (exists) {
            await whenIdle(item.sessionId)
            await app.sendTo(item.sessionId, item.text)
          } else {
            await app.startSession(item.cwd)
            const id = useApp.getState().activeId
            if (id) await app.sendTo(id, item.text)
          }
          window.harness.resetQueueDone(item.id)
          if (exists) await new Promise((r) => setTimeout(r, 1500))
        } catch {
          // Left in the queue; main hands it over again in a few minutes.
        }
      }
    }),
  )
}

/** Mounted once: keeps the queue state fresh and sends messages when main says they're due. */
export function useResetQueueRunner() {
  useEffect(() => {
    void useResetQueue.getState().load()
    return window.harness.onResetQueueFire((items) => void runDue(items))
  }, [])
}
