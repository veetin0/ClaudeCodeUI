import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { changePrompt, type PickedElement } from '@shared/pick'
import { classifyPrompt } from '@shared/usageSaver'
import { familyOf, localDay, usageDelta, type ModelTokens } from '@shared/usageHistory'
import { EventNormalizer } from '../src/main/events/normalizer'
import { SessionStore } from '../src/main/store/SessionStore'

const tok = (input: number, output: number, cacheRead = 0, cacheWrite = 0, costUsd = 0): ModelTokens => ({ input, output, cacheRead, cacheWrite, costUsd })

describe('usage history: what each turn used', () => {
  it('takes the difference between cumulative readings, and restarts with a new process', () => {
    expect(usageDelta(undefined, { opus: tok(100, 10) })).toEqual({ opus: tok(100, 10) })
    expect(usageDelta({ opus: tok(100, 10, 5, 0, 0.1) }, { opus: tok(150, 30, 9, 2, 0.3), sonnet: tok(20, 5) })).toEqual({ opus: tok(50, 20, 4, 2, 0.19999999999999998), sonnet: tok(20, 5) })
    // Counters went down: a resumed session's new process counts from zero.
    expect(usageDelta({ opus: tok(500, 50) }, { opus: tok(40, 4) })).toEqual({ opus: tok(40, 4) })
    expect(usageDelta({ opus: tok(5, 5) }, { opus: tok(5, 5) })).toEqual({})
  })

  it('groups models into families', () => {
    expect(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5-20251001', 'claude-fable-5-1'].map(familyOf)).toEqual(['opus', 'sonnet', 'haiku', 'other'])
  })

  it('reads per-model usage from the result message', () => {
    const n = new EventNormalizer('s1')
    const [e] = n.normalize({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'ok',
      total_cost_usd: 0.5,
      duration_ms: 10,
      num_turns: 1,
      usage: { output_tokens: 3 },
      modelUsage: { 'claude-opus-5-5': { inputTokens: 10, outputTokens: 3, cacheReadInputTokens: 100, cacheCreationInputTokens: 20, costUSD: 0.5, contextWindow: 200000 } },
    } as never)
    expect(e).toMatchObject({ type: 'turn.end', contextWindow: 200000, modelUsage: { 'claude-opus-5-5': { input: 10, output: 3, cacheRead: 100, cacheWrite: 20, costUsd: 0.5 } } })
  })

  it('stores turns and adds them up per day, model and session', () => {
    const store = new SessionStore(join(mkdtempSync(join(tmpdir(), 'usage-')), 'h.db'))
    const now = Date.now()
    const ev = (e: Record<string, unknown>, ts = now) => store.record({ sessionId: 's1', ts, ...e } as HarnessEvent)
    const end = (modelUsage: Record<string, ModelTokens>, ts = now) => ev({ type: 'turn.end', isError: false, result: '', costUsd: 0, durationMs: 1, numTurns: 1, outputTokens: 0, modelUsage }, ts)
    store.open({ id: 's1', cwd: '/proj/junction', title: 'Build API', createdAt: now, updatedAt: now, costUsd: 0 })
    end({ 'claude-opus-5-5': tok(1000, 200, 5000, 300, 0.2) })
    end({ 'claude-opus-5-5': tok(1000, 200, 5000, 300, 0.2), 'claude-sonnet-5-5': tok(400, 100, 2000, 0, 0.05) })
    ev({ type: 'session.resumed', claudeSessionId: 'c1' })
    end({ 'claude-sonnet-5-5': tok(50, 50) })
    ev({ type: 'saver', note: { kind: 'route', model: 'sonnet', turn: 'build', reason: 'r', switched: true, text: 't' } })
    ev({ type: 'saver', note: { kind: 'route', model: 'opus', turn: 'think', reason: 'r', switched: true, midTurn: true, text: 't' } })
    ev({ type: 'saver', note: { kind: 'compact', preTokens: 120_000, postTokens: 20_000 } })
    ev({ type: 'saver', note: { kind: 'skip', path: '/p/package-lock.json', bytes: 200_000, what: 'lockfile' } })
    // Yesterday, for the per-day split.
    end({ 'claude-haiku-4-5': tok(10, 10) }, now - 86_400_000)
    store.recordPlanSample(42, 10, now - 3600_000)
    store.recordPlanSample(42, 10, now - 3500_000) // unchanged, skipped
    store.recordPlanSample(60, 11, now - 60_000)

    const h = store.usageHistory(7, now)
    expect(h.days).toHaveLength(7)
    expect(h.days.at(-1)).toMatchObject({ day: localDay(now), tokens: { opus: 1500, sonnet: 600, haiku: 0, other: 0 }, cacheRead: 7000 })
    expect(h.days.at(-2)?.tokens.haiku).toBe(20)
    expect(h.totals.tokens).toEqual({ opus: 1500, sonnet: 600, haiku: 20, other: 0 })
    expect(h.topSessions[0]).toMatchObject({ id: 's1', title: 'Build API', tokens: 2120 })
    expect(h.saver).toEqual({ sonnetTurns: 1, opusTurns: 0, takeovers: 1, compactions: 1, compactedTokens: 100_000, skipped: 1, skippedTokens: 50_000 })
    expect(h.samples.map((s) => s.fivePct)).toEqual([42, 60])
    expect(store.usageToday(now)).toMatchObject({ tokens: 2100, byModel: { Opus: 1500, Sonnet: 600 } })
    store.close()
  })
})

describe('click to change', () => {
  const el: PickedElement = {
    tag: 'button',
    classes: ['btn', 'primary'],
    text: 'Save changes',
    selector: 'main > form > button.btn.primary',
    html: '<button class="btn primary">Save changes</button>',
    rect: { x: 10, y: 20, width: 120, height: 36 },
    attrs: { type: 'submit' },
    components: ['SettingsForm', 'Button'],
    framework: 'react',
    url: 'http://localhost:5173/settings',
  }

  it('tells Claude where the element is and what to change', () => {
    const p = changePrompt(el, 'make it green and a bit bigger')
    expect(p).toMatch(/picked in Harness's preview at http:\/\/localhost:5173\/settings; a screenshot of it is attached/)
    expect(p).toMatch(/<button class="btn primary"> with text "Save changes"/)
    expect(p).toMatch(/Components \(react\): SettingsForm › Button/)
    expect(p).toMatch(/Requested change: make it green and a bit bigger/)
    expect(p).toMatch(/search for its text, classes or component name/)
    expect(changePrompt({ ...el, source: 'src/Settings.vue:12' }, 'x')).toMatch(/Make the change in that source file/)
  })

  it('lets the Usage saver judge the request, not the element details around it', () => {
    const opts = { firstTurn: true, permissionMode: 'default' as const, hackforgeLean: true }
    expect(classifyPrompt(changePrompt(el, 'make it green and a bit bigger'), opts)).toMatchObject({ kind: 'build', reason: 'a change to one element on the page' })
    expect(classifyPrompt(changePrompt(el, 'redesign this whole form'), opts).kind).toBe('think')
  })
})
