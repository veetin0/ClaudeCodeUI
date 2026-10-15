import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import type { SaverNote } from '@shared/usageSaver'
import { applyEvent, createSession } from '../src/renderer/src/stores/reducer'
import { saverStatus } from '../src/renderer/src/lib/saver'

const session = () => createSession({ id: 's', cwd: '/p', title: '', createdAt: 0, updatedAt: 0, costUsd: 0 })
const note = (n: SaverNote, ts = 1): HarnessEvent => ({ type: 'saver', note: n, sessionId: 's', ts })
const config = (auto = true, enabled = true): SaverNote => ({ kind: 'config', enabled, auto, compact: true, skipGenerated: true, leanOutput: true })
const route = (model: 'opus' | 'sonnet', switched: boolean, extra: Partial<Extract<SaverNote, { kind: 'route' }>> = {}): SaverNote => ({
  kind: 'route',
  model,
  turn: model === 'opus' ? 'think' : 'build',
  reason: 'r',
  switched,
  text: `${model} because r`,
  ...extra,
})

describe('Usage saver in the chat and the status chip', () => {
  it('says whether each turn saves, and notes only the changes', () => {
    const s = session()
    for (const e of [note(config()), note(route('opus', true)), note(route('opus', false)), note(route('sonnet', true)), note(route('sonnet', false))]) applyEvent(s, e)
    // The first decision and each switch appear in the chat; repeats only update the chip.
    expect(s.items.filter((i) => i.kind === 'saver').map((i) => i.kind === 'saver' && i.tone)).toEqual(['power', 'saving'])
    expect(s.saver?.stats).toMatchObject({ opusTurns: 2, sonnetTurns: 2 })
    expect(saverStatus(s)).toMatchObject({ tone: 'saving', label: 'Saving · Sonnet' })
    applyEvent(s, note(route('opus', true, { midTurn: true, text: 'Opus took over mid-task' })))
    expect(saverStatus(s)).toMatchObject({ tone: 'power', label: 'Not saving · Opus', detail: 'Opus took over mid-task' })
    expect(s.saver?.stats.takeovers).toBe(1)
  })

  it('counts compactions and skipped files, and hides the saver’s own turn', () => {
    const s = session()
    applyEvent(s, note(config()))
    applyEvent(s, note({ kind: 'compact', preTokens: 120_000, postTokens: 15_000 }))
    applyEvent(s, { type: 'turn.end', isError: false, result: '', costUsd: 0.1, durationMs: 9000, numTurns: 1, outputTokens: 5, internal: true, sessionId: 's', ts: 2 })
    applyEvent(s, note({ kind: 'skip', path: '/p/package-lock.json', bytes: 200_000, what: 'lockfile' }))
    expect(s.items.some((i) => i.kind === 'turn')).toBe(false)
    expect(s.totalCostUsd).toBeCloseTo(0.1)
    expect(s.saver?.stats).toMatchObject({ compactions: 1, compactedTokens: 105_000, skipped: 1, skippedTokens: 50_000 })
    const texts = s.items.flatMap((i) => (i.kind === 'saver' ? [i.text] : []))
    expect(texts[0]).toMatch(/120k → 15k tokens/)
    expect(texts[1]).toMatch(/package-lock\.json whole/)
  })

  it('describes manual and switched-off sessions honestly', () => {
    const manual = session()
    applyEvent(manual, note(config(false)))
    manual.model = 'claude-opus-5-5'
    expect(saverStatus(manual)).toMatchObject({ tone: 'power', label: 'Not saving · your model' })
    manual.model = 'sonnet'
    expect(saverStatus(manual)).toMatchObject({ tone: 'saving' })
    const off = session()
    applyEvent(off, note(config(true, false)))
    expect(saverStatus(off)).toMatchObject({ tone: 'off' })
    expect(saverStatus(session())).toBeNull()
  })

  it('notes switching between Auto and a hand-picked model', () => {
    const s = session()
    applyEvent(s, note(config(true)))
    applyEvent(s, note(config(false)))
    applyEvent(s, note(config(true)))
    expect(s.items.map((i) => i.kind === 'saver' && i.text.slice(0, 20))).toEqual(['You picked the model', 'Auto is back on: the'])
  })
})
