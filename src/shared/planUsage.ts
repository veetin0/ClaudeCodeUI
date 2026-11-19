/** How much of the Claude plan this laptop has used, from what Claude Code reports while sessions run. */

export interface UsageWindow {
  /** Percent used, 0–100. */
  pct: number
  /** Epoch ms when the window resets. */
  resetsAt?: number
}

export interface PlanUsage {
  /** 'plan' = claude.ai subscription limits apply; 'api-key' = billed per token, no plan limits. */
  source: 'plan' | 'api-key' | 'unknown'
  subscription?: string
  fiveHour?: UsageWindow
  sevenDay?: UsageWindow
  /** Latest rate-limit status from the CLI. */
  status?: 'allowed' | 'allowed_warning' | 'rejected'
  /** When the status/limit that applies resets (epoch ms). */
  resetsAt?: number
  /** When this reading was taken (epoch ms). */
  at?: number
}

/** How much room is left, 0 (none) – 100 (all). Unknown counts as half. */
export function headroom(u: PlanUsage, now: number): number {
  if (u.source === 'api-key') return 90
  if (u.status === 'rejected' && (!u.resetsAt || u.resetsAt > now)) return 0
  const left = (w?: UsageWindow) => (w && (!w.resetsAt || w.resetsAt > now) ? 100 - w.pct : w ? 100 : undefined)
  const five = left(u.fiveHour)
  const week = left(u.sevenDay)
  if (five === undefined && week === undefined) return u.status === 'allowed_warning' ? 20 : 50
  return Math.max(0, Math.min(five ?? 100, week ?? 100))
}
