import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { DONE_MS, EXIT_MS, LEAVE_MS, teamOf } from '../src/renderer/src/features/team/pose'
import { layoutRoom, stationOf, teamSummary, timeOfDay, WORLD } from '../src/renderer/src/features/world/room'
import { reduceAll } from './replay'

const at = (ts: number) => ({ sessionId: 's1', ts }) as const
const start = (ts: number, id: string, name: string, input: Record<string, unknown> = {}, agentId: string | null = null): HarnessEvent => ({
  ...at(ts),
  type: 'tool.start',
  toolUseId: id,
  agentId,
  name,
  input,
})
const end = (ts: number, id: string, isError = false): HarnessEvent => ({ ...at(ts), type: 'tool.end', toolUseId: id, isError, output: '' })
const running: HarnessEvent = { ...at(1), type: 'status', status: 'running' }
const spawn = (ts: number, id: string, type: string): HarnessEvent => start(ts, id, 'Agent', { description: `do ${type}`, subagent_type: type })
const where = (events: HarnessEvent[], now: number) =>
  Object.fromEntries(layoutRoom(teamOf(reduceAll(events), now), now).map((p) => [p.member.key, p]))
const station = (events: HarnessEvent[], now: number, key: string) => stationOf(teamOf(reduceAll(events), now, { all: true }).find((m) => m.key === key)!, now)

describe('the workshop', () => {
  it('keeps the manager at the office desk', () => {
    const p = where([running, start(2, 'm1', 'Bash', { command: 'ls' })], 10)
    expect(p.main.station).toBe('office')
    expect([p.main.x, p.main.y]).toEqual(WORLD.stations.office.spots[0])
  })

  it('sends each kind of work to its station', () => {
    const t = 5000
    const events = [
      running,
      spawn(1000, 'b1', 'general-purpose'), start(1100, 'b1w', 'Edit', { file_path: '/p/a.ts' }, 'b1'),
      spawn(1000, 'b2', 'general-purpose'), start(1100, 'b2r', 'Bash', { command: 'npm test' }, 'b2'),
      spawn(1000, 'e1', 'Explore'), start(1100, 'e1s', 'Grep', { pattern: 'x' }, 'e1'),
      spawn(1000, 'e2', 'Explore'), start(1100, 'e2w', 'WebFetch', { url: 'https://example.com' }, 'e2'),
      spawn(1000, 'a1', 'Plan'), start(1100, 'a1w', 'Write', { file_path: '/p/plan.md' }, 'a1'),
      spawn(1000, 's1x', 'ecc:code-reviewer'), start(1100, 's1r', 'Bash', { command: 'npx playwright test' }, 's1x'),
      spawn(1000, 'b3', 'general-purpose'),
    ]
    const st = (k: string) => station(events, t, k)
    expect(st('b1')).toBe('bench')
    expect(st('b2')).toBe('console')
    expect(st('e1')).toBe('shelf')
    expect(st('e2')).toBe('window')
    expect(st('a1')).toBe('drafting')
    expect(st('s1x')).toBe('lab')
    expect(st('b3')).toBe('whiteboard') // thinking
  })

  it('keeps an agent where a step failed, and where it was while it waits for you', () => {
    const failed = [running, spawn(1000, 'b1', 'general-purpose'), start(1100, 'b1r', 'Bash', { command: 'npm run build' }, 'b1'), end(2000, 'b1r', true)]
    expect(station(failed, 2500, 'b1')).toBe('console')
    expect(station(failed, 9000, 'b1')).toBe('whiteboard') // back to thinking
    const ask: HarnessEvent = { ...at(1300), type: 'permission.request', requestId: 'r1', toolUseId: 'b1w', agentId: 'b1', toolName: 'Write', input: {}, canAlwaysAllow: true }
    const waiting = [running, spawn(1000, 'b1', 'general-purpose'), start(1200, 'b1w', 'Write', { file_path: '/p/a.ts' }, 'b1'), ask]
    expect(station(waiting, 1500, 'b1')).toBe('bench')
  })

  it('celebrates where it worked, has a coffee, then walks out the door', () => {
    const done = [running, spawn(1000, 'r1', 'ecc:code-reviewer'), start(1100, 'r1r', 'Read', { file_path: '/p/a.ts' }, 'r1'), end(4000, 'r1r'), end(5000, 'r1')]
    expect(station(done, 5100, 'r1')).toBe('shelf')
    expect(station(done, 5000 + DONE_MS + 1, 'r1')).toBe('lounge')
    expect(station(done, 5000 + LEAVE_MS - EXIT_MS + 1, 'r1')).toBe('door')
  })

  it('gives everyone their own spot, and queues a crowd on the floor', () => {
    const events: HarnessEvent[] = [running]
    for (let i = 0; i < 7; i++) events.push(spawn(1000 + i, `b${i}`, 'general-purpose'), start(1100 + i, `b${i}w`, 'Edit', { file_path: `/p/${i}.ts` }, `b${i}`))
    const p = where(events, 3000)
    const benches = WORLD.stations.bench.spots
    expect([p.b0.x, p.b0.y]).toEqual(benches[0])
    expect([p.b3.x, p.b3.y]).toEqual(benches[3])
    expect([p.b4.x, p.b4.y]).toEqual(WORLD.stations.floor.spots[0])
    const spots = Object.values(p).map((x) => `${x.x},${x.y}`)
    expect(new Set(spots).size).toBe(spots.length)
    // Stable: the same moment lays out the same way.
    expect(where(events, 3000).b2.x).toBe(p.b2.x)
  })

  it('sums up the team in a line', () => {
    expect(teamSummary(reduceAll([running]))).toBe('Claude is working')
    expect(teamSummary(reduceAll([running, spawn(1000, 'b1', 'general-purpose'), spawn(1000, 'b2', 'Explore')]))).toBe('2 agents working')
    expect(teamSummary(reduceAll([]))).toBe('Resting')
  })

  it('follows the clock: day, dusk and dawn, night', () => {
    expect(timeOfDay(new Date(2026, 0, 1, 12))).toBe('day')
    expect(timeOfDay(new Date(2026, 0, 1, 19))).toBe('dusk')
    expect(timeOfDay(new Date(2026, 0, 1, 6))).toBe('dusk')
    expect(timeOfDay(new Date(2026, 0, 1, 23))).toBe('night')
  })
})
