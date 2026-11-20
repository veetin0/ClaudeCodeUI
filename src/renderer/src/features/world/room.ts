import manifest from '@/assets/world/manifest.json'
import { currentActivity, toolActivityKind, type ActivityKind, type AgentView } from '@/features/agents/model'
import type { Character } from '@/features/team/cast'
import { DONE_MS, EXIT_MS, LEAVE_FAILED_MS, LEAVE_MS, failedStep, type TeamMember } from '@/features/team/pose'
import type { SessionState } from '@/stores/reducer'

export type StationId = 'office' | 'whiteboard' | 'bench' | 'drafting' | 'shelf' | 'window' | 'console' | 'lab' | 'lounge' | 'floor' | 'door'
export type TimeOfDay = 'day' | 'dusk' | 'night'

export interface PropInfo {
  name: string
  /** Where its 4 frames sit in props.png. */
  x: number
  y: number
  w: number
  h: number
  ms: number
  /** Top-left corners in the room. */
  at: [number, number][]
}

export interface WorldManifest {
  room: { w: number; h: number; wall: number; back: number; front: number }
  strip: { w: number; h: number; floor: number }
  props: PropInfo[]
  propsSheet: { w: number; h: number }
  stations: Record<StationId, { label: string; spots: [number, number][] }>
}

/** The workshop drawn by scripts/team/world.py: sizes, props and every station's spots (feet positions). */
export const WORLD = manifest as unknown as WorldManifest

/** Where each kind of work happens. */
const BY_KIND: Record<ActivityKind, StationId> = {
  writing: 'bench',
  editing: 'bench',
  running: 'console',
  reading: 'shelf',
  searching: 'shelf',
  browsing: 'window',
  delegating: 'whiteboard',
  planning: 'whiteboard',
  thinking: 'whiteboard',
  waiting: 'whiteboard',
  idle: 'lounge',
  done: 'lounge',
}
/** Architects draft at the drafting table; scientists test and write up at the lab bench. */
const BY_CHARACTER: Partial<Record<Character, Partial<Record<ActivityKind, StationId>>>> = {
  architect: { writing: 'drafting', editing: 'drafting', planning: 'drafting' },
  scientist: { running: 'lab', browsing: 'lab', writing: 'lab', editing: 'lab' },
}

const stationFor = (c: Character, kind: ActivityKind): StationId => BY_CHARACTER[c]?.[kind] ?? BY_KIND[kind]

/** The kind of the agent's newest tool call, running or not. */
function lastKind(a: AgentView): ActivityKind | undefined {
  let last: AgentView['tools'][number] | undefined
  for (const t of a.tools) if (!last || t.startedAt >= last.startedAt) last = t
  return last ? toolActivityKind(last) : undefined
}

/**
 * Where a member is headed now. The manager keeps to the office. Others go where their work is;
 * a failed step keeps them where it failed; waiting for you keeps them where they were. Finished
 * agents celebrate where they worked, go for coffee, and head out the door before they leave.
 */
export function stationOf(m: TeamMember, now: number): StationId {
  const a = m.agent
  if (a.id === null) return 'office'
  const c = m.character
  if (a.state === 'completed' || a.state === 'failed' || a.state === 'stopped') {
    if (a.state === 'stopped' || a.endedAt === undefined) return 'door'
    const leave = (a.state === 'failed' ? LEAVE_FAILED_MS : LEAVE_MS) - EXIT_MS
    if (now - a.endedAt >= leave) return 'door'
    if (a.state === 'failed' || now - a.endedAt < DONE_MS) return stationFor(c, lastKind(a) ?? 'thinking')
    return 'lounge'
  }
  if (a.state === 'waiting') return stationFor(c, lastKind(a) ?? 'thinking')
  const failed = failedStep(a, now)
  if (failed) return stationFor(c, toolActivityKind(failed))
  return stationFor(c, currentActivity(a).kind)
}

export interface Placement {
  member: TeamMember
  station: StationId
  /** Feet position in room pixels (x is the middle of the 32 px frame). */
  x: number
  y: number
}

/**
 * Everyone's spot: members claim their station's spots in team order (the manager, then oldest
 * first), the rest of a busy station queue on the workshop floor, and anyone leaving shares the door.
 */
export function layoutRoom(team: TeamMember[], now: number): Placement[] {
  const taken = new Map<StationId, number>()
  const claim = (st: StationId) => {
    const i = taken.get(st) ?? 0
    taken.set(st, i + 1)
    return i
  }
  return team.map((member) => {
    const station = stationOf(member, now)
    const spots = WORLD.stations[station].spots
    if (station === 'door') return { member, station, x: spots[0][0], y: spots[0][1] }
    const i = claim(station)
    if (i < spots.length) return { member, station, x: spots[i][0], y: spots[i][1] }
    const floor = WORLD.stations.floor.spots
    const f = station === 'floor' ? i : claim('floor')
    if (f < floor.length) return { member, station, x: floor[f][0], y: floor[f][1] }
    // A crowd: stand a little in front of the floor line, spread out.
    const k = f - floor.length
    const x = Math.min(WORLD.room.w - 20, Math.max(20, floor[k % floor.length][0] + 9))
    return { member, station, x, y: Math.min(WORLD.room.h - 2, WORLD.room.front + 10) }
  })
}

/** The sky and the lights follow your clock: dawn and dusk, day, night. */
export function timeOfDay(date: Date): TimeOfDay {
  const h = date.getHours()
  if (h >= 7 && h < 18) return 'day'
  if ((h >= 5 && h < 7) || (h >= 18 && h < 20)) return 'dusk'
  return 'night'
}

/** "3 agents working · 1 needs you · 2 done", or what Claude itself is up to when it works alone. */
export function teamSummary(s: SessionState): string {
  const subs = Object.values(s.subagents)
  const working = subs.filter((x) => x.status === 'running').length
  const waiting = s.permissions.length
  const done = subs.filter((x) => x.status === 'completed').length
  const parts: string[] = []
  if (working > 0) parts.push(`${working} agent${working === 1 ? '' : 's'} working`)
  else if (s.status === 'running' || s.status === 'compacting') parts.push('Claude is working')
  if (waiting > 0) parts.push(`${waiting} need${waiting === 1 ? 's' : ''} you`)
  if (done > 0) parts.push(`${done} done`)
  return parts.length ? parts.join(' · ') : 'Resting'
}
