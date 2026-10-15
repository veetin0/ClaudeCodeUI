import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { DEFAULT_USAGE_SAVER, LEAN_OUTPUT_PROMPT, type SaverNote, type UsageSaverSettings } from '@shared/usageSaver'
import { AgentService, type QueryFactory } from '../src/main/agent/AgentService'
import type { EventBus } from '../src/main/events/bus'

type Msg = Record<string, unknown>
type Script = (text: string, model: string | undefined) => Msg[]

let uid = 0
const assistant = (text: string, contextTokens = 1000): Msg => ({
  type: 'assistant',
  uuid: `a${++uid}`,
  parent_tool_use_id: null,
  message: { id: `m${uid}`, content: [{ type: 'text', text }], usage: { input_tokens: contextTokens, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
})
const toolUse = (id: string, name = 'Bash'): Msg => ({ type: 'assistant', uuid: `a${++uid}`, parent_tool_use_id: null, message: { id: `m${uid}`, content: [{ type: 'tool_use', id, name, input: { command: 'npm test' } }] } })
const toolResult = (id: string, isError: boolean): Msg => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? 'Exit code 1' : 'ok' }] } })
const result = (): Msg => ({ type: 'result', subtype: 'success', is_error: false, result: 'done', total_cost_usd: 0, duration_ms: 5, num_turns: 1, usage: { output_tokens: 1 }, modelUsage: { m: { contextWindow: 200_000 } } })
const compacted = (pre: number, post: number): Msg[] => [
  { type: 'system', subtype: 'status', status: 'compacting' },
  { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual', pre_tokens: pre, post_tokens: post } },
  result(),
]

/** A fake Claude Code: records what it receives (messages and model switches) and answers from a script. */
function engine(script: Script) {
  const log: string[] = []
  let options: Record<string, unknown> = {}
  const factory = (({ prompt, options: o }: { prompt: AsyncIterable<{ message: { content: string } }>; options: Record<string, unknown> }) => {
    options = o
    let model = o.model as string | undefined
    async function* run() {
      for await (const m of prompt) {
        const text = m.message.content
        log.push(text.startsWith('/compact') ? 'compact' : `msg:${text}`)
        for (const out of script(text, model)) {
          yield out
          await new Promise((r) => setTimeout(r, 1))
        }
      }
    }
    return Object.assign(run(), {
      interrupt: async () => {},
      setPermissionMode: async () => {},
      setModel: async (next: string) => {
        log.push(`model:${next}`)
        model = next
      },
    })
  }) as unknown as QueryFactory
  return { factory, log, options: () => options }
}

function setup(factory: QueryFactory, saver: Partial<UsageSaverSettings> = {}, extra: { hackforgeLean?: (cwd: string) => boolean } = {}) {
  const events: HarnessEvent[] = []
  const bus = { emit: (e: HarnessEvent | HarnessEvent[]) => events.push(...(Array.isArray(e) ? e : [e])) } as unknown as EventBus
  const cfg = { ...DEFAULT_USAGE_SAVER, ...saver }
  const svc = new AgentService({ bus, getEnv: () => ({}), queryFactory: factory, usageSaver: () => cfg, ...extra })
  const notes = () => events.flatMap((e) => (e.type === 'saver' ? [e.note] : []))
  const routes = () => notes().filter((n): n is Extract<SaverNote, { kind: 'route' }> => n.kind === 'route')
  return { svc, events, notes, routes }
}

const settle = async (ms = 60) => {
  for (let i = 0; i < ms / 10; i++) await new Promise((r) => setTimeout(r, 10))
}

describe('Usage saver in a session', () => {
  it('starts Auto sessions on Sonnet and moves to Opus before a planning message reaches Claude', async () => {
    const e = engine(() => [assistant('ok'), result()])
    const { svc, routes } = setup(e.factory)
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    expect(e.options().model).toBe('sonnet')
    svc.send(id, 'Plan the architecture for offline sync')
    await settle()
    svc.send(id, 'yes, go ahead')
    await settle()
    expect(e.log).toEqual(['model:opus', 'msg:Plan the architecture for offline sync', 'model:sonnet', 'msg:yes, go ahead'])
    expect(routes().map((r) => [r.model, r.turn, r.switched])).toEqual([
      ['opus', 'think', true],
      ['sonnet', 'build', true],
    ])
    svc.close(id)
  })

  it('appends the lean-output rules only when they are on', () => {
    const e = engine(() => [])
    const on = setup(e.factory)
    const a = on.svc.start({ cwd: '/tmp', model: 'auto' })
    expect((e.options().systemPrompt as { append: string }).append).toContain(LEAN_OUTPUT_PROMPT)
    on.svc.close(a.id)
    const off = setup(e.factory, { leanOutput: false })
    const b = off.svc.start({ cwd: '/tmp', model: 'auto' })
    expect((e.options().systemPrompt as { append: string }).append).not.toContain('Usage saver')
    off.svc.close(b.id)
  })

  it('compacts a long conversation before the next message, then switches cheaply', async () => {
    const e = engine((text) => (text.startsWith('/compact') ? compacted(150_000, 12_000) : [assistant('done', 150_000), result()]))
    const { svc, events, notes, routes } = setup(e.factory)
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    svc.send(id, 'Review the auth module')
    await settle()
    svc.send(id, 'yes, fix those')
    await settle(120)
    // Compacted first; Opus → Sonnet only once the conversation was small.
    expect(e.log).toEqual(['model:opus', 'msg:Review the auth module', 'compact', 'model:sonnet', 'msg:yes, fix those'])
    expect(notes().find((n) => n.kind === 'compact')).toMatchObject({ preTokens: 150_000, postTokens: 12_000 })
    expect(routes().at(-1)).toMatchObject({ model: 'sonnet', switched: true })
    const ends = events.filter((x) => x.type === 'turn.end')
    expect(ends.map((x) => x.type === 'turn.end' && !!x.internal)).toEqual([false, true, false])
    // Compacting, then straight back to working on your message: never "idle" in between.
    const statuses = events.filter((x) => x.type === 'status').map((x) => (x.type === 'status' ? x.status : ''))
    expect(statuses).toEqual(['idle', 'running', 'idle', 'running', 'compacting', 'running', 'idle'])
    svc.close(id)
  })

  it('does not compact while you are debugging', async () => {
    const e = engine((text) => (text.startsWith('/compact') ? compacted(150_000, 12_000) : [assistant('done', 150_000), result()]))
    const { svc } = setup(e.factory)
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    svc.send(id, 'Add a logout button')
    await settle()
    svc.send(id, 'It still doesn’t work, the button does nothing')
    await settle()
    expect(e.log).not.toContain('compact')
    expect(e.log.slice(-2)).toEqual(['model:opus', 'msg:It still doesn’t work, the button does nothing'])
    svc.close(id)
  })

  it('stays on Opus (and says why) when switching down would re-read a long conversation', async () => {
    const e = engine(() => [assistant('done', 130_000), result()])
    const { svc, routes } = setup(e.factory, { compact: false })
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    svc.send(id, 'Design the data model')
    await settle()
    svc.send(id, 'yes')
    await settle()
    expect(e.log.filter((l) => l.startsWith('model:'))).toEqual(['model:opus'])
    expect(routes().at(-1)).toMatchObject({ model: 'opus', held: true, turn: 'build' })
    svc.close(id)
  })

  it('brings in Opus mid-task after 3 failed steps on Sonnet', async () => {
    const e = engine(() => [
      toolUse('t1'),
      toolResult('t1', true),
      toolUse('t2'),
      toolResult('t2', true),
      toolUse('t3'),
      toolResult('t3', true),
      assistant('fixed'),
      result(),
    ])
    const { svc, routes } = setup(e.factory)
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    svc.send(id, 'run the tests')
    await settle()
    expect(e.log).toEqual(['msg:run the tests', 'model:opus'])
    expect(routes().at(-1)).toMatchObject({ model: 'opus', midTurn: true, switched: true })
    svc.close(id)
  })

  it('leaves the model alone when you picked one, until you pick Auto again', async () => {
    const e = engine(() => [assistant('ok'), result()])
    const { svc, notes } = setup(e.factory)
    const { id } = svc.start({ cwd: '/tmp', model: 'opus' })
    expect(e.options().model).toBe('opus')
    svc.send(id, 'yes')
    await settle()
    expect(e.log).toEqual(['msg:yes'])
    await svc.setModel(id, 'auto')
    svc.send(id, 'run the linter')
    await settle()
    expect(e.log.slice(1)).toEqual(['model:sonnet', 'msg:run the linter'])
    expect(notes().filter((n) => n.kind === 'config').map((n) => n.kind === 'config' && n.auto)).toEqual([false, true])
    svc.close(id)
  })

  it('does nothing when the saver is off', async () => {
    const e = engine(() => [assistant('ok', 150_000), result()])
    const { svc, routes } = setup(e.factory, { enabled: false })
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    expect(e.options().model).toBeUndefined()
    expect(e.options().hooks).toBeUndefined()
    svc.send(id, 'Plan it')
    await settle()
    svc.send(id, 'yes')
    await settle()
    expect(e.log).toEqual(['msg:Plan it', 'msg:yes'])
    expect(routes()).toEqual([])
    svc.close(id)
  })

  it('lets HackForge pick its own models on the Pro profile', async () => {
    const e = engine(() => [assistant('ok'), result()])
    const { svc } = setup(e.factory, {}, { hackforgeLean: () => true })
    const { id } = svc.start({ cwd: '/tmp', model: 'auto' })
    svc.send(id, '/hackforge:run --auto')
    await settle()
    expect(e.log).toEqual(['msg:/hackforge:run --auto'])
    svc.close(id)
  })
})

describe('Usage saver: skipping generated files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'saver-'))
  // A project inside a folder named "build": only folders inside the project count.
  const proj = join(dir, 'build', 'app')
  mkdirSync(join(proj, 'dist'), { recursive: true })
  mkdirSync(join(proj, 'src'), { recursive: true })
  writeFileSync(join(proj, 'package-lock.json'), 'x'.repeat(200_000))
  writeFileSync(join(proj, 'dist', 'bundle.js'), 'x'.repeat(100_000))
  writeFileSync(join(proj, 'src', 'big.ts'), 'x'.repeat(200_000))
  writeFileSync(join(proj, 'yarn.lock'), 'x'.repeat(1000))

  function guard(cfg: Partial<UsageSaverSettings> = {}) {
    const e = engine(() => [])
    const { svc, notes } = setup(e.factory, cfg)
    const { id } = svc.start({ cwd: proj, model: 'auto' })
    const hooks = e.options().hooks as { PreToolUse?: { matcher: string; hooks: ((i: unknown, id?: string) => Promise<Record<string, unknown>>)[] }[] } | undefined
    const read = hooks?.PreToolUse?.find((m) => m.matcher === 'Read')
    const run = (input: Record<string, unknown>) => read!.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: input }, 'tu1')
    return { svc, id, read, run, notes }
  }

  it('refuses whole-file reads of big lockfiles and build output, with a way to get what it needs', async () => {
    const g = guard()
    const out = (await g.run({ file_path: join(proj, 'package-lock.json') })) as { hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string } }
    expect(out.hookSpecificOutput).toMatchObject({ permissionDecision: 'deny' })
    expect(out.hookSpecificOutput?.permissionDecisionReason).toMatch(/lockfile.*Grep.*offset and limit/)
    expect(await g.run({ file_path: 'dist/bundle.js' })).toHaveProperty('hookSpecificOutput')
    expect(g.notes().filter((n) => n.kind === 'skip')).toHaveLength(2)
    g.svc.close(g.id)
  })

  it('allows ranges, small generated files and source files', async () => {
    const g = guard()
    expect(await g.run({ file_path: join(proj, 'package-lock.json'), offset: 1, limit: 50 })).toEqual({})
    expect(await g.run({ file_path: join(proj, 'yarn.lock') })).toEqual({})
    expect(await g.run({ file_path: join(proj, 'src', 'big.ts') })).toEqual({})
    expect(await g.run({ file_path: join(proj, 'missing.lock') })).toEqual({})
    g.svc.close(g.id)
  })

  it('is not installed when switched off', () => {
    const g = guard({ skipGenerated: false })
    expect(g.read).toBeUndefined()
    g.svc.close(g.id)
  })
})

