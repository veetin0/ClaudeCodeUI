import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import {
  hackforgeRole,
  parseDirectives,
  parseLoop,
  parseLoopLog,
  parseMilestones,
  parseRules,
  parseState,
  parseVerify,
  parseWeight,
  pickConfig,
  setYamlProfile,
} from '@shared/hackforge'

const FIX = join(import.meta.dirname, 'fixtures', 'hackforge-project')
const read = (p: string) => readFileSync(join(FIX, p), 'utf8')

describe('HackForge templates as shipped (unfilled)', () => {
  // The kickoff templates contain placeholders; none of them should read as real data.
  const TEMPLATES = join(import.meta.dirname, 'fixtures', 'hackforge-templates')
  it('reads nothing from empty templates', () => {
    expect(parseState(readFileSync(join(TEMPLATES, 'STATE.md'), 'utf8'))).toEqual({ profile: undefined, milestone: undefined, next: undefined, latestMockScore: undefined, risks: undefined })
    expect(parseRules(readFileSync(join(TEMPLATES, 'RULES.md'), 'utf8'))).toEqual([])
    expect(parseMilestones(readFileSync(join(TEMPLATES, 'PLAN.md'), 'utf8'))).toEqual([
      { id: 'M1', goal: 'Thinnest submittable end-to-end slice', covers: 'D1, J1', status: 'todo' },
    ])
  })

  it('reads the skeleton hackforge.yaml', () => {
    const c = pickConfig(YAML.parse(readFileSync(join(TEMPLATES, 'hackforge.yaml'), 'utf8')))
    expect(c).toMatchObject({ hours: 24, team: 1, profile: 'auto', targetScore: 9, reserveMinutes: 90, plateau: 3, loopEnabled: true, checkpoints: ['decision'] })
    expect(c.deadline).toBeUndefined()
    expect(c.maxIterations).toBeUndefined()
  })
})

describe('a filled-in HackForge project', () => {
  it('reads STATE.md', () => {
    expect(parseState(read('.hackforge/STATE.md'))).toEqual({
      phase: 'loop',
      phaseIndex: 8,
      profile: 'standard',
      deadline: '2026-10-12T18:00+03:00',
      timeLeft: '9 h',
      milestone: 'M3 — demo polish',
      next: 'fix README setup (J4)',
      latestMockScore: 8.1,
      risks: 'Sponsor API rate limit during the live demo',
    })
  })

  it('reads RULES.md tables', () => {
    const rules = parseRules(read('.hackforge/RULES.md'))
    expect(rules.map((r) => r.id)).toEqual(['R1', 'R2', 'D1', 'D2', 'J1', 'J2', 'J3', 'J4'])
    expect(rules.find((r) => r.id === 'R1')).toMatchObject({ kind: 'rule', text: 'Use the Acme Maps API' })
    expect(rules.filter((r) => r.kind === 'criterion').map((r) => r.weight)).toEqual([0.3, 0.25, 0.25, 0.2])
  })

  it('reads PLAN.md milestones only from the milestones table', () => {
    expect(parseMilestones(read('.hackforge/PLAN.md'))).toEqual([
      { id: 'M1', goal: 'Thinnest submittable end-to-end slice', covers: 'D1, J1', status: 'done' },
      { id: 'M2', goal: 'Route scoring with real traffic data', covers: 'J2', status: 'done' },
      { id: 'M3', goal: 'Demo polish and video', covers: 'D2, J3', status: 'doing' },
      { id: 'M4', goal: 'Offline mode', covers: 'J1', status: 'todo' },
    ])
  })

  it('reads VERIFY.md', () => {
    expect(parseVerify(read('.hackforge/VERIFY.md'), 1)).toEqual({
      compliance: 'FAIL',
      mockScore: 8.1,
      gate: 'PASS',
      checks: [
        { id: 'R1', ok: true, note: 'src/maps.ts calls Acme' },
        { id: 'R2', ok: true, note: 'MIT LICENSE' },
        { id: 'D1', ok: true, note: 'github.com/team/route' },
        { id: 'D2', ok: false, note: 'video not recorded yet' },
      ],
      criterionScores: [
        { id: 'J1', score: 8.5 },
        { id: 'J2', score: 8 },
        { id: 'J3', score: 7.5 },
        { id: 'J4', score: 8.2 },
      ],
      fixOrder: ['Record the 3-minute demo video (D2)', 'README one-command setup (+0.3 J4)', 'Cache API responses for the live demo (+0.2 J3)'],
      mtime: 1,
    })
  })

  it('reads LOOP.json and LOOP.md', () => {
    const loop = parseLoop(JSON.parse(read('.hackforge/LOOP.json')), read('.hackforge/LOOP.md'))
    expect(loop).toMatchObject({ active: true, iteration: 4, maxIterations: 30, targetScore: 9, bestScore: 8.1, noGainStreak: 1, plateauLimit: 3, reserveMinutes: 90 })
    expect(loop.entries.map((e) => [e.iteration, e.score, e.kept])).toEqual([
      [1, 7.6, true],
      [2, 7.4, false],
      [3, 8.1, true],
      [4, 8.1, false],
    ])
    expect(loop.entries[0]).toMatchObject({ change: 'fix empty-route crash', gate: 'PASS', compliance: 'FAIL' })
  })

  it('reads DIRECTIVES.md and the project yaml', () => {
    expect(parseDirectives(read('.hackforge/DIRECTIVES.md'))).toEqual(['Prefer TypeScript end to end', 'No paid APIs except the sponsor’s'])
    expect(pickConfig(YAML.parse(read('challenge/hackforge.yaml')))).toMatchObject({ challenge: 'Acme city routing', team: 3, profile: 'standard', targetScore: 9, maxIterations: 30 })
  })
})

describe('helpers', () => {
  it('parses weights in the forms HackForge writes', () => {
    expect(parseWeight('~25 %')).toBeCloseTo(0.25)
    expect(parseWeight('30%')).toBeCloseTo(0.3)
    expect(parseWeight('3/10')).toBeCloseTo(0.3)
    expect(parseWeight('0.2')).toBeCloseTo(0.2)
    expect(parseWeight('What a top score looks like')).toBeUndefined()
  })

  it('rewrites the profile line, keeping its comment', () => {
    const y = 'hours: 24\nprofile: auto   # quick\nteam: 1\n'
    expect(setYamlProfile(y, 'deep')).toBe('hours: 24\nprofile: deep   # quick\nteam: 1\n')
    expect(setYamlProfile('hours: 24', 'max')).toBe('hours: 24\nprofile: max\n')
  })

  it('accepts loose LOOP.md lines', () => {
    expect(parseLoopLog('- #7 | tests for edge cases | PASS | PASS | 8.9/10 | committed')).toEqual([
      { iteration: 7, change: 'tests for edge cases', gate: 'PASS', compliance: 'PASS', score: 8.9, kept: true },
    ])
  })

  it('names HackForge agents', () => {
    expect(hackforgeRole('hackforge:rules-lawyer')).toBe('Rules Lawyer')
    expect(hackforgeRole('general-purpose')).toBeUndefined()
  })
})
