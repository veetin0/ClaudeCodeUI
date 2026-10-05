import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HarnessEvent } from '@shared/events'
import { ChangeTracker } from '../src/main/project/ChangeTracker'
import { SessionStore } from '../src/main/store/SessionStore'

let dir: string
let store: SessionStore
let events: HarnessEvent[]
const tracker = () => new ChangeTracker('s', dir, store, (e) => events.push(e))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-changes-'))
  store = new SessionStore(join(dir, '.harness.db'))
  store.open({ id: 's', cwd: dir, title: '', createdAt: 0, updatedAt: 0, costUsd: 0 })
  events = []
})
afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('ChangeTracker', () => {
  it('diffs an edited file against its pre-edit snapshot and reverts it', async () => {
    const f = join(dir, 'app.ts')
    writeFileSync(f, 'a\nb\nc\n')
    const t = tracker()
    await t.beforeEdit(f)
    writeFileSync(f, 'a\nB\nc\nd\n')
    await t.beforeEdit(f) // second edit keeps the first snapshot
    expect(await t.summarize()).toEqual([{ path: f, status: 'modified', additions: 2, deletions: 1 }])
    expect((await t.diff(f)).original).toBe('a\nb\nc\n')

    await t.revert(f)
    expect(readFileSync(f, 'utf8')).toBe('a\nb\nc\n')
    expect(await t.summarize()).toEqual([])
  })

  it('treats new files as added and reverting deletes them', async () => {
    const f = join(dir, 'new.md')
    const t = tracker()
    await t.beforeEdit(f)
    writeFileSync(f, 'hello\n')
    expect(await t.summarize()).toMatchObject([{ status: 'added', additions: 1 }])
    await t.revert(f)
    expect(existsSync(f)).toBe(false)
  })

  it('uses git HEAD as the baseline for files changed by commands', async () => {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
    git('init', '-q')
    git('config', 'user.email', 't@t')
    git('config', 'user.name', 't')
    const f = join(dir, 'data.py')
    writeFileSync(f, 'x = 1\n')
    git('add', 'data.py')
    git('commit', '-qm', 'init')
    const t = tracker()
    writeFileSync(f, 'x = 2\n')
    await t.onDiskChange(f, 'modified')
    expect(await t.summarize()).toMatchObject([{ path: f, status: 'modified', additions: 1, deletions: 1 }])
  })

  it('survives a restart: snapshots persist in the store', async () => {
    const f = join(dir, 'keep.txt')
    writeFileSync(f, 'v1')
    await tracker().beforeEdit(f)
    writeFileSync(f, 'v2')
    const again = tracker()
    expect((await again.diff(f)).original).toBe('v1')
  })

  it('accept drops the file from the changes list and publishes an update', async () => {
    const f = join(dir, 'ok.txt')
    writeFileSync(f, '1')
    const t = tracker()
    await t.beforeEdit(f)
    writeFileSync(f, '2')
    t.accept(f)
    expect(await t.summarize()).toEqual([])
    await new Promise((r) => setTimeout(r, 400))
    expect(events.at(-1)).toMatchObject({ type: 'changes.updated', files: [] })
    t.dispose()
  })
})
