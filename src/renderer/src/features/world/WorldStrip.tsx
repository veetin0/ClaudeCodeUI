import { Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { useApp, type AppState } from '@/stores/app'
import { useProject } from '@/stores/project'
import type { SessionState } from '@/stores/reducer'
import { useDisplaySession } from '@/stores/replay'
import { TeamStage } from '@/features/team/TeamStage'
import { useTeamMode } from '@/features/team/Sprite'
import { teamSummary } from './room'
import { stripUrl, useTimeOfDay } from './useWorld'

const INK = '#2a1f2e'
const PANEL = {
  background: 'rgb(251 247 234 / 0.94)',
  color: INK,
  border: `2px solid ${INK}`,
}

/** A busy session (working, or waiting for you) to show when you're not in one; else the one open. */
function busiest(s: AppState): SessionState | null {
  for (const id of s.order) {
    const x = s.sessions[id]
    if (x && (x.status === 'running' || x.status === 'waiting')) return x
  }
  return s.activeId ? (s.sessions[s.activeId] ?? null) : null
}

/** The team to show: the session you're in; on Project, its build; elsewhere whoever is busy. */
function useStripSession(): SessionState | null {
  const place = useApp((s) => s.place)
  const display = useDisplaySession()
  const buildId = useProject((s) => s.state?.record?.sessionId)
  const build = useApp((s) => (buildId ? s.sessions[buildId] : undefined))
  const busy = useApp(busiest)
  if (place === 'session') return display
  if (place === 'project') return build ?? busy
  return busy
}

/**
 * A strip of the team's workshop along the bottom of every screen: the corridor (its windows
 * follow your clock), the team at work, and a way into Agents › World. It folds away to a tab.
 */
export function WorldStrip() {
  const mode = useTeamMode()
  const on = useApp((s) => s.settings?.worldStrip ?? true)
  const ready = useApp((s) => s.settings !== null)
  const focus = useApp((s) => s.focusMode)
  const session = useStripSession()
  const time = useTimeOfDay()
  if (!ready || mode === 'off' || focus) return null
  const update = (worldStrip: boolean) => void useApp.getState().updateSettings({ worldStrip })

  if (!on) {
    return (
      <button
        onClick={() => update(true)}
        className="ui-pixel absolute bottom-2 right-3 z-20 flex items-center gap-1 px-2 py-0.5 text-[12px]"
        style={PANEL}
        title="Show the team strip"
      >
        <ChevronUp className="size-3.5" /> Team
      </button>
    )
  }

  const openWorld = () => {
    if (!session) return
    const app = useApp.getState()
    if (app.activeId !== session.id || app.place !== 'session') app.select(session.id)
    useApp.getState().setAgentsMode('world')
  }

  return (
    <div
      data-testid="world-strip"
      className="ui-pixel relative flex h-[68px] shrink-0 items-stretch"
      style={{
        backgroundImage: `url(${stripUrl(time)})`,
        backgroundSize: '192px 68px',
        backgroundRepeat: 'repeat-x',
        imageRendering: 'pixelated',
        boxShadow: `inset 0 2px 0 ${INK}`,
      }}
    >
      {session ? (
        <TeamStage session={session} scale={2} compact bare height={68} className="min-w-0 flex-1" />
      ) : (
        <div className="flex min-w-0 flex-1 items-center px-4">
          <p className="truncate px-2 py-0.5 text-[12px]" style={PANEL}>
            No one is at work. Describe an idea on Home and press Build it, and the team moves in.
          </p>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-1.5 pr-3">
        {session && (
          <div className="max-w-[220px] px-2 py-0.5 leading-tight" style={PANEL}>
            <div className="truncate text-[12px] font-semibold">{session.title || 'New session'}</div>
            <div className="num text-[13px]">
              {teamSummary(session)}
            </div>
          </div>
        )}
        {session && (
          <button onClick={openWorld} className="flex items-center gap-1 px-2 py-1 text-[12px]" style={PANEL} title="The team in its workshop (Agents › World)">
            <Building2 className="size-3.5" /> World
          </button>
        )}
        <button onClick={() => update(false)} className="px-1 py-1" style={PANEL} title="Hide the team strip" aria-label="Hide the team strip">
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
