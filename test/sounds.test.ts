import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { soundsFor } from '../src/renderer/src/features/world/sound'
import { reduceAll } from './replay'

const at = (ts: number) => ({ sessionId: 's1', ts }) as const
const running: HarnessEvent = { ...at(1), type: 'status', status: 'running' }
const spawn = (ts: number, id: string): HarnessEvent => ({
  ...at(ts),
  type: 'tool.start',
  toolUseId: id,
  agentId: null,
  name: 'Agent',
  input: { description: 'do it', subagent_type: 'general-purpose' },
})
const finish = (ts: number, id: string, status: 'completed' | 'failed'): HarnessEvent => ({ ...at(ts), type: 'subagent.end', taskId: `t-${id}`, toolUseId: id, status, summary: '' })
const turn = (ts: number, isError = false): HarnessEvent => ({ ...at(ts), type: 'turn.end', isError, result: '', costUsd: 0, durationMs: 1, numTurns: 1, outputTokens: 0 })
const ask: HarnessEvent = { ...at(50), type: 'permission.request', requestId: 'r1', toolUseId: 'x', agentId: null, toolName: 'Bash', input: {}, canAlwaysAllow: true }

/** The sounds for what `more` adds to a session after `base`. */
const diff = (base: HarnessEvent[], more: HarnessEvent[]) => soundsFor(reduceAll(base), reduceAll([...base, ...more]))

describe('the team sounds', () => {
  it('stays quiet on the first look at a session and when nothing changed', () => {
    const s = reduceAll([running, spawn(10, 'a')])
    expect(soundsFor(undefined, s)).toEqual([])
    expect(soundsFor(s, s)).toEqual([])
  })

  it('blips when someone joins, finishes or fails, when Claude needs you, and when a turn ends', () => {
    expect(diff([running], [spawn(10, 'a')])).toEqual(['join'])
    expect(diff([running, spawn(10, 'a')], [finish(20, 'a', 'completed')])).toEqual(['done'])
    expect(diff([running, spawn(10, 'a')], [finish(20, 'a', 'failed')])).toEqual(['fail'])
    expect(diff([running], [ask])).toEqual(['alert'])
    expect(diff([running], [turn(90)])).toEqual(['fanfare'])
    expect(diff([running], [turn(90, true)])).toEqual(['fail'])
  })

  it('puts what needs you first when several things happen at once', () => {
    expect(diff([running, spawn(10, 'a')], [spawn(20, 'b'), finish(21, 'a', 'completed'), ask])).toEqual(['alert', 'join', 'done'])
  })
})
