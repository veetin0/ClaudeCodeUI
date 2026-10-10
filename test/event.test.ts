import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { eventClock, formatInZone, formatSpan, pickEvent, pickProgress, zonedTime, zoneLabel } from '@shared/event'
import { JUNCTION_2026_EVENT_YAML } from '@shared/presets/junction2026'

const junction = pickEvent(YAML.parse(JUNCTION_2026_EVENT_YAML))
const at = (iso: string) => Date.parse(iso)

describe('time zones', () => {
  it('reads Helsinki wall-clock times across the DST change', () => {
    // Summer time (UTC+3) in October, winter time (UTC+2) in November.
    expect(zonedTime('2026-10-07 12:00', 'Europe/Helsinki')).toBe(at('2026-10-07T09:00Z'))
    expect(zonedTime('2026-11-13 16:00', 'Europe/Helsinki')).toBe(at('2026-11-13T14:00Z'))
    expect(zoneLabel(at('2026-11-13T14:00Z'), 'Europe/Helsinki')).toBe('UTC+2')
    expect(formatInZone(at('2026-11-15T08:00Z'), 'Europe/Helsinki')).toBe('Sun 10:00')
  })

  it('keeps explicit offsets', () => {
    expect(zonedTime('2026-11-13T16:00+03:00', 'Europe/Helsinki')).toBe(at('2026-11-13T13:00Z'))
  })

  it('formats spans', () => {
    expect(formatSpan(37 * 86_400_000 + 4 * 3_600_000)).toBe('37d 4h')
    expect(formatSpan(5 * 3_600_000 + 12 * 60_000)).toBe('5h 12m')
    expect(formatSpan(48 * 60_000)).toBe('48m')
  })
})

describe('Junction 2026 preset', () => {
  it('parses', () => {
    expect(junction).toMatchObject({ id: 'junction-2026', name: 'Junction 2026', timezone: 'Europe/Helsinki', teamSize: 4 })
    expect(junction.partners).toHaveLength(16)
    expect(junction.milestones.filter((m) => m.kind === 'deadline').map((m) => m.id)).toEqual(['preliminary', 'final'])
    expect(new Set(junction.checklist.map((c) => c.id)).size).toBe(junction.checklist.length)
    expect(new Set(junction.milestones.map((m) => m.id)).size).toBe(junction.milestones.length)
  })

  it('counts down before the event', () => {
    const c = eventClock(junction, at('2026-10-07T10:00Z'))
    expect(c.stage).toBe('before')
    expect(c.next?.id).toBe('doors-open')
    expect(c.nextDeadline?.id).toBe('preliminary')
    expect(c.start).toBe(at('2026-11-13T14:00Z'))
    expect(c.end).toBe(at('2026-11-15T16:00Z'))
  })

  it('tracks deadlines and sleep shifts during the event', () => {
    const fri = eventClock(junction, at('2026-11-13T19:00Z')) // 21:00 Helsinki
    expect(fri.stage).toBe('during')
    expect(fri.next?.id).toBe('decision')
    expect(fri.nextDeadline?.id).toBe('preliminary')
    const satNight = eventClock(junction, at('2026-11-15T01:00Z')) // 03:00 Helsinki
    expect(satNight.ongoing.map((m) => m.id)).toEqual(['sleep-b2'])
    expect(satNight.nextDeadline?.id).toBe('final')
    expect(eventClock(junction, at('2026-11-16T00:00Z')).stage).toBe('after')
  })

  it('tolerates junk', () => {
    expect(pickEvent({ name: 'X', schedule: [{ label: 'no time' }, 'bad', { label: 'ok', at: '2026-01-01 10:00', kind: 'weird' }] }).milestones).toEqual([
      { id: 'ok', label: 'ok', at: '2026-01-01 10:00', end: undefined, kind: 'plan', note: undefined },
    ])
    expect(pickProgress({ done: { a: true, b: 'x' }, partners: { OpenAI: { keys: true } } })).toEqual({ done: { a: true }, partners: { OpenAI: { keys: true, kit: false } } })
  })

  it('falls back to UTC with a warning for an unknown time zone instead of crashing', () => {
    const cfg = pickEvent({ timezone: 'Europe/Helsnki', schedule: [{ label: 'Doors', at: '2026-11-13 16:00', kind: 'official' }] })
    expect(cfg).toMatchObject({ timezone: 'UTC', invalidTimezone: 'Europe/Helsnki' })
    // Everything the event view renders with the zone must work.
    const clock = eventClock(cfg, at('2026-11-01T00:00Z'))
    expect(clock.start).toBe(at('2026-11-13T16:00Z'))
    expect(formatInZone(clock.start, cfg.timezone)).toMatch(/16:00/)
    expect(zoneLabel(clock.start, cfg.timezone)).toBe('UTC+0')
    expect(junction.invalidTimezone).toBeUndefined()
  })
})
