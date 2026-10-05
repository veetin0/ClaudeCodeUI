import { useEffect, useState } from 'react'
import { useApp } from '@/stores/app'

/**
 * Re-renders every `intervalMs` while `since` is set and returns ms elapsed. During a replay,
 * "now" is the playhead, so timers show what they showed at that moment.
 */
export function useElapsed(since: number | undefined, intervalMs = 250): number {
  const replayT = useApp((s) => s.replay?.t)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (since === undefined || replayT !== undefined) return
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [since, intervalMs, replayT])
  if (since === undefined) return 0
  return Math.max(0, (replayT ?? now) - since)
}
