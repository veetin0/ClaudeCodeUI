import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { pickConfig } from '@shared/hackforge'
import { ensureLfAttributes, EventService, mergeHackforgeYaml } from '../src/main/event/EventService'

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
    expect(readFileSync(join(d, '.gitattributes'), 'utf8')).toMatch(/^\*\.sh text eol=lf$/m)

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

  it('adds, patches, chooses and deletes challenges', async () => {
    const d = tmp()
    const svc = new EventService(() => d, () => {})
    await svc.setup(d)
    let s = await svc.addChallenge({ partner: 'OpenAI', title: 'Agents for good', description: 'Build agents.' })
    s = await svc.addChallenge({ partner: 'OpenAI', title: 'Agents for good', description: 'Duplicate title.' })
    s = await svc.addChallenge({ partner: 'Aalto University', title: 'Smart grids', description: 'Balance it.' })
    expect(s.challenges.map((c) => c.id)).toEqual(['aalto-university-smart-grids', 'openai-agents-for-good', 'openai-agents-for-good-2'])

    // Claude adds an analysis directly in the file; a later UI patch must keep it.
    const file = join(d, 'challenges', 'openai-agents-for-good.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('status: candidate', 'status: candidate\nai:\n  idea: "Voice permits"\n  scores: { wow: 5 }'))
    s = await svc.updateChallenge('openai-agents-for-good', { scores: { fit: 4 }, notes: '- mentor likes voice' })
    const c = s.challenges.find((x) => x.id === 'openai-agents-for-good')!
    expect(c).toMatchObject({ scores: { fit: 4 }, notes: '- mentor likes voice', ai: { idea: 'Voice permits', scores: { wow: 5 } } })
    s = await svc.updateChallenge('openai-agents-for-good', { scores: { fit: null } })
    expect(s.challenges.find((x) => x.id === 'openai-agents-for-good')!.scores).toEqual({})

    await svc.chooseChallenge('aalto-university-smart-grids')
    s = await svc.chooseChallenge('openai-agents-for-good')
    expect(s.challenges.map((x) => [x.id, x.status])).toEqual([
      ['aalto-university-smart-grids', 'shortlist'],
      ['openai-agents-for-good', 'chosen'],
      ['openai-agents-for-good-2', 'candidate'],
    ])
    expect(readFileSync(join(d, 'challenge', 'brief', '00-chosen-challenge.md'), 'utf8')).toMatch(/^# Our challenge: Agents for good \(OpenAI\)[\s\S]*mentor likes voice[\s\S]*Voice permits/)
    expect(YAML.parse(readFileSync(join(d, 'challenge', 'hackforge.yaml'), 'utf8')).challenge).toBe('OpenAI: Agents for good')
    expect(s.progress.done['p-challenge']).toBe(true)

    s = await svc.deleteChallenge('openai-agents-for-good-2')
    expect(s.challenges).toHaveLength(2)
    await expect(svc.updateChallenge('../../etc/passwd', { title: 'x' })).rejects.toThrow(/Invalid challenge id/)
    svc.dispose()
  })

  it('keeps every change when ticks and score clicks overlap', async () => {
    const d = tmp()
    const svc = new EventService(() => d, () => {})
    await svc.setup(d)
    await svc.addChallenge({ partner: 'P', title: 'T', description: 'D' })
    await Promise.all([
      svc.updateProgress({ done: { a: true } }),
      svc.updateProgress({ done: { b: true } }),
      svc.updateProgress({ partner: { name: 'OpenAI', keys: true } }),
      svc.updateChallenge('p-t', { scores: { fit: 2 } }),
      svc.updateChallenge('p-t', { scores: { wow: 5 } }),
      svc.updateChallenge('p-t', { notes: 'mentor note' }),
    ])
    // Overlapping writes used to interleave and leave invalid JSON behind.
    expect(JSON.parse(readFileSync(join(d, 'challenge', 'event-checklist.json'), 'utf8'))).toEqual({ done: { a: true, b: true }, partners: { OpenAI: { keys: true } } })
    const s = await svc.state()
    expect(s.challenges[0]).toMatchObject({ scores: { fit: 2, wow: 5 }, notes: 'mentor note' })
    await expect(svc.updateChallenge('missing', { title: 'x' })).rejects.toThrow(/no longer exists/)
    // A failed write doesn't block the ones after it.
    expect((await svc.updateProgress({ done: { c: true } })).progress.done).toEqual({ a: true, b: true, c: true })
    svc.dispose()
  })

  it('adds LF rules to an existing .gitattributes once', async () => {
    const d = tmp()
    writeFileSync(join(d, '.gitattributes'), '*.png binary\n*.sh   text eol=lf')
    await ensureLfAttributes(d)
    await ensureLfAttributes(d)
    expect(readFileSync(join(d, '.gitattributes'), 'utf8')).toBe('*.png binary\n*.sh   text eol=lf\n*.bash text eol=lf\n*.py text eol=lf\n')
  })

  it('writes a fresh hackforge.yaml when there is none', () => {
    const y = mergeHackforgeYaml(undefined, { team: 4, models: { build: 'sonnet' }, checkpoints: ['decision'] })
    expect(YAML.parse(y)).toEqual({ team: 4, models: { build: 'sonnet' }, checkpoints: ['decision'] })
  })
})
