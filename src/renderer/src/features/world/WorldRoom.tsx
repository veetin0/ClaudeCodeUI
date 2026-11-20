import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { TEAM } from '@/features/team/cast'
import { LOCOMOTION, teamOf, type TeamMember } from '@/features/team/pose'
import { Sprite, useTeamMode } from '@/features/team/Sprite'
import { useStageClock } from '@/features/team/TeamStage'
import { layoutRoom, teamSummary, WORLD, type Placement } from './room'
import { propsUrl, roomUrl, useReducedMotion, useTimeOfDay } from './useWorld'

/** Walking pace, in room pixels a second; every step is one room pixel. */
const SPEED = 48
const INK = '#2a1f2e'

const BUBBLE = {
  waiting: { glyph: '?', className: 'bg-warn text-rail', label: 'needs you' },
  done: { glyph: '✓', className: 'bg-ok text-white', label: 'done' },
  failed: { glyph: '!', className: 'bg-danger text-white', label: 'failed' },
} as const

/**
 * Agents › World: the team's workshop. Everyone goes to the station that matches their work
 * (benches for writing, the terminal for commands, the shelf for reading, the whiteboard for
 * thinking), new agents come in the door, finished ones go for coffee and then leave. The room is
 * drawn at the largest whole scale that fits; the windows follow your clock.
 */
export function WorldRoom({ session }: { session: SessionState }) {
  const mode = useTeamMode()
  const reduced = useReducedMotion()
  const replayT = useApp((st) => (st.replay?.sessionId === session.id ? st.replay.t : undefined))
  useStageClock(session, replayT !== undefined)
  const time = useTimeOfDay()
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 1200, h: 700 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const now = replayT ?? Date.now()
  const team = teamOf(session, now)
  const placed = layoutRoom(team, now)
  const scale = Math.max(1, Math.min(Math.floor((box.w - 24) / WORLD.room.w), Math.floor((box.h - 24 - 30) / WORLD.room.h)))
  const animate = mode === 'animated' && replayT === undefined && !reduced
  const { w, h } = WORLD.room
  const sheet = WORLD.propsSheet

  return (
    <div ref={ref} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-2 p-3">
      <div
        className="flex shrink-0 flex-col"
        style={{
          boxShadow: `${2 * scale}px ${2 * scale}px 0 rgb(0 0 0 / 0.35)`,
          outline: `${Math.max(2, scale)}px solid ${INK}`,
        }}
      >
        <div className="ui-pixel flex h-[26px] items-center gap-3 px-2.5 text-[12px]" style={{ width: w * scale, background: INK, color: '#f6efdc' }}>
          <span className="min-w-0 flex-1 truncate font-semibold">{session.title || 'New session'}</span>
          <span className="num shrink-0 text-[14px]">
            {teamSummary(session)}
          </span>
        </div>
        <div
          role="group"
          aria-label={`The workshop: ${team.map((m) => m.label).join(', ')}`}
          data-testid="world-room"
          className="relative shrink-0 overflow-hidden"
          style={{
            width: w * scale,
            height: h * scale,
            backgroundImage: `url(${roomUrl(time)})`,
            backgroundSize: '100% 100%',
            imageRendering: 'pixelated',
          }}
        >
          {WORLD.props.flatMap((pr) =>
            pr.at.map(([x, y], i) => (
              <span
                key={`${pr.name}-${i}`}
                aria-hidden
                className={cn('sprite absolute', mode !== 'animated' && 'sprite-still')}
                style={
                  {
                    left: x * scale,
                    top: y * scale,
                    width: pr.w * scale,
                    height: pr.h * scale,
                    backgroundImage: `url(${propsUrl})`,
                    backgroundSize: `${sheet.w * scale}px ${sheet.h * scale}px`,
                    backgroundPositionY: `${-pr.y * scale}px`,
                    '--sprite-w': `${pr.w * 4 * scale}px`,
                    '--sprite-cycle': `${pr.ms * 4}ms`,
                  } as CSSProperties
                }
              />
            )),
          )}
          {placed.map((p) => (
            <Walker key={p.member.key} p={p} scale={scale} animate={animate} onOpen={() => useApp.getState().openAgent(p.member.key)} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** One character: walks pixel by pixel to its spot (flipped when heading left), then does its work. */
function Walker({ p, scale, animate, onOpen }: { p: Placement; scale: number; animate: boolean; onOpen: () => void }) {
  const m: TeamMember = p.member
  const [pos, setPos] = useState(() => {
    const door = WORLD.stations.door.spots[0]
    const entering = animate && m.agent.id !== null && m.agent.startedAt !== undefined && Date.now() - m.agent.startedAt < 1500
    return entering ? { x: door[0], y: door[1] } : { x: p.x, y: p.y }
  })
  const [move, setMove] = useState<{ ms: number; steps: number } | null>(null)
  const [facing, setFacing] = useState<1 | -1>(1)

  useEffect(() => {
    if (pos.x === p.x && pos.y === p.y) return
    if (!animate) {
      setMove(null)
      setPos({ x: p.x, y: p.y })
      return
    }
    const dist = Math.hypot(p.x - pos.x, p.y - pos.y)
    // Next frame, so the step from where it stands is a transition.
    const raf = requestAnimationFrame(() => {
      setFacing(p.x < pos.x ? -1 : 1)
      setMove({
        ms: (dist / SPEED) * 1000,
        steps: Math.max(1, Math.round(dist)),
      })
      setPos({ x: p.x, y: p.y })
    })
    return () => cancelAnimationFrame(raf)
    // pos is where it was headed; only a new spot starts a walk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.x, p.y, animate])
  useEffect(() => {
    if (!move) return
    const t = setTimeout(() => setMove(null), move.ms + 60)
    return () => clearTimeout(t)
  }, [move])

  const size = TEAM.frame * scale
  const anim = move ? LOCOMOTION[m.character] : m.pose.anim
  const bubble = m.pose.bubble ? BUBBLE[m.pose.bubble] : undefined
  const name = m.agent.id === null ? 'Manager' : m.agent.name
  return (
    <button
      onClick={onOpen}
      title={`${m.label}: ${m.activity.title}`}
      aria-label={`${m.label}: ${m.activity.title}${bubble ? `, ${bubble.label}` : ''}`}
      className="group absolute left-0 top-0 outline-none focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-[#6b3fd4]"
      style={{
        width: size,
        height: size,
        transform: `translate(${(pos.x - 16) * scale}px, ${(pos.y - 31) * scale}px)`,
        transition: move ? `transform ${move.ms}ms steps(${move.steps}, end)` : 'none',
        zIndex: 10 + Math.round(pos.y),
      }}
    >
      <Sprite character={m.character} variant={m.variant} anim={anim} scale={scale} className={facing < 0 ? '-scale-x-100' : undefined} />
      {bubble && (
        <span
          aria-hidden
          className={cn('absolute flex items-center justify-center border-2 border-[#1a1a1a] font-bold leading-none', bubble.className)}
          style={{
            top: 2 * scale,
            left: size / 2 + 3 * scale,
            width: 6 * scale + 4,
            height: 6 * scale + 4,
            fontSize: 4 * scale + 3,
          }}
        >
          {bubble.glyph}
        </span>
      )}
      <span
        className="num pointer-events-none absolute left-1/2 top-full hidden -translate-x-1/2 whitespace-nowrap px-1 text-[13px] leading-[16px] group-hover:block group-focus-visible:block"
        style={{
          background: 'rgb(251 247 234 / 0.95)',
          color: INK,
          border: `2px solid ${INK}`,
        }}
      >
        {name}
      </span>
    </button>
  )
}
