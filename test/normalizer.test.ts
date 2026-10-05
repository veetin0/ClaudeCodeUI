import { describe, expect, it } from 'vitest'
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { EventNormalizer } from '../src/main/events/normalizer'
import { loadFixture, normalizeAll } from './replay'

const types = (events: { type: string }[]) => events.map((e) => e.type)

describe('EventNormalizer on a recorded session (tasks + foreground subagent)', () => {
  const events = normalizeAll(loadFixture('tasks-and-subagent.json'))

  it('emits session.init first with model and cwd', () => {
    const init = events.find((e) => e.type === 'session.init')
    expect(init).toMatchObject({ type: 'session.init', model: expect.stringContaining('haiku') })
    expect(events.findIndex((e) => e.type === 'session.init')).toBeLessThan(events.findIndex((e) => e.type === 'tool.start'))
  })

  it('pairs every tool.start with a tool.end', () => {
    const starts = events.filter((e) => e.type === 'tool.start').map((e) => e.toolUseId)
    const ends = new Set(events.filter((e) => e.type === 'tool.end').map((e) => e.toolUseId))
    expect(starts.length).toBeGreaterThan(5)
    for (const id of starts) expect(ends.has(id)).toBe(true)
  })

  it('attributes subagent tool calls to the spawning Agent call', () => {
    const agentCall = events.find((e) => e.type === 'tool.start' && e.name === 'Agent')
    expect(agentCall).toBeDefined()
    const id = agentCall!.type === 'tool.start' ? agentCall!.toolUseId : ''
    const subTools = events.filter((e) => e.type === 'tool.start' && e.agentId === id)
    expect(subTools.map((e) => (e.type === 'tool.start' ? e.name : ''))).toContain('Bash')
    expect(events.find((e) => e.type === 'subagent.start')).toMatchObject({ toolUseId: id, background: false })
    expect(events.find((e) => e.type === 'subagent.progress')).toMatchObject({ toolUseId: id })
    expect(events.find((e) => e.type === 'subagent.end')).toMatchObject({ toolUseId: id, status: 'completed' })
  })

  it('builds the task list from TaskCreate/TaskUpdate results, ignoring failed calls', () => {
    const updates = events.filter((e) => e.type === 'todo.update')
    const last = updates.at(-1)
    expect(last?.type === 'todo.update' && last.todos).toEqual([
      { id: '1', content: 'Read notes.txt', status: 'completed', activeForm: undefined },
      { id: '2', content: 'Spawn subagent to run ls and report back', status: 'completed', activeForm: undefined },
    ])
  })

  it('reports usage only for the main agent, once per API message', () => {
    const usage = events.filter((e) => e.type === 'usage')
    expect(usage.length).toBeGreaterThan(0)
    expect(usage.every((e) => e.type === 'usage' && e.contextTokens > 0)).toBe(true)
  })

  it('streams text deltas and ends with turn.end', () => {
    expect(types(events)).toContain('text.delta')
    expect(events.at(-1)).toMatchObject({ type: 'turn.end', isError: false })
  })
})

describe('EventNormalizer on a background subagent launch', () => {
  const events = normalizeAll(loadFixture('background-subagent.json'))

  it('marks the async launch result as background, not completion', () => {
    const agent = events.find((e) => e.type === 'tool.start' && e.name === 'Agent')!
    const id = agent.type === 'tool.start' ? agent.toolUseId : ''
    expect(events.find((e) => e.type === 'tool.end' && e.toolUseId === id)).toMatchObject({ background: true })
    expect(events.find((e) => e.type === 'subagent.start')).toMatchObject({ background: true })
  })
})

describe('EventNormalizer unit cases', () => {
  const n = () => new EventNormalizer('s', () => 1)

  it('handles TodoWrite lists', () => {
    const msg = {
      type: 'assistant',
      uuid: 'u1',
      parent_tool_use_id: null,
      message: {
        id: 'm1',
        content: [{ type: 'tool_use', id: 't1', name: 'TodoWrite', input: { todos: [{ content: 'a', status: 'pending' }] } }],
      },
    } as unknown as SDKMessage
    expect(n().normalize(msg).map((e) => e.type)).toEqual(['tool.start', 'todo.update'])
  })

  it('truncates very long tool output', () => {
    const msg = {
      type: 'user',
      parent_tool_use_id: null,
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'x'.repeat(50_000) }] },
    } as unknown as SDKMessage
    const [e] = n().normalize(msg)
    expect(e.type === 'tool.end' && e.output.length).toBeLessThan(21_000)
  })

  it('ignores plain-text user echoes', () => {
    const msg = { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: 'hi' } } as unknown as SDKMessage
    expect(n().normalize(msg)).toEqual([])
  })
})
