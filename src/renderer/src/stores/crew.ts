import { useEffect } from 'react'
import { create } from 'zustand'
import { EMPTY_CREW, type CrewState } from '@shared/crew'

interface CrewStore {
  state: CrewState
  loaded: boolean
  load(): Promise<void>
}

let listening = false

export const useCrewStore = create<CrewStore>((set) => ({
  state: EMPTY_CREW,
  loaded: false,
  async load() {
    if (!listening) {
      listening = true
      window.harness.onCrew((state) => set({ state, loaded: true }))
    }
    set({ state: await window.harness.crewState(), loaded: true })
  },
}))

/** Crew mode: teammates' Claudes (harness-crew), their missions and questions. */
export function useCrew(): CrewState {
  const state = useCrewStore((s) => s.state)
  useEffect(() => {
    if (!useCrewStore.getState().loaded) void useCrewStore.getState().load()
  }, [])
  return state
}
