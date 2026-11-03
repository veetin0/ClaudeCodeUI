import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { currentChecklistGroup, eventClock, formatInZone, formatSpan, pickEvent, pickProgress, zonedTime, zoneLabel } from '@shared/event'
import { eventPreset } from '@shared/presets/hackathon'

// Generated on Wed 28 Oct 2026 for Helsinki: the example event is the weekend of 13–15 Nov.
const preset = pickEvent(YAML.parse(eventPreset('weekend-hackathon', Date.parse('2026-10-28T10:00Z'), 'Europe/Helsinki').yaml))
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

describe('The example event preset', () => {
  it('always lies ahead: the first Friday at least two weeks away, in the given time zone', () => {
    for (const now of ['2026-01-01T12:00Z', '2026-06-19T23:30Z', '2027-03-05T08:00Z']) {
      const cfg = pickEvent(YAML.parse(eventPreset('weekend-hackathon', Date.parse(now), 'America/New_York').yaml))
      const start = eventClock(cfg, Date.parse(now)).start!
      expect(start - Date.parse(now)).toBeGreaterThanOrEqual(13 * 86_400_000)
      expect(start - Date.parse(now)).toBeLessThan(22 * 86_400_000)
      expect(cfg.milestones.find((m) => m.id === 'doors-open')?.at).toMatch(/ 16:00$/)
      expect(new Date(start).getUTCDay()).toBe(5)
    }
  })

  it('gives HackForge the final deadline with the zone offset', () => {
    expect(eventPreset('weekend-hackathon', Date.parse('2026-10-28T10:00Z'), 'Europe/Helsinki').hackforge.deadline).toBe('2026-11-15T10:00+02:00')
    expect(eventPreset('weekend-hackathon', Date.parse('2026-06-01T10:00Z'), 'America/New_York').hackforge.deadline).toBe('2026-06-21T10:00-04:00')
  })

  it('parses', () => {
    expect(preset).toMatchObject({ id: 'weekend-hackathon', name: 'Weekend Hackathon', timezone: 'Europe/Helsinki', teamSize: 4 })
    expect(preset.partners).toHaveLength(9)
    expect(preset.milestones.filter((m) => m.kind === 'deadline').map((m) => m.id)).toEqual(['preliminary', 'final'])
    expect(new Set(preset.checklist.map((c) => c.id)).size).toBe(preset.checklist.length)
    expect(new Set(preset.milestones.map((m) => m.id)).size).toBe(preset.milestones.length)
  })

  it('counts down before the event', () => {
    const c = eventClock(preset, at('2026-10-07T10:00Z'))
    expect(c.stage).toBe('before')
    expect(c.next?.id).toBe('doors-open')
    expect(c.nextDeadline?.id).toBe('preliminary')
    expect(c.start).toBe(at('2026-11-13T14:00Z'))
    expect(c.end).toBe(at('2026-11-15T16:00Z'))
  })

  it('tracks deadlines and sleep shifts during the event', () => {
    const fri = eventClock(preset, at('2026-11-13T19:00Z')) // 21:00 Helsinki
    expect(fri.stage).toBe('during')
    expect(fri.next?.id).toBe('decision')
    expect(fri.nextDeadline?.id).toBe('preliminary')
    const satNight = eventClock(preset, at('2026-11-14T02:00Z')) // 04:00 Helsinki
    expect(satNight.ongoing.map((m) => m.id)).toEqual(['sleep-1'])
    expect(satNight.nextDeadline?.id).toBe('final')
    expect(eventClock(preset, at('2026-11-16T00:00Z')).stage).toBe('after')
  })

  it('tolerates junk', () => {
    expect(pickEvent({ name: 'X', schedule: [{ label: 'no time' }, 'bad', { label: 'ok', at: '2026-01-01 10:00', kind: 'weird' }] }).milestones).toEqual([
      { id: 'ok', label: 'ok', at: '2026-01-01 10:00', end: undefined, kind: 'plan', note: undefined },
    ])
    expect(pickProgress({ done: { a: true, b: 'x' }, partners: { OpenAI: { keys: true } } })).toEqual({ done: { a: true }, partners: { OpenAI: { keys: true, kit: false } } })
  })

  it('gives repeated labels their own ids so ticking one does not tick the other', () => {
    const cfg = pickEvent({
      schedule: [
        { label: 'Standup', at: '2026-11-14 09:00' },
        { label: 'Standup', at: '2026-11-15 09:00' },
      ],
      checklist: [
        { group: 'preliminary', label: 'Push to GitHub' },
        { group: 'final', label: 'Push to GitHub' },
        { id: 'push-to-github-2', label: 'Explicit id' },
        { id: 'standup', label: 'Explicit wins over a generated id' },
      ],
    })
    expect(cfg.milestones.map((m) => m.id)).toEqual(['standup', 'standup-2'])
    expect(pickEvent({ schedule: [{ label: 'Demo', at: '2026-11-14 09:00' }, { id: 'demo', label: 'Final demo', at: '2026-11-15 09:00' }] }).milestones.map((m) => m.id)).toEqual(['demo-2', 'demo'])
    expect(cfg.checklist.map((c) => c.id)).toEqual(['push-to-github', 'push-to-github-3', 'push-to-github-2', 'standup'])
    expect(new Set(preset.checklist.map((c) => c.id)).size).toBe(preset.checklist.length)
  })

  it('falls back to UTC with a warning for an unknown time zone instead of crashing', () => {
    const cfg = pickEvent({ timezone: 'Europe/Helsnki', schedule: [{ label: 'Doors', at: '2026-11-13 16:00', kind: 'official' }] })
    expect(cfg).toMatchObject({ timezone: 'UTC', invalidTimezone: 'Europe/Helsnki' })
    // Everything the event view renders with the zone must work.
    const clock = eventClock(cfg, at('2026-11-01T00:00Z'))
    expect(clock.start).toBe(at('2026-11-13T16:00Z'))
    expect(formatInZone(clock.start, cfg.timezone)).toMatch(/16:00/)
    expect(zoneLabel(clock.start, cfg.timezone)).toBe('UTC+0')
    expect(preset.invalidTimezone).toBeUndefined()
  })
})

describe('the checklist that matters now', () => {
  const none = { done: {}, partners: {} }
  it('is the group with the open item due soonest', () => {
    expect(currentChecklistGroup(preset, none)).toBe('prep')
  })

  it('moves on as items are ticked off', () => {
    const prepDone = Object.fromEntries(preset.checklist.filter((c) => c.group === 'prep').map((c) => [c.id, true]))
    const next = currentChecklistGroup(preset, { done: prepDone, partners: {} })
    expect(next).not.toBe('prep')
    const allDone = Object.fromEntries(preset.checklist.map((c) => [c.id, true]))
    expect(currentChecklistGroup(preset, { done: allDone, partners: {} })).toBe('final')
  })
})
