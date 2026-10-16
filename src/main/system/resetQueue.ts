import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { nextRunAt, type QueuedPrompt, type ResetQueueState } from '@shared/resetQueue'
import type { PlanUsage } from '@shared/team'

export interface ResetQueueDeps {
  /** Where the queue is saved, so it survives a restart. */
  file: string
  settings(): { enabled: boolean; keepAwake: boolean }
  usage(): PlanUsage
  push(state: ResetQueueState): void
  /** Hands due messages to the window to send; false when there's no window to do it. */
  fire(items: QueuedPrompt[]): boolean
  onRan?(count: number): void
  /** Keeps the computer awake (powerSaveBlocker); returns a handle for unblock. */
  block?(): number
  unblock?(handle: number): void
  now?(): number
}

/** Rechecked this often, so a laptop waking from sleep after the reset still runs the queue. */
const CHECK_MS = 30_000
/** A message handed to the window but not confirmed sent is handed over again after this. */
const RETRY_MS = 3 * 60_000

/**
 * "Run when my limit resets": messages wait here (on disk) and are sent when the usage window
 * resets. The switch can be turned off any time; queued messages then just wait.
 */
export class ResetQueue {
  private items: QueuedPrompt[] = []
  private timer?: NodeJS.Timeout
  private interval?: NodeJS.Timeout
  private blocker?: number
  /** Ids handed to the window and when, so they aren't sent twice. */
  private firing = new Map<string, number>()

  constructor(private readonly deps: ResetQueueDeps) {
    try {
      if (existsSync(deps.file)) this.items = (JSON.parse(readFileSync(deps.file, 'utf8')) as { items?: QueuedPrompt[] }).items ?? []
    } catch {
      this.items = []
    }
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  start() {
    this.interval = setInterval(() => this.check(), CHECK_MS)
    this.refresh()
  }

  state(): ResetQueueState {
    const { enabled, keepAwake } = this.deps.settings()
    const { at, limited } = nextRunAt(this.deps.usage(), this.items, this.now())
    return { enabled, keepAwake, items: this.items, runsAt: at, limited }
  }

  add(item: Omit<QueuedPrompt, 'id' | 'createdAt'>): ResetQueueState {
    this.items = [...this.items, { ...item, id: randomUUID(), createdAt: this.now() }]
    this.save()
    this.refresh()
    return this.state()
  }

  remove(id: string): ResetQueueState {
    this.items = this.items.filter((i) => i.id !== id)
    this.firing.delete(id)
    this.save()
    this.refresh()
    return this.state()
  }

  /** The window sent it. */
  done(id: string) {
    const had = this.items.some((i) => i.id === id)
    this.remove(id)
    if (had) this.deps.onRan?.(1)
  }

  /** Usage readings, settings or the queue changed: reschedule and tell the window. */
  refresh() {
    clearTimeout(this.timer)
    const s = this.state()
    if (s.enabled && s.items.length && s.runsAt !== undefined) {
      // Timers can't be longer than ~24.8 days; the periodic check covers anything beyond.
      this.timer = setTimeout(() => this.check(), Math.min(Math.max(0, s.runsAt - this.now()), 2 ** 31 - 1))
    }
    this.keepAwake(s.enabled && s.keepAwake && s.items.length > 0)
    this.deps.push(s)
  }

  /** Sends what's due, if the switch is on. */
  check() {
    const s = this.state()
    const now = this.now()
    if (!s.enabled || !s.items.length || s.runsAt === undefined || s.runsAt > now) return
    const due = s.items.filter((i) => now - (this.firing.get(i.id) ?? 0) > RETRY_MS)
    if (!due.length) return
    if (this.deps.fire(due)) for (const i of due) this.firing.set(i.id, now)
  }

  private keepAwake(on: boolean) {
    if (on && this.blocker === undefined && this.deps.block) this.blocker = this.deps.block()
    else if (!on && this.blocker !== undefined) {
      this.deps.unblock?.(this.blocker)
      this.blocker = undefined
    }
  }

  private save() {
    try {
      writeFileSync(this.deps.file, JSON.stringify({ items: this.items }, null, 2))
    } catch {
      // The queue still works for this run.
    }
  }

  dispose() {
    clearTimeout(this.timer)
    clearInterval(this.interval)
    this.keepAwake(false)
  }
}
