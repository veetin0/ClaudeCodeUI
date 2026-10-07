import { useEffect } from 'react'
import { create } from 'zustand'
import type { MemberSession, TeamState } from '@shared/team'
import { basename } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { toolDisplayName, toolSummary } from '@/lib/tools'
import { useApp } from './app'
import type { SessionState } from './reducer'

interface TeamStore {
  state: TeamState | null
  error: string | null
  busy: boolean
  load(): Promise<void>
  create(opts: { name: string; host: boolean; relayUrl?: string }): Promise<boolean>
  join(code: string, name: string): Promise<boolean>
  leave(): Promise<void>
  update(patch: { name?: string; focus?: string }): Promise<void>
}

let listening = false

export const useTeam = create<TeamStore>((set) => {
  const run = async (fn: () => Promise<TeamState>) => {
    set({ busy: true })
    try {
      set({ state: await fn(), error: null })
      return true
    } catch (err) {
      set({ error: ipcErrorMessage(err) })
      return false
    } finally {
      set({ busy: false })
    }
  }
  return {
    state: null,
    error: null,
    busy: false,
    async load() {
      if (!listening) {
        listening = true
        window.harness.onTeam((state) => set({ state }))
      }
      set({ state: await window.harness.teamState() })
    },
    create: (opts) => run(() => window.harness.teamCreate(opts)),
    join: (code, name) => run(() => window.harness.teamJoin(code, name)),
    leave: () => run(() => window.harness.teamLeave()).then(() => {}),
    update: (patch) => run(() => window.harness.teamUpdate(patch)).then(() => {}),
  }
})

export function useTeamState(): TeamState | null {
  const state = useTeam((s) => s.state)
  useEffect(() => {
    if (!useTeam.getState().state) void useTeam.getState().load()
  }, [])
  return state
}

/** What the main agent is doing right now, e.g. "Bash: npm test". */
function activity(s: SessionState): string | undefined {
  if (s.status === 'waiting') return 'Waiting for approval'
  const running = Object.values(s.tools).filter((t) => t.status === 'running' && t.agentId === null)
  const t = running.at(-1)
  if (!t) return s.status === 'running' ? 'Thinking' : undefined
  const sum = toolSummary(t.name, t.input)
  return `${toolDisplayName(t.name)}${sum ? `: ${sum}` : ''}`.slice(0, 90)
}

export function summarizeSessions(sessions: SessionState[]): MemberSession[] {
  return sessions
    .filter((s) => s.live && !s.observed)
    .map((s) => ({
      title: s.title || 'New session',
      project: basename(s.cwd),
      status: s.status,
      activity: activity(s),
      subagents: Object.values(s.subagents).filter((a) => a.status === 'running').length,
    }))
}

/** Reports this machine's sessions to the team board every few seconds while in a team. */
export function useTeamReporter() {
  useEffect(() => {
    void useTeam.getState().load()
    const tick = () => {
      if (!useTeam.getState().state?.config) return
      const app = useApp.getState()
      const sessions = app.order.map((id) => app.sessions[id]).filter(Boolean)
      const active = app.activeId ? app.sessions[app.activeId] : undefined
      window.harness.teamSetLocal({ sessions: summarizeSessions(sessions), cwd: active?.live ? active.cwd : undefined })
    }
    const t = setInterval(tick, 3000)
    tick()
    return () => clearInterval(t)
  }, [])
}
