import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { characterFor, cycleMs, TEAM, variantFor } from '../src/renderer/src/features/team/cast'
import { DONE_MS, ENTER_MS, ERROR_MS, LEAVE_MS, nextChange, pickShown, teamOf } from '../src/renderer/src/features/team/pose'
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
const pose = (events: HarnessEvent[], now: number, key = 'main') => teamOf(reduceAll(events), now, { all: true }).find((m) => m.key === key)!

describe('who plays whom', () => {
  it('casts the main agent as the manager and subagents by their type', () => {
    expect(characterFor(undefined, true)).toBe('manager')
    for (const t of ['ecc:code-reviewer', 'ecc:gan-evaluator', 'ecc:security-reviewer', 'ecc:pr-test-analyzer', 'ecc:silent-failure-hunter', 'ecc:e2e-runner'])
      expect(characterFor(t, false), t).toBe('scientist')
    for (const t of ['Plan', 'ecc:planner', 'ecc:gan-planner', 'ecc:architect', 'ecc:code-architect', 'ecc:spec-miner']) expect(characterFor(t, false), t).toBe('architect')
    for (const t of ['Explore', 'ecc:code-explorer', 'ecc:docs-lookup']) expect(characterFor(t, false), t).toBe('explorer')
    for (const t of ['general-purpose', 'ecc:gan-generator', 'ecc:react-build-resolver', 'ecc:refactor-cleaner', 'ecc:tdd-guide', undefined, 'something-new'])
      expect(characterFor(t, false), String(t)).toBe('builder')
  })

  it('gives each agent a stable look from its id', () => {
    expect(variantFor('toolu_abc')).toEqual(variantFor('toolu_abc'))
    const looks = new Set(Array.from({ length: 60 }, (_, i) => JSON.stringify(variantFor(`toolu_${i}`))))
    expect(looks.size).toBe(TEAM.outfits * TEAM.skins)
  })
})

describe('what the manager does', () => {
  it('plans while it works, watches commands and the team, and points at a new teammate', () => {
    expect(pose([running], 5).pose).toEqual({ anim: 'plan' })
    expect(pose([running, start(2, 't1', 'Read', { file_path: '/p/a.ts' })], 5).pose.anim).toBe('plan')
    expect(pose([running, start(2, 't1', 'Bash', { command: 'npm test' })], 5).pose.anim).toBe('watch')
    const events = [running, spawn(1000, 'a1', 'general-purpose')]
    expect(pose(events, 1100).pose.anim).toBe('point_r')
    expect(pose(events, 1000 + cycleMs('manager', 'point_r') + 1).pose.anim).toBe('watch')
  })

  it('waits for you with arms crossed, facepalms at a failed step, and cheers when a turn ends', () => {
    const ask: HarnessEvent = { ...at(3), type: 'permission.request', requestId: 'r1', toolUseId: 't1', agentId: null, toolName: 'Bash', input: {}, canAlwaysAllow: true }
    expect(pose([running, { ...at(2), type: 'status', status: 'waiting' }, ask], 5).pose).toEqual({ anim: 'crossed', bubble: 'waiting' })
    const failed = [running, start(2, 't1', 'Bash', { command: 'npm test' }), end(3, 't1', true)]
    expect(pose(failed, 100).pose.anim).toBe('facepalm')
    expect(pose(failed, 3 + ERROR_MS).pose.anim).toBe('plan')
    const turn: HarnessEvent = { ...at(500), type: 'turn.end', isError: false, result: '', costUsd: 0, durationMs: 1, numTurns: 1, outputTokens: 0 }
    const idle: HarnessEvent = { ...at(500), type: 'status', status: 'idle' }
    expect(pose([running, turn, idle], 600).pose).toEqual({ anim: 'cheer', bubble: 'done' })
    expect(pose([running, turn, idle], 10_000).pose).toEqual({ anim: 'idle' })
  })
})

