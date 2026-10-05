import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { AgentService, type QueryFactory } from '../src/main/agent/AgentService'
import type { EventBus } from '../src/main/events/bus'
import { loadFixture } from './replay'

function setup(factory: QueryFactory) {
  const events: HarnessEvent[] = []
  const bus = { emit: (e: HarnessEvent | HarnessEvent[]) => events.push(...(Array.isArray(e) ? e : [e])) } as unknown as EventBus
  const svc = new AgentService({ bus, getEnv: () => ({}), queryFactory: factory })
  return { svc, events }
}

const tick = () => new Promise((r) => setTimeout(r, 10))

describe('AgentService', () => {
  it('runs a turn: user message → SDK messages → idle', async () => {
    const fixture = loadFixture('tasks-and-subagent.json')
    const factory = (({ prompt }: { prompt: AsyncIterable<unknown> }) => {
      async function* run() {
        for await (const _msg of prompt) for (const m of fixture) yield m
      }
      return Object.assign(run(), { interrupt: async () => {}, setPermissionMode: async () => {}, setModel: async () => {} })
    }) as unknown as QueryFactory

    const { svc, events } = setup(factory)
    const { id } = svc.start({ cwd: '/tmp' })
    svc.send(id, 'do the thing')
    await tick()

    const statuses = events.filter((e) => e.type === 'status').map((e) => (e.type === 'status' ? e.status : ''))
    expect(statuses).toEqual(['idle', 'running', 'idle'])
    expect(events.find((e) => e.type === 'user.message')).toMatchObject({ text: 'do the thing' })
    expect(events.some((e) => e.type === 'turn.end')).toBe(true)
    svc.close(id)
  })

  it('round-trips a permission request through the UI', async () => {
    let decision: unknown
    const factory = (({ prompt, options }: { prompt: AsyncIterable<unknown>; options: { canUseTool: Function } }) => {
      async function* run() {
        for await (const _msg of prompt) {
          decision = await options.canUseTool('Bash', { command: 'ls' }, {
            signal: new AbortController().signal,
            toolUseID: 't1',
            requestId: 'r1',
            suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'session' }],
          })
        }
      }
      return Object.assign(run(), { interrupt: async () => {} })
    }) as unknown as QueryFactory

    const { svc, events } = setup(factory)
    const { id } = svc.start({ cwd: '/tmp' })
    svc.send(id, 'list files')
    await tick()

    expect(events.find((e) => e.type === 'permission.request')).toMatchObject({ requestId: 'r1', toolName: 'Bash', canAlwaysAllow: true })
    expect(events.filter((e) => e.type === 'status').at(-1)).toMatchObject({ status: 'waiting' })

    svc.respondPermission(id, 'r1', { behavior: 'allow', always: true })
    await tick()
    expect(decision).toMatchObject({ behavior: 'allow', updatedInput: { command: 'ls' }, updatedPermissions: [{ type: 'addRules' }] })
    expect(events.find((e) => e.type === 'permission.resolved')).toMatchObject({ behavior: 'allow' })
    svc.close(id)
  })

  it('denies pending permissions when interrupted', async () => {
    let decision: unknown
    const factory = (({ prompt, options }: { prompt: AsyncIterable<unknown>; options: { canUseTool: Function } }) => {
      async function* run() {
        for await (const _msg of prompt) {
          decision = await options.canUseTool('Write', {}, { signal: new AbortController().signal, toolUseID: 't', requestId: 'r' })
        }
      }
      return Object.assign(run(), { interrupt: async () => {} })
    }) as unknown as QueryFactory

    const { svc } = setup(factory)
    const { id } = svc.start({ cwd: '/tmp' })
    svc.send(id, 'write')
    await tick()
    await svc.interrupt(id)
    await tick()
    expect(decision).toMatchObject({ behavior: 'deny' })
    svc.close(id)
  })
})

describe('AgentService resume', () => {
  it('passes the Claude session id, keeps the Harness id and announces the resume', async () => {
    let options: Record<string, unknown> = {}
    const factory = (({ options: o }: { options: Record<string, unknown> }) => {
      options = o
      async function* run() {}
      return Object.assign(run(), { interrupt: async () => {} })
    }) as unknown as QueryFactory
    const { svc, events } = setup(factory)
    const summary = { id: 'saved-1', cwd: '/proj', title: 'Old', createdAt: 1, updatedAt: 1, costUsd: 0.4 }
    const out = svc.start({ cwd: '/ignored' }, { summary, claudeSessionId: 'claude-abc', todos: [] })
    expect(out.id).toBe('saved-1')
    expect(options).toMatchObject({ resume: 'claude-abc', cwd: '/proj' })
    expect(events[0]).toMatchObject({ type: 'session.resumed', sessionId: 'saved-1', claudeSessionId: 'claude-abc' })
    svc.close('saved-1')
  })

  it('emits nothing from a session after it is closed', async () => {
    const factory = (() => {
      async function* run() {
        await new Promise((r) => setTimeout(r, 20))
      }
      return Object.assign(run(), { interrupt: async () => {} })
    }) as unknown as QueryFactory
    const { svc, events } = setup(factory)
    const { id } = svc.start({ cwd: '/p' })
    svc.close(id)
    const count = events.length
    expect(events.at(-1)).toMatchObject({ type: 'status', status: 'closed' })
    await new Promise((r) => setTimeout(r, 40))
    expect(events.length).toBe(count)
    expect(svc.isLive(id)).toBe(false)
  })
})
