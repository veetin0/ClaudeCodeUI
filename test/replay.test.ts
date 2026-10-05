import { describe, expect, it } from 'vitest'
import { stateAt } from '../src/renderer/src/stores/replay'
import { createSession } from '../src/renderer/src/stores/reducer'
import { loadFixture, normalizeAll, reduceAll } from './replay'

describe('session replay', () => {
  const events = normalizeAll(loadFixture('tasks-and-subagent.json')).filter((e) => e.type !== 'text.delta' && e.type !== 'thinking.delta')
  // Spread timestamps so there's something to scrub through.
  events.forEach((e, i) => (e.ts = 1000 + i * 100))
  const base = createSession({ id: 's1', cwd: '/p', title: '', createdAt: 0, updatedAt: 0, costUsd: 0 })
  const at = (t: number) => reduceAll(events.filter((e) => e.ts <= t))

  it('matches a fresh reduce at any point, moving forward and backward', () => {
    const end = events.at(-1)!.ts
    for (const t of [1000, 2500, end / 2, end, 1800]) {
      const s = stateAt(base, events, t)
      const fresh = at(t)
      expect(s.items).toEqual(fresh.items)
      expect(Object.keys(s.tools)).toEqual(Object.keys(fresh.tools))
      expect(s.todos).toEqual(fresh.todos)
    }
  })

  it('is never interactive', () => {
    const s = stateAt(base, events, events.at(-1)!.ts)
    expect(s.live).toBe(false)
    expect(s.permissions).toEqual([])
  })
})
