import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { loadFixture, normalizeAll, reduceAll } from './replay'

describe('reducer replaying a recorded session', () => {
  const s = reduceAll(normalizeAll(loadFixture('tasks-and-subagent.json')))

  it('ends idle with no streaming leftovers and a turn summary', () => {
    expect(s.streamingText).toBe('')
    expect(s.items.at(-1)).toMatchObject({ kind: 'turn', isError: false })
    expect(s.totalCostUsd).toBeGreaterThan(0)
  })

  it('keeps subagent tool calls out of the main transcript', () => {
    const mainToolIds = s.items.filter((i) => i.kind === 'tool').map((i) => i.id)
    const sub = Object.values(s.subagents)[0]
    expect(sub.status).toBe('completed')
    expect(sub.toolIds.length).toBeGreaterThan(0)
    for (const id of sub.toolIds) expect(mainToolIds).not.toContain(id)
    expect(sub.lastText).toBeTruthy()
  })

  it('has every tool finished and the task list completed', () => {
    expect(Object.values(s.tools).every((t) => t.status !== 'running')).toBe(true)
    expect(s.todos.map((t) => t.status)).toEqual(['completed', 'completed'])
  })
})

describe('reducer with a background subagent', () => {
  const s = reduceAll(normalizeAll(loadFixture('background-subagent.json')))

  it('keeps the background subagent running after the turn ends', () => {
    const sub = Object.values(s.subagents)[0]
    expect(sub.background).toBe(true)
    expect(sub.status).toBe('running')
  })
})

describe('reducer: permissions and status', () => {
  const base = { sessionId: 's1', ts: 1 } as const
  it('adds and clears permission requests', () => {
    const events: HarnessEvent[] = [
      { ...base, type: 'permission.request', requestId: 'r1', toolUseId: 't1', agentId: null, toolName: 'Bash', input: { command: 'ls' }, canAlwaysAllow: true },
    ]
    expect(reduceAll(events).permissions).toHaveLength(1)
    events.push({ ...base, type: 'permission.resolved', requestId: 'r1', behavior: 'allow' })
    expect(reduceAll(events).permissions).toHaveLength(0)
  })

  it('computes per-turn cost from the cumulative session total', () => {
    const turn = (costUsd: number): HarnessEvent => ({ ...base, type: 'turn.end', isError: false, result: '', costUsd, durationMs: 1, numTurns: 1, outputTokens: 10 })
    const s = reduceAll([turn(0.1), turn(0.25)])
    const turns = s.items.filter((i) => i.kind === 'turn')
    expect(turns.map((t) => (t.kind === 'turn' ? +t.costUsd.toFixed(2) : 0))).toEqual([0.1, 0.15])
    expect(s.totalCostUsd).toBe(0.25)
    expect(s.outputTokens).toBe(20)
  })
})

describe('reducer: saved sessions', () => {
  const base = { sessionId: 's1' } as const
  it('replays a saved log into a resumable, finished state', async () => {
    const { produce } = await import('immer')
    const { createSession, applyEvent, finalizeLoaded } = await import('../src/renderer/src/stores/reducer')
    const events = normalizeAll(loadFixture('background-subagent.json'))
    const s = produce(createSession({ id: 's1', cwd: '/p', title: '', createdAt: 0, updatedAt: 0, costUsd: 0 }, 'default', false), (d) => {
      for (const e of events) applyEvent(d, e)
      finalizeLoaded(d)
    })
    expect(s.live).toBe(false)
    expect(s.status).toBe('closed')
    expect(Object.values(s.subagents).every((x) => x.status !== 'running')).toBe(true)
    expect(s.items.length).toBeGreaterThan(3)
  })

  it('titles from the first prompt and carries cost across a resume', () => {
    const turn = (costUsd: number, ts: number): HarnessEvent => ({ ...base, ts, type: 'turn.end', isError: false, result: '', costUsd, durationMs: 1, numTurns: 1, outputTokens: 0 })
    const s = reduceAll([
      { ...base, ts: 1, type: 'user.message', id: 'u1', text: 'Build the thing\nplease' },
      turn(0.3, 2),
      { ...base, ts: 3, type: 'status', status: 'closed' },
      { ...base, ts: 4, type: 'session.resumed', claudeSessionId: 'c' },
      turn(0.05, 5),
    ])
    expect(s.title).toBe('Build the thing please')
    expect(s.live).toBe(true)
    expect(s.totalCostUsd).toBeCloseTo(0.35)
    const turns = s.items.filter((i) => i.kind === 'turn')
    expect(turns.at(-1)).toMatchObject({ costUsd: expect.closeTo(0.05, 5) })
  })
})
