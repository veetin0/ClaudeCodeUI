import { EPHEMERAL_EVENTS, type HarnessEvent } from '@shared/events'

/**
 * Every saved-worthy event per session, kept outside the reactive store (it only grows and is
 * read only for replay). Live sessions append as events arrive; saved ones are seeded on open.
 */
const logs = new Map<string, HarnessEvent[]>()

export function appendEvents(events: HarnessEvent[]) {
  for (const e of events) {
    if (EPHEMERAL_EVENTS.has(e.type)) continue
    let log = logs.get(e.sessionId)
    if (!log) logs.set(e.sessionId, (log = []))
    log.push(e)
  }
}

export function seedLog(sessionId: string, events: HarnessEvent[]) {
  logs.set(sessionId, events.filter((e) => !EPHEMERAL_EVENTS.has(e.type)))
}

export function getLog(sessionId: string): HarnessEvent[] {
  return logs.get(sessionId) ?? []
}

export function dropLog(sessionId: string) {
  logs.delete(sessionId)
}
