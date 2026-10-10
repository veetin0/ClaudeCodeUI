import { cpSync, existsSync, type FSWatcher, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HackforgeService, readHackforge } from '../src/main/hackforge/HackforgeService'

const FIX = join(import.meta.dirname, 'fixtures', 'hackforge-project')
const dirs: string[] = []
const project = () => {
  const d = mkdtempSync(join(tmpdir(), 'hf-'))
  dirs.push(d)
  cpSync(FIX, d, { recursive: true })
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('HackforgeService', () => {
  it('reads a whole project', async () => {
    const d = project()
    const settings = join(d, 'user-settings.json')
    writeFileSync(settings, JSON.stringify({ enabledPlugins: { 'hackforge@veeti-tools': true } }))
    const s = await readHackforge(d, settings)
    expect(s).toMatchObject({ present: true, initialized: true, pluginInstalled: true, stopRequested: false })
    expect(s.config.team).toBe(3)
    expect(s.state.phase).toBe('loop')
    expect(s.rules).toHaveLength(8)
    expect(s.milestones).toHaveLength(4)
    expect(s.verify?.mockScore).toBe(8.1)
    expect(s.loop?.entries).toHaveLength(4)
    expect(s.decision?.title).toBe('Traffic-aware router')
    expect(s.files).toContain('VERIFY.md')
  })

  it('reports an empty folder as not a HackForge project', async () => {
    const d = mkdtempSync(join(tmpdir(), 'hf-'))
    dirs.push(d)
    const s = await readHackforge(d, join(d, 'none.json'))
    expect(s).toMatchObject({ present: false, initialized: false, pluginInstalled: false, rules: [], milestones: [] })
  })

  it('sets the profile in a project that has .hackforge/ but no challenge/ yet', async () => {
    const d = mkdtempSync(join(tmpdir(), 'hf-'))
    dirs.push(d)
    mkdirSync(join(d, '.hackforge'))
    const svc = new HackforgeService(join(d, 'none.json'), () => {})
    await svc.setProfile(d, 'deep')
    expect(readFileSync(join(d, 'challenge', 'hackforge.yaml'), 'utf8')).toBe('profile: deep\n')
    expect((await svc.snapshot(d)).config.profile).toBe('deep')
    svc.dispose()
  })

  it('keeps the dashboard live after the watcher fails', async () => {
    const d = project()
    const pushed: (string | undefined)[] = []
    const svc = new HackforgeService(join(d, 'none.json'), (s) => pushed.push(s.state.next))
    await svc.watch(d)
    // Let the events from copying the fixture settle, so they can't stand in for the watcher.
    await new Promise((r) => setTimeout(r, 800))
    const entry = (svc as unknown as { watched: Map<string, { watcher: FSWatcher | null }> }).watched.get(d)!
    const first = entry.watcher!
    first.emit('error', new Error('EPERM'))
    // A fresh watcher takes over (and re-reads) a moment later.
    await expect.poll(() => entry.watcher && entry.watcher !== first, { timeout: 4000 }).toBe(true)
    await new Promise((r) => setTimeout(r, 500))
    writeFileSync(join(d, '.hackforge', 'STATE.md'), readFileSync(join(d, '.hackforge', 'STATE.md'), 'utf8').replace(/^- Next:.*$/m, '- Next: ship it'))
    await expect.poll(() => pushed.at(-1), { timeout: 4000 }).toBe('ship it')
    svc.dispose()
  })

  it('stops the loop, sets the profile, and pushes live updates', async () => {
    const d = project()
    const pushed: number[] = []
    const svc = new HackforgeService(join(d, 'none.json'), (s) => pushed.push(s.loop?.iteration ?? -1))
    expect(svc.isProject(d)).toBe(true)
    await svc.watch(d)
    await svc.stopLoop(d)
    expect(existsSync(join(d, '.hackforge', 'STOP_LOOP'))).toBe(true)
    await svc.setProfile(d, 'max')
    expect(readFileSync(join(d, 'challenge', 'hackforge.yaml'), 'utf8')).toMatch(/^profile: max {3}# chosen by the team$/m)
    const loop = JSON.parse(readFileSync(join(d, '.hackforge', 'LOOP.json'), 'utf8'))
    writeFileSync(join(d, '.hackforge', 'LOOP.json'), JSON.stringify({ ...loop, iteration: 5 }))
    await expect.poll(() => pushed.at(-1), { timeout: 3000 }).toBe(5)
    expect((await svc.snapshot(d)).stopRequested).toBe(true)
    svc.dispose()
  })
})
