import { describe, expect, it } from 'vitest'
import { headroom, type PlanUsage } from '@shared/planUsage'
import { UsageMonitor, type UsageMonitorDeps } from '../src/main/system/UsageMonitor'
import { migrateStored, RETIRED_SETTINGS } from '../src/main/system/settingsMigrate'

const NOW = Date.parse('2026-11-14T10:00:00Z')

function monitor(over: Partial<UsageMonitorDeps> = {}) {
  const pushed: PlanUsage[] = []
  const limits: (number | undefined)[] = []
  const m = new UsageMonitor({
    usesApiKey: () => false,
    planUsage: async () => undefined,
    push: (u) => pushed.push(u),
    onLimitReached: (t) => limits.push(t),
    ...over,
  })
  return { m, pushed, limits }
}

describe('plan usage on this laptop', () => {
  it('reads the usage call as percent, so a fresh window is not shown as full', async () => {
    const reading = { subscription: 'max', available: true, fiveHour: { utilization: 1, resetsAt: '2026-11-14T12:00:00Z' }, sevenDay: { utilization: 0.5, resetsAt: null } }
    const { m, pushed } = monitor({ planUsage: async () => reading })
    await m.poll()
    expect(m.state()).toMatchObject({ source: 'plan', subscription: 'max', fiveHour: { pct: 1, resetsAt: Date.parse('2026-11-14T12:00:00Z') }, sevenDay: { pct: 0.5 } })
    reading.fiveHour.utilization = 140
    await m.poll()
    expect(m.state().fiveHour?.pct).toBe(100)
    expect(pushed).toHaveLength(2)
  })

  it('takes rate-limit events from sessions and alerts once when the limit is hit', () => {
    const { m, limits } = monitor()
    m.onRateLimit({ status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.82, resetsAt: NOW / 1000 + 3600 } as never)
    expect(m.state()).toMatchObject({ source: 'plan', status: 'allowed_warning', fiveHour: { pct: 82, resetsAt: NOW + 3600_000 } })
    m.onRateLimit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: NOW / 1000 + 3600 } as never)
    m.onRateLimit({ status: 'rejected', rateLimitType: 'five_hour', resetsAt: NOW / 1000 + 3600 } as never)
    expect(limits).toEqual([NOW + 3600_000])
    // Keeps the last window reading when an event has no utilization.
    expect(m.state().fiveHour?.pct).toBe(82)
  })

  it('has no plan limits with an API key', () => {
    const { m } = monitor({ usesApiKey: () => true })
    expect(m.state().source).toBe('api-key')
  })

  it('ranks headroom: what is left of the tighter window', () => {
    expect(headroom({ source: 'plan', fiveHour: { pct: 20 }, sevenDay: { pct: 40 } }, NOW)).toBe(60)
    expect(headroom({ source: 'plan', status: 'rejected', resetsAt: NOW + 7200_000 }, NOW)).toBe(0)
    expect(headroom({ source: 'plan', fiveHour: { pct: 99, resetsAt: NOW - 1 } }, NOW)).toBe(100) // window already reset
  })
})

describe('settings from earlier versions', () => {
  it('makes the event project the current project and drops retired settings', () => {
    const old = {
      eventProject: '/work/app',
      hackforgeMode: 'always',
      team: { name: 'x' },
      teamMemberId: 'abcd',
      handoffDirs: ['/tmp/h'],
      crewAutoReports: true,
      teamServer: 'https://relay',
      notifications: false,
    }
    const out = migrateStored(old)
    expect(out).toEqual({ project: '/work/app', notifications: false })
    for (const k of RETIRED_SETTINGS) expect(k in out).toBe(false)
  })

  it('keeps a project already set, and leaves new files alone', () => {
    expect(migrateStored({ project: '/new', eventProject: '/old' })).toEqual({ project: '/new' })
    expect(migrateStored({ project: null, eventProject: '/old' })).toEqual({ project: null })
    expect(migrateStored({ defaultModel: 'opus' })).toEqual({ defaultModel: 'opus' })
  })
})