describe('what the team does', () => {
  it('runs in, then works by kind: builders hammer, scientists inspect, explorers look', () => {
    const builder = [running, spawn(1000, 'b1', 'general-purpose')]
    expect(pose(builder, 1100, 'b1').pose.anim).toBe('run')
    expect(pose([...builder, start(1500, 'w1', 'Edit', { file_path: '/p/a.ts' }, 'b1')], 1000 + ENTER_MS + 10, 'b1').pose.anim).toBe('build')
    expect(pose([...builder, start(1500, 'w1', 'Read', { file_path: '/p/a.ts' }, 'b1')], 2000, 'b1').pose.anim).toBe('ponder')
    const sci = [running, spawn(1000, 's1x', 'ecc:gan-evaluator'), start(1500, 'x1', 'Bash', { command: 'npx playwright test' }, 's1x')]
    expect(pose(sci, 2000, 's1x')).toMatchObject({ character: 'scientist', pose: { anim: 'inspect' } })
    const exp = [running, spawn(1000, 'e1', 'Explore'), start(1500, 'g1', 'Grep', { pattern: 'x' }, 'e1')]
    expect(pose(exp, 2000, 'e1')).toMatchObject({ character: 'explorer', pose: { anim: 'look' } })
    const arch = [running, spawn(1000, 'p1', 'Plan'), start(1500, 'm1', 'Write', { file_path: '/p/plan.md' }, 'p1')]
    expect(pose(arch, 2000, 'p1')).toMatchObject({ character: 'architect', pose: { anim: 'draft' } })
  })

  it('gets knocked down by a failed step, gets back up when work goes on, and stays down when it failed', () => {
    const base = [running, spawn(1000, 'b1', 'general-purpose'), start(1500, 'w1', 'Bash', {}, 'b1'), end(2000, 'w1', true)]
    expect(pose(base, 2100, 'b1').pose.anim).toBe('knocked')
    expect(pose([...base, start(2200, 'w2', 'Edit', { file_path: '/p/a' }, 'b1')], 2300, 'b1').pose.anim).toBe('build')
    const failed = [running, spawn(1000, 'b1', 'general-purpose'), end(5000, 'b1', true)]
    expect(pose(failed, 6000, 'b1').pose).toEqual({ anim: 'knocked', bubble: 'failed' })
    const nervous = [running, spawn(1000, 's1x', 'ecc:code-reviewer'), end(5000, 's1x', true)]
    expect(pose(nervous, 6000, 's1x').pose.anim).toBe('nervous')
  })

  it('celebrates a finish, then rests and leaves the stage', () => {
    const done = [running, spawn(1000, 's1x', 'ecc:code-reviewer'), end(5000, 's1x')]
    expect(pose(done, 5100, 's1x').pose).toEqual({ anim: 'approve', bubble: 'done' })
    expect(pose(done, 5000 + DONE_MS + 1, 's1x').pose).toEqual({ anim: 'idle', bubble: 'done' })
    const s = reduceAll(done)
    expect(teamOf(s, 5000 + LEAVE_MS - 1).map((m) => m.key)).toContain('s1x')
    expect(teamOf(s, 5000 + LEAVE_MS + 1).map((m) => m.key)).toEqual(['main'])
  })

  it('keeps the manager, whoever needs you and the newest busy agents when the stage is full', () => {
    const s = reduceAll([
      running,
      spawn(1000, 'old', 'general-purpose'),
      spawn(1100, 'fin', 'ecc:code-reviewer'),
      end(1500, 'fin'),
      spawn(1200, 'mid', 'Explore'),
      spawn(1300, 'new', 'Plan'),
    ])
    const team = teamOf(s, 2000)
    expect(team.map((m) => m.key)).toEqual(['main', 'old', 'fin', 'mid', 'new'])
    expect(pickShown(team, 9)).toBe(team)
    // The finished reviewer goes first, then the oldest busy one; order on stage stays.
    expect(pickShown(team, 4).map((m) => m.key)).toEqual(['main', 'old', 'mid', 'new'])
    expect(pickShown(team, 3).map((m) => m.key)).toEqual(['main', 'mid', 'new'])
    expect(pickShown(team, 1).map((m) => m.key)).toEqual(['main'])
  })

  it('says when the next time-based change is, so the stage only ticks until then', () => {
    const s = reduceAll([running, spawn(1000, 'b1', 'general-purpose'), end(5000, 'b1')])
    expect(nextChange(s, 1100)).toBe(1000 + ENTER_MS)
    expect(nextChange(s, 5000 + LEAVE_MS + 1)).toBeUndefined()
  })
})
