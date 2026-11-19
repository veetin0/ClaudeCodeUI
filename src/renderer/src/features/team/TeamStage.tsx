import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { TEAM } from './cast'
import { nextChange, pickShown, teamOf, type TeamMember } from './pose'
import { Sprite, useTeamMode } from './Sprite'

const BUBBLE = {
  waiting: { glyph: '?', className: 'bg-warn text-rail', label: 'needs you' },
  done: { glyph: '✓', className: 'bg-ok text-white', label: 'done' },
  failed: { glyph: '!', className: 'bg-danger text-white', label: 'failed' },
} as const

/** Re-renders at the next time-based change (a one-shot ending, someone leaving); events re-render the rest. */
function useStageClock(s: SessionState, frozen: boolean) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (frozen) return
    const next = nextChange(s, Date.now())
    if (next === undefined) return
    const t = setTimeout(() => tick((n) => n + 1), Math.max(40, next - Date.now() + 30))
    return () => clearTimeout(t)
  })
}

/**
 * The team at work: the manager on the left handing out work, and every agent on stage as its
 * character, doing what its agent is doing. New agents run in; finished ones leave after a while.
 * Click a character for its agent.
 */
export function TeamStage({
  session,
  scale = 3,
  compact = false,
  className,
}: {
  session: SessionState
  scale?: 2 | 3
  /** Narrow places (the side panel): characters stand closer and go without name tags. */
  compact?: boolean
  className?: string
}) {
  const mode = useTeamMode()
  const replayT = useApp((st) => (st.replay?.sessionId === session.id ? st.replay.t : undefined))
  useStageClock(session, replayT !== undefined || mode === 'off')
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  if (mode === 'off') return null

  const now = replayT ?? Date.now()
  const team = teamOf(session, now)
  const size = TEAM.frame * scale
  // A frame is mostly air around a ~16 px figure, so compact slots overlap the frames, not the figures.
  const slot = compact ? 20 * scale : size + 8 * scale
  const gap = compact ? 0 : 8
  const room = width - 16 // the stage's padding
  const fitsAll = Math.floor((room + gap) / (slot + gap))
  // Full: leave room for the "+N" chip (about 44 px).
  const shown = pickShown(team, team.length > fitsAll ? Math.max(1, Math.floor((room - 44) / (slot + gap))) : fitsAll)
  const extra = team.length - shown.length
  const floor = 6 * scale

  const open = (key: string) => {
    const app = useApp.getState()
    if (app.activeId !== session.id || app.place !== 'session') app.select(session.id)
    useApp.getState().openAgent(key)
  }
  const board = () => {
    const app = useApp.getState()
    if (app.activeId !== session.id || app.place !== 'session') app.select(session.id)
    useApp.getState().setView('agents')
  }

  return (
    <div
      ref={ref}
      role="group"
      aria-label={`The team: ${team.map((m) => m.label).join(', ')}`}
      className={cn('team-stage relative flex items-end overflow-hidden rounded-lg border border-line px-2', className)}
      style={{ '--floor': `${floor}px`, height: compact ? size + 4 + floor / 2 : size + 18 + 4 * scale, gap } as CSSProperties}
    >
      {shown.map((m) => (
        <Member
          key={m.key}
          m={m}
          scale={scale}
          slot={slot}
          floor={floor}
          tag={!compact}
          animate={mode === 'animated' && replayT === undefined}
          onOpen={() => open(m.key)}
        />
      ))}
      {team.length === 1 && !compact && (
        <p className="mb-[calc(var(--floor)+10px)] self-end text-[12px] text-muted">Teammates join here as Claude hands out work.</p>
      )}
      {extra > 0 && (
        <button
          onClick={board}
          className="num relative z-10 ml-auto self-end rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] font-semibold hover:bg-surface-2"
          style={{ marginBottom: floor + 4 }}
          title="Everyone on the Agents board"
        >
          +{extra}
        </button>
      )}
    </div>
  )
}

function Member({
  m,
  scale,
  slot,
  floor,
  tag,
  animate,
  onOpen,
}: {
  m: TeamMember
  scale: number
  slot: number
  floor: number
  tag: boolean
  animate: boolean
  onOpen: () => void
}) {
  // Only agents that start while the stage is showing walk in; the ones already there just stand.
  const [entering] = useState(() => animate && m.agent.id !== null && m.agent.startedAt !== undefined && Date.now() - m.agent.startedAt < 1500)
  const bubble = m.pose.bubble ? BUBBLE[m.pose.bubble] : undefined
  const name = m.agent.id === null ? 'Manager' : m.agent.name
  return (
    <button
      onClick={onOpen}
      title={`${m.label}: ${m.activity.title}`}
      aria-label={`${m.label}: ${m.activity.title}${bubble ? `, ${bubble.label}` : ''}`}
      className={cn('group relative flex shrink-0 flex-col items-center outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/50', entering && 'team-enter')}
      style={{ width: slot, paddingBottom: tag ? 2 : floor / 2 }}
    >
      {bubble && (
        <span
          aria-hidden
          className={cn('absolute z-10 flex size-[18px] items-center justify-center rounded-[3px] border-2 border-[#1a1a1a] text-[11px] font-bold leading-none', bubble.className)}
          style={{ top: 0, left: slot / 2 + 4 * scale }}
        >
          {bubble.glyph}
        </span>
      )}
      <Sprite character={m.character} variant={m.variant} anim={m.pose.anim} scale={scale} className="mt-1 shrink-0" />
      {tag && (
        <span
          className="num max-w-full truncate rounded-[3px] bg-surface/85 px-1 text-[11px] leading-[15px] text-fg group-hover:bg-surface"
          style={{ marginTop: -scale, marginBottom: Math.max(0, floor - 15) / 2 }}
        >
          {name}
        </span>
      )}
    </button>
  )
}
