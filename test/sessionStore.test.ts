import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { makeTitle, SessionStore } from '../src/main/store/SessionStore'
import { loadFixture, normalizeAll } from './replay'

let dir: string
let store: SessionStore
const summary = (id: string) => ({ id, cwd: '/proj/app', title: '', createdAt: 1, updatedAt: 1, costUsd: 0 })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-store-'))
  store = new SessionStore(join(dir, 'harness.db'))
})
afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('SessionStore', () => {
  it('saves a recorded session and loads it back without streaming deltas', () => {
    store.open(summary('s1'))
    const events = normalizeAll(loadFixture('tasks-and-subagent.json'), 's1')
    for (const e of events) store.record(e)
    store.flush()

    const loaded = store.load('s1')!
    expect(loaded.events.some((e) => e.type === 'text.delta')).toBe(false)
    expect(loaded.events.length).toBe(events.filter((e) => e.type !== 'text.delta' && e.type !== 'thinking.delta' && e.type !== 'tool.progress').length)
    expect(loaded.summary.claudeSessionId).toBeTruthy()
    expect(loaded.summary.model).toContain('haiku')
    expect(loaded.summary.costUsd).toBeGreaterThan(0)
  })

  it('titles a session from its first prompt and orders history by activity', () => {
    store.open(summary('a'))
    store.open(summary('b'))
    const msg = (sessionId: string, text: string, ts: number): HarnessEvent => ({ type: 'user.message', id: text, text, sessionId, ts })
    store.record(msg('a', 'Fix the login bug', 10))
    store.record(msg('a', 'And add a test', 11))
    store.record(msg('b', 'Train a model', 20))
    store.flush()
    const list = store.list()
    expect(list.map((s) => s.id)).toEqual(['b', 'a'])
    expect(list[1].title).toBe('Fix the login bug')
  })

  it('accumulates cost across a resume (the CLI restarts its counter)', () => {
    store.open(summary('s'))
    const turn = (costUsd: number, ts: number): HarnessEvent => ({ type: 'turn.end', isError: false, result: '', costUsd, durationMs: 1, numTurns: 1, outputTokens: 1, sessionId: 's', ts })
    store.record(turn(0.3, 1))
    store.record({ type: 'session.resumed', claudeSessionId: 'c', sessionId: 's', ts: 2 })
    store.record(turn(0.05, 3))
    store.flush()
    expect(store.get('s')!.costUsd).toBeCloseTo(0.35)
  })

  it('continues sequence numbers after reopening the database', () => {
    store.open(summary('s'))
    store.record({ type: 'user.message', id: '1', text: 'one', sessionId: 's', ts: 1 })
    store.close()
    store = new SessionStore(join(dir, 'harness.db'))
    store.record({ type: 'user.message', id: '2', text: 'two', sessionId: 's', ts: 2 })
    store.flush()
    expect(store.load('s')!.events.map((e) => (e.type === 'user.message' ? e.text : ''))).toEqual(['one', 'two'])
  })

  it('ignores events for unknown sessions and deletes with cascade', () => {
    store.record({ type: 'user.message', id: '1', text: 'x', sessionId: 'ghost', ts: 1 })
    store.open(summary('s'))
    store.record({ type: 'user.message', id: '1', text: 'x', sessionId: 's', ts: 1 })
    store.flush()
    store.delete('s')
    expect(store.list()).toEqual([])
    expect(store.load('s')).toBeNull()
  })

  it('makes one-line titles', () => {
    expect(makeTitle('  Fix\n the   bug  ')).toBe('Fix the bug')
    expect(makeTitle('x'.repeat(200))).toHaveLength(80)
  })
})
