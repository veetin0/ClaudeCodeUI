import { useEffect } from 'react'
import { create } from 'zustand'
import type { HackforgeSnapshot } from '@shared/hackforge'

interface HackforgeState {
  /** Latest snapshot per project folder. */
  snaps: Record<string, HackforgeSnapshot>
  set(snap: HackforgeSnapshot): void
}

export const useHackforgeStore = create<HackforgeState>((set) => ({
  snaps: {},
  set: (snap) => set((s) => ({ snaps: { ...s.snaps, [snap.cwd]: snap } })),
}))

let listening = false
const refs = new Map<string, number>()

/** Keeps a project's HackForge snapshot live while any component shows it. */
export function useHackforge(cwd: string | undefined): HackforgeSnapshot | undefined {
  useEffect(() => {
    if (!cwd) return
    if (!listening) {
      listening = true
      window.harness.onHackforge((s) => useHackforgeStore.getState().set(s))
    }
    const n = refs.get(cwd) ?? 0
    refs.set(cwd, n + 1)
    if (n === 0) void window.harness.hackforgeWatch(cwd).then((s) => useHackforgeStore.getState().set(s), () => {})
    return () => {
      const left = (refs.get(cwd) ?? 1) - 1
      if (left > 0) refs.set(cwd, left)
      else {
        refs.delete(cwd)
        window.harness.hackforgeUnwatch(cwd)
      }
    }
  }, [cwd])
  return useHackforgeStore((s) => (cwd ? s.snaps[cwd] : undefined))
}
