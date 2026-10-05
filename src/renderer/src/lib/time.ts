const DAY = 86_400_000

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "Today" / "Yesterday" / "Previous 7 days" / "Previous 30 days" / "Month Year" buckets for the history list. */
export function dateGroup(t: number, now = Date.now()): string {
  const today = startOfDay(now)
  if (t >= today) return 'Today'
  if (t >= today - DAY) return 'Yesterday'
  if (t >= today - 7 * DAY) return 'Previous 7 days'
  if (t >= today - 30 * DAY) return 'Previous 30 days'
  return new Date(t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function relativeTime(t: number, now = Date.now()): string {
  const s = Math.round((now - t) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Electron prefixes errors thrown in ipcMain handlers; show just the message. */
export function ipcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
