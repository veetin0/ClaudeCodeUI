import { produce } from 'immer'
import type { HarnessEvent } from '@shared/events'
import { useApp, useActiveSession } from './app'
import { getLog } from './eventLog'
import { applyEvent, createSession, type SessionState } from './reducer'

/** Incremental replay cache: moving forward applies only the new events. */
let cache: { sessionId: string; index: number; t: number; state: SessionState } | null = null

export function stateAt(base: SessionState, log: HarnessEvent[], t: number): SessionState {
  if (!cache || cache.sessionId !== base.id || t < cache.t) {
    cache = { sessionId: base.id, index: 0, t: -Infinity, state: createSession({ id: base.id, cwd: base.cwd, title: '', createdAt: base.createdAt, updatedAt: 0, costUsd: 0, model: base.model, observed: base.observed }, base.permissionMode, false) }
  }
  let i = cache.index
  while (i < log.length && log[i].ts <= t) i++
  if (i !== cache.index) {
    const from = cache.index
    cache.state = produce(cache.state, (d) => {
      for (let k = from; k < i; k++) applyEvent(d, log[k])
    })
    cache.index = i
  }
  cache.t = t
  // A replay is never interactive.
  return { ...cache.state, live: false, permissions: [] }
}

/** The session to render: the live one, or its reconstruction at the replay time. */
export function useDisplaySession(): SessionState | null {
  const live = useActiveSession()
  const replay = useApp((s) => s.replay)
  if (!live || !replay || replay.sessionId !== live.id) return live
  return stateAt(live, getLog(live.id), replay.t)
}

export function replayBounds(sessionId: string): { start: number; end: number; marks: { t: number; kind: 'prompt' | 'turn' | 'subagent' }[] } {
  const log = getLog(sessionId)
  type Mark = { t: number; kind: 'prompt' | 'turn' | 'subagent' }
  const marks: Mark[] = []
  for (const e of log) {
    if (e.type === 'user.message') marks.push({ t: e.ts, kind: 'prompt' })
    else if (e.type === 'turn.end' && !e.internal) marks.push({ t: e.ts, kind: 'turn' })
    else if (e.type === 'subagent.start') marks.push({ t: e.ts, kind: 'subagent' })
  }
  return { start: log[0]?.ts ?? 0, end: log.at(-1)?.ts ?? 0, marks }
}
