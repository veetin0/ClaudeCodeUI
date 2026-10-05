import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { produce } from 'immer'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent } from '@shared/events'
import { EventNormalizer } from '../src/main/events/normalizer'
import { applyEvent, createSession, type SessionState } from '../src/renderer/src/stores/reducer'

export function loadFixture(name: string): SDKMessage[] {
  return JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8'))
}

export function normalizeAll(messages: SDKMessage[], sessionId = 's1'): HarnessEvent[] {
  let t = 0
  const n = new EventNormalizer(sessionId, () => ++t)
  return messages.flatMap((m) => n.normalize(m))
}

export function reduceAll(events: HarnessEvent[], sessionId = 's1'): SessionState {
  const initial = createSession({ id: sessionId, cwd: '/p', title: '', createdAt: 0, updatedAt: 0, costUsd: 0 })
  return produce(initial, (draft) => {
    for (const e of events) applyEvent(draft, e)
  })
}