describe('Usage saver: what counts as struggling', () => {
  it('ignores steps you (or the saver) refused', async () => {
    const { UsageSaver } = await import('../src/main/agent/UsageSaver')
    const models: string[] = []
    const saver = new UsageSaver(DEFAULT_USAGE_SAVER, 'auto', 'default', { cwd: '/tmp', note: () => {}, setModel: async (m) => void models.push(m), compact: async () => {} }, () => true)
    const base = { sessionId: 's', ts: 1 }
    for (const n of [1, 2, 3]) {
      const toolUseId = `t${n}`
      saver.observe({ ...base, type: 'tool.start', toolUseId, agentId: null, name: 'Write', input: {} })
      saver.observe({ ...base, type: 'permission.request', requestId: `r${n}`, toolUseId, agentId: null, toolName: 'Write', input: {}, canAlwaysAllow: false })
      saver.observe({ ...base, type: 'permission.resolved', requestId: `r${n}`, behavior: 'deny' })
      saver.observe({ ...base, type: 'tool.end', toolUseId, isError: true, output: 'denied' })
    }
    await settle(20)
    expect(models).toEqual([])
    // Subagents' failures don't count either: they have their own model.
    for (const n of [4, 5, 6]) {
      saver.observe({ ...base, type: 'tool.start', toolUseId: `t${n}`, agentId: 'sub1', name: 'Bash', input: {} })
      saver.observe({ ...base, type: 'tool.end', toolUseId: `t${n}`, isError: true, output: 'Exit code 1' })
    }
    await settle(20)
    expect(models).toEqual([])
  })
})
