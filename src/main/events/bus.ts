import type { WebContents } from 'electron'
import type { HarnessEvent } from '@shared/events'
import { IPC } from '@shared/ipc'

const FLUSH_MS = 33 // ~30fps

/** Collects events and ships them to the renderer in batches so heavy streaming stays smooth. */
export class EventBus {
  private queue: HarnessEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private targets = new Set<WebContents>()
  private listeners = new Set<(e: HarnessEvent) => void>()

  attach(wc: WebContents) {
    this.targets.add(wc)
    wc.once('destroyed', () => this.targets.delete(wc))
  }

  /** In-process subscribers (persistence, notifications, dock badge). */
  subscribe(fn: (e: HarnessEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(events: HarnessEvent | HarnessEvent[]) {
    const list = Array.isArray(events) ? events : [events]
    if (list.length === 0) return
    for (const e of list) for (const l of this.listeners) l(e)
    this.queue.push(...list)
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS)
  }

  private flush() {
    this.timer = null
    const batch = this.queue
    this.queue = []
    for (const wc of this.targets) if (!wc.isDestroyed()) wc.send(IPC.events, batch)
  }
}
