import { useEffect, useState } from 'react'
import { timeOfDay, type TimeOfDay } from './room'

const ROOMS = import.meta.glob('../../assets/world/room-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const STRIPS = import.meta.glob('../../assets/world/strip-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export const roomUrl = (t: TimeOfDay) => ROOMS[`../../assets/world/room-${t}.png`]
export const stripUrl = (t: TimeOfDay) => STRIPS[`../../assets/world/strip-${t}.png`]
export { default as propsUrl } from '../../assets/world/props.png?url'

/** localStorage['harness-world-time'] pins the time of day (day, dusk or night), for screenshots. */
function pick(): TimeOfDay {
  try {
    const pinned = localStorage.getItem('harness-world-time')
    if (pinned === 'day' || pinned === 'dusk' || pinned === 'night') return pinned
  } catch {
    // No storage: follow the clock.
  }
  return timeOfDay(new Date())
}

/** The time of day by your clock, checked every minute. */
export function useTimeOfDay(): TimeOfDay {
  const [t, setT] = useState(pick)
  useEffect(() => {
    const id = setInterval(() => setT(pick()), 60_000)
    return () => clearInterval(id)
  }, [])
  return t
}

/** The system's reduced-motion setting: characters then stand still and jump to their spots. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return reduced
}
