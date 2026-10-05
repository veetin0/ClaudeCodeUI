import { useEffect, useState } from 'react'

/** Re-renders every `intervalMs` while `since` is set and returns ms elapsed. */
export function useElapsed(since: number | undefined, intervalMs = 250): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (since === undefined) return
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [since, intervalMs])
  return since === undefined ? 0 : Math.max(0, now - since)
}
