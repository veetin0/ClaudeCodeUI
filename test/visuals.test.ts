import { fileUrl, isAbsolutePath } from '@shared/visuals'
import { describe, expect, it } from 'vitest'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent } from '@shared/events'
import { toVisual, type VisualSource, type VisualUpdate } from '@shared/visuals'
import { fillTemplate, QUICK_ACTIONS } from '../src/renderer/src/lib/actions'
import { EventNormalizer } from '../src/main/events/normalizer'
import { parsePayloads } from '../src/main/system/telemetry'
import { reduceAll } from './replay'

const base = { sessionId: 's1', ts: 1 } as const

describe('toVisual', () => {
  it('validates untrusted input', () => {
    expect(toVisual('progress', { label: 'epoch', current: 3, total: 10, metrics: { loss: 0.4, bad: 'x' } }, 'i', '/p')).toEqual({
      kind: 'progress', label: 'epoch', current: 3, total: 10, unit: undefined, metrics: { loss: 0.4 },
    })
    expect(toVisual('progress', { current: 3, total: 0 }, 'i', '/p')).toBeNull()
    expect(toVisual('metric', { name: 'loss', value: 'NaN' }, 'i', '/p')).toBeNull()
    expect(toVisual('nope', {}, 'i', '/p')).toBeNull()
  })

  it('resolves relative image paths against the project', () => {
    expect(toVisual('show', { image_path: './plots/loss.png' }, 'i', '/proj')).toMatchObject({ content: { type: 'image', path: '/proj/plots/loss.png' } })
  })
})

describe('normalizer → visual events', () => {
  it('turns harness tool calls into visuals attributed to the calling agent', () => {
    const n = new EventNormalizer('s1', () => 1, '/p')
    const events = n.normalize({
      type: 'assistant',
      uuid: 'u',
      parent_tool_use_id: 'toolu_sub',
      message: { id: 'm', content: [{ type: 'tool_use', id: 't1', name: 'mcp__harness__progress', input: { label: 'epoch', current: 2, total: 5 } }] },
    } as unknown as SDKMessage)
    expect(events[1]).toMatchObject({ type: 'visual', agentId: 'toolu_sub', source: 'tool', update: { kind: 'progress', current: 2 } })
  })

  it('parses progress and metrics from Bash output', () => {
    const n = new EventNormalizer('s1', () => 1, '/p')
    n.normalize({ type: 'assistant', uuid: 'u', parent_tool_use_id: null, message: { id: 'm', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'python train.py' } }] } } as unknown as SDKMessage)
    const events = n.normalize({
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'Epoch 1/3 loss=0.9\nEpoch 2/3 loss=0.5\nEpoch 3/3 loss=0.2' }] },
    } as unknown as SDKMessage)
    const visuals = events.filter((e) => e.type === 'visual')
    expect(visuals.map((e) => e.type === 'visual' && e.update.kind)).toEqual(['progress', 'metric', 'metric', 'metric'])
  })
})

describe('reducer visuals', () => {
  it('tracks progress, metric series and shows per agent', () => {
    const v = (update: VisualUpdate, source: VisualSource = 'tool', agentId: string | null = null): HarnessEvent => ({
      ...base,
      type: 'visual',
      agentId,
      source,
      update,
    })
    const s = reduceAll([
      v({ kind: 'progress', label: 'epoch', current: 1, total: 3, metrics: { loss: 0.9 } }, 'telemetry', 'sub1'),
      v({ kind: 'progress', label: 'epoch', current: 2, total: 3, metrics: { loss: 0.5 } }, 'telemetry', 'sub1'),
      // Parsed duplicates are ignored once structured data exists.
      v({ kind: 'metric', name: 'loss', value: 0.9 }, 'parsed', 'sub1'),
      v({ kind: 'show', id: 'x', content: { type: 'markdown', text: 'hi' } }),
      v({ kind: 'show', id: 'x', content: { type: 'markdown', text: 'hi' } }),
      v({ kind: 'status', text: 'Tuning' }),
    ])
    expect(s.visuals.sub1.progress.epoch).toMatchObject({ current: 2, total: 3 })
    expect(s.visuals.sub1.metrics.loss.points).toEqual([{ step: 1, value: 0.9 }, { step: 2, value: 0.5 }])
    expect(s.visuals.main.shows).toHaveLength(1)
    expect(s.visuals.main.status).toBe('Tuning')
  })

  it('keeps quiet harness tools out of the transcript', () => {
    const s = reduceAll([{ ...base, type: 'tool.start', toolUseId: 't', agentId: null, name: 'mcp__harness__progress', input: {} }])
    expect(s.items).toEqual([])
    expect(s.tools.t).toBeDefined()
  })
})

describe('telemetry payloads', () => {
  it('accepts objects, arrays and NDJSON', () => {
    expect(parsePayloads('{"kind":"metric"}')).toHaveLength(1)
    expect(parsePayloads('[{"a":1},{"b":2}]')).toHaveLength(2)
    expect(parsePayloads('{"a":1}\n{"b":2}\n')).toHaveLength(2)
    expect(parsePayloads('')).toEqual([])
  })
})

describe('quick actions', () => {
  it('fill every placeholder from the examples', () => {
    for (const a of QUICK_ACTIONS) {
      const filled = fillTemplate(a.template, Object.fromEntries(a.params.map((p) => [p.key, p.example])))
      expect(filled).not.toMatch(/\{\w+\}/)
    }
    expect(fillTemplate('/compact {args}', { args: '' })).toBe('/compact')
  })
})

describe('cross-platform media paths', () => {
  it('builds valid URLs for macOS and Windows paths', () => {
    expect(fileUrl('/Users/a/out/v.mp4')).toBe('harness-file://local/Users/a/out/v.mp4')
    expect(fileUrl('C:\\Users\\a b\\out\\v.mp4')).toBe('harness-file://local/C:/Users/a%20b/out/v.mp4')
    expect(new URL(fileUrl('C:\\x\\v.mp4')).pathname).toBe('/C:/x/v.mp4')
  })
  it('recognises absolute paths on both', () => {
    expect(['/a', 'C:\\a', 'c:/a', '\\\\server\\share'].every(isAbsolutePath)).toBe(true)
    expect(['a/b', './a', 'out\\v.mp4'].some(isAbsolutePath)).toBe(false)
  })
})
