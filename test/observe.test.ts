import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { produce } from 'immer'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import type { SessionSummary } from '@shared/ipc'
import { hasHarnessHooks, hookCommand, updateClaudeSettings, withHarnessHooks, withoutHarnessHooks } from '../src/main/observe/hooks'
import { classifyTranscript, ObservedSession, parseTaskNotification } from '../src/main/observe/TranscriptObserver'
import { applyEvent, createSession } from '../src/renderer/src/stores/reducer'

const FIXTURE = join(import.meta.dirname, 'fixtures', 'transcript')

describe('classifyTranscript', () => {
  it('recognises main and subagent transcripts only', () => {
    expect(classifyTranscript('proj/abc.jsonl')).toEqual({ kind: 'main', sessionId: 'abc' })
    expect(classifyTranscript('proj/abc/subagents/agent-x1.jsonl')).toEqual({ kind: 'sub', sessionId: 'abc', agentId: 'x1' })
    expect(classifyTranscript('proj/abc/subagents/agent-x1.meta.json')).toBeNull()
    expect(classifyTranscript('proj/notes.txt')).toBeNull()
  })
})

describe('parseTaskNotification', () => {
  it('reads tool use id, status and summary', () => {
    const t = '<task-notification>\n<task-id>a1</task-id>\n<tool-use-id>toolu_9</tool-use-id>\n<status>failed</status>\n<summary>It broke</summary>\n</task-notification>'
    expect(parseTaskNotification(t)).toEqual({ toolUseId: 'toolu_9', status: 'failed', summary: 'It broke' })
    expect(parseTaskNotification('hello')).toBeNull()
  })
})

describe('ObservedSession', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-observe-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  async function observe(entrypointOverride?: string) {
    cpSync(FIXTURE, dir, { recursive: true })
    if (entrypointOverride) {
      const f = join(dir, 'proj', 'sess-1.jsonl')
      writeFileSync(f, readFileSync(f, 'utf8').replaceAll('"entrypoint": "cli"', `"entrypoint": "${entrypointOverride}"`))
    }
    const events: HarnessEvent[] = []
    let opened: SessionSummary | null = null
    const s = new ObservedSession('sess-1', join(dir, 'proj'), {
      emit: (e) => events.push(...(Array.isArray(e) ? e : [e])),
      open: (summary) => (opened = summary),
      isOwned: () => false,
      projectsDir: dir,
    })
    await s.ingest(s.mainFile)
    const subDir = join(dir, 'proj', 'sess-1', 'subagents')
    for (const f of readdirSync(subDir).filter((f) => f.endsWith('.jsonl'))) await s.ingest(join(subDir, f), f.slice(6, -6))
    return { events, opened: opened as SessionSummary | null, session: s }
  }

  it('rebuilds a terminal session: prompts, tools, subagents, turns and cost', async () => {
    const { events, opened } = await observe()
    expect(opened).toMatchObject({ id: 'obs-sess-1', cwd: '/Users/me/demo4', observed: true, claudeSessionId: 'sess-1' })
    expect(events[0]).toMatchObject({ type: 'session.observed' })

    const state = produce(createSession(opened!, 'default', true), (d) => {
      for (const e of events) applyEvent(d, e)
    })
    expect(state.observed).toBe(true)
    // Two real prompts; the <task-notification> pseudo-prompts are not shown as user messages.
    expect(state.items.filter((i) => i.kind === 'user')).toHaveLength(2)
    expect(state.items.filter((i) => i.kind === 'turn').length).toBeGreaterThanOrEqual(2)
    expect(state.totalCostUsd).toBeGreaterThan(0)

    // Each subagent's own tool calls are attributed to its Agent call.
    const subs = Object.values(state.subagents)
    expect(subs).toHaveLength(3)
    expect(subs.every((sub) => sub.toolIds.length > 0)).toBe(true)
    // Two finished (task notifications); the third was cut off mid-run and is still open.
    expect(subs.filter((sub) => sub.status === 'completed')).toHaveLength(2)
    expect(Object.keys(state.files).some((f) => f.endsWith('src/utils.py'))).toBe(true)
  })

  it('reads only what was appended since last time', async () => {
    const { events, session } = await observe()
    const before = events.length
    await session.ingest(session.mainFile)
    expect(events.length).toBe(before)
  })

  it('ignores sessions run through the SDK (including Harness itself)', async () => {
    const { events, opened, session } = await observe('sdk-ts')
    expect(opened).toBeNull()
    expect(events).toEqual([])
    expect(session.ignored).toBe(true)
  })
})

describe('status hooks in ~/.claude/settings.json', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-hooks-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('adds ours next to existing hooks, idempotently, and removes only ours', () => {
    const userHook = { matcher: '', hooks: [{ type: 'command', command: 'say done' }] }
    const base = { model: 'opus', hooks: { Stop: [userHook] } }
    const once = withHarnessHooks(base)
    const twice = withHarnessHooks(once)
    expect(twice).toEqual(once)
    expect(once.hooks!.Stop).toHaveLength(2)
    expect(hasHarnessHooks(once)).toBe(true)
    expect(withoutHarnessHooks(once)).toEqual(base)
    expect(hookCommand()).toContain('|| true')
  })

  it('backs up the settings file before writing and refuses unparseable files', async () => {
    const path = join(dir, 'settings.json')
    writeFileSync(path, JSON.stringify({ theme: 'dark' }))
    await updateClaudeSettings(path, withHarnessHooks)
    expect(readdirSync(dir).some((f) => f.startsWith('settings.json.harness-backup-'))).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).theme).toBe('dark')

    writeFileSync(path, '{ not json')
    await expect(updateClaudeSettings(path, withHarnessHooks)).rejects.toThrow()
    expect(readFileSync(path, 'utf8')).toBe('{ not json')
  })

  it('creates the file when missing', async () => {
    const path = join(dir, 'nested', 'settings.json')
    await updateClaudeSettings(path, withHarnessHooks)
    expect(hasHarnessHooks(JSON.parse(readFileSync(path, 'utf8')))).toBe(true)
  })
})
