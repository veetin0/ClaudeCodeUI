import type { PlanUsage } from './team'

/** A message waiting for the usage window to reset. */
export interface QueuedPrompt {
  id: string
  sessionId: string
  cwd: string
  /** Session title at the time, for the list. */
  title: string
  text: string
  createdAt: number
}

export interface ResetQueueState {
  /** Run queued messages automatically at the reset (the on/off switch). */
  enabled: boolean
  /** Keep this computer from sleeping while messages wait. */
  keepAwake: boolean
  items: QueuedPrompt[]
  /** When they run (epoch ms), if known. */
  runsAt?: number
  /** The usage limit is reached right now. */
  limited: boolean
}

/** Extra time after the reset before sending, so the plan has surely rolled over. */
export const RESET_GRACE_MS = 45_000
const WINDOW_MS = 5 * 3600_000

/**
 * When queued messages should run: at the reset of the limit that's hit, else at the end of the
 * current 5-hour window. Without any reading, 5 hours after the oldest message was queued.
 */
export function nextRunAt(u: PlanUsage, items: QueuedPrompt[], now: number): { at?: number; limited: boolean } {
  const limited = u.status === 'rejected' && (!u.resetsAt || u.resetsAt > now)
  if (!items.length) return { limited }
  const reset = u.status === 'rejected' ? (u.resetsAt ?? u.fiveHour?.resetsAt) : u.fiveHour?.resetsAt
  const oldest = Math.min(...items.map((i) => i.createdAt))
  return { at: (reset ?? oldest + WINDOW_MS) + RESET_GRACE_MS, limited }
}
