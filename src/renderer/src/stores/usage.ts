import { useEffect } from 'react'
import { create } from 'zustand'
import type { PlanUsage } from '@shared/planUsage'

interface UsageStore {
  usage: PlanUsage | null
  load(): Promise<void>
}

let listening = false

/** This laptop's Claude plan usage, as main reports it. */
export const useUsage = create<UsageStore>((set) => ({
  usage: null,
  async load() {
    if (!listening) {
      listening = true
      window.harness.onUsage((usage) => set({ usage }))
    }
    set({ usage: await window.harness.usageState() })
  },
}))

/** This laptop's plan usage, loading it (and listening for changes) the first time it's used. */
export function useMyUsage(): PlanUsage | null {
  const usage = useUsage((s) => s.usage)
  useEffect(() => {
    if (!useUsage.getState().usage) void useUsage.getState().load()
  }, [])
  return usage
}
