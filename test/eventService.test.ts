import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { pickConfig } from '@shared/hackforge'
import { EventService, mergeHackforgeYaml } from '../src/main/event/EventService'

const dirs: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'ev-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('EventService', () => {
  it('shows the preset before a project is linked', async () => {
    const svc = new EventService(() => undefined, () => {})
    const s = await svc.state()
    expect(s).toMatchObject({ source: 'preset', projectReady: false })
    expect(s.config.name).toBe('Junction 2026')
    await expect(svc.updateProgress({ done: { install: true } })).rejects.toThrow(/Link an event project/)
  })

  it('sets up a project, keeps existing files, and records progress', async () => {
    const d = tmp()
    mkdirSync(join(d, 'challenge', 'prompts'), { recursive: true })
    writeFileSync(join(d, 'challenge', 'prompts', '10-junction-strategy.md'), 'OUR OWN')
    writeFileSync(join(d, 'challenge', 'hackforge.yaml'), 'profile: deep   # we chose this\nstack_preferences: [python]\nloop:\n  target_score: 8.5\n')
    const pushed: number[] = []
    const svc = new EventService(() => d, (s) => pushed.push(Object.keys(s.progress.done).length))
    const s = await svc.setup(d)
    expect(s).toMatchObject({ source: 'project', projectReady: true, projectDir: d })
    for (const sub of ['brief', 'data', 'assets', 'examples']) expect(existsSync(join(d, 'challenge', sub))).toBe(true)
    expect(readFileSync(join(d, 'challenge', 'prompts', '10-junction-strategy.md'), 'utf8')).toBe('OUR OWN')
    expect(readFileSync(join(d, 'challenge', 'brief', 'junction-2026-event.md'), 'utf8')).toMatch(/Final submissions/)

    const yaml = readFileSync(join(d, 'challenge', 'hackforge.yaml'), 'utf8')
    expect(yaml).toMatch(/# we chose this/)
    const cfg = pickConfig(YAML.parse(yaml))
    expect(cfg).toMatchObject({ challenge: 'Junction 2026', deadline: '2026-11-15T10:00+02:00', team: 4, profile: 'standard', targetScore: 9, reserveMinutes: 240, checkpoints: ['decision', 'before_submit'] })
    expect(YAML.parse(yaml).stack_preferences).toEqual(['python'])
    expect(YAML.parse(yaml).models).toMatchObject({ build: 'sonnet', judge: 'opus' })

    await svc.updateProgress({ done: { install: true } })
    const after = await svc.updateProgress({ partner: { name: 'OpenAI', keys: true } })
    expect(after.progress).toEqual({ done: { install: true }, partners: { OpenAI: { keys: true, kit: false } } })
    // A teammate's change arriving through git is picked up by the watcher.
    writeFileSync(join(d, 'challenge', 'event-checklist.json'), JSON.stringify({ done: { install: true, roles: true }, partners: {} }))
    await expect.poll(() => pushed.at(-1), { timeout: 3000 }).toBe(2)
    svc.dispose()
  })

  it('writes a fresh hackforge.yaml when there is none', () => {
    const y = mergeHackforgeYaml(undefined, { team: 4, models: { build: 'sonnet' }, checkpoints: ['decision'] })
    expect(YAML.parse(y)).toEqual({ team: 4, models: { build: 'sonnet' }, checkpoints: ['decision'] })
  })
})
