import { describe, expect, it } from 'vitest'
import type { HackforgePhase, HackforgeSnapshot, LoopStatus, Milestone } from '@shared/hackforge'
import { nextStep } from '../src/renderer/src/lib/nextStep'

const snap = (o: Partial<HackforgeSnapshot> & { phase?: HackforgePhase } = {}): HackforgeSnapshot => ({
  cwd: '/p',
  present: true,
  initialized: true,
  config: {},
  state: o.phase ? { phase: o.phase } : {},
  rules: [],
  directives: [],
  milestones: [],
  verifyStale: false,
  stopRequested: false,
  pluginInstalled: true,
  plugin: { source: 'builtin' },
  views: [],
  files: [],
  updatedAt: 0,
  ...o,
})
const ms = (...done: boolean[]): Milestone[] => done.map((d, i) => ({ id: `M${i + 1}`, goal: 'x', status: d ? 'done' : 'todo' }))

describe('nextStep', () => {
  it('suggests nothing with HackForge off or outside HackForge projects', () => {
    expect(nextStep(snap(), 'off')).toBeNull()
    expect(nextStep(snap({ present: false, initialized: false }), 'projects')).toBeNull()
    expect(nextStep(undefined, 'projects')).toBeNull()
  })

  it('suggests Init everywhere in "always" mode, and the pipeline once challenge/ exists', () => {
    expect(nextStep(snap({ present: false, initialized: false }), 'always')?.actionId).toBe('hf-init')
    expect(nextStep(snap({ initialized: false }), 'projects')?.actionId).toBe('hf-run')
  })

  it('follows the phases', () => {
    const at = (phase?: HackforgePhase, milestones: Milestone[] = []) => nextStep(snap({ phase, milestones }), 'projects')?.actionId
    expect(at(undefined)).toBe('hf-kickoff')
    expect(at('config')).toBe('hf-kickoff')
    for (const p of ['understand', 'widen', 'design', 'decide'] as const) expect(at(p)).toBe('hf-run')
    expect(at('build', ms(true, false))).toBe('hf-build')
    expect(at('build', ms(true, true))).toBe('hf-verify')
    expect(at('pitch')).toBe('hf-pitch')
    expect(at('verify')).toBe('hf-verify')
    expect(at('loop')).toBe('hf-perfect')
    expect(at('submit')).toBe('hf-status')
  })

  it('stays quiet while the improvement loop runs', () => {
    const loop = { active: true, iteration: 2, maxIterations: 10, targetScore: 9, noGainStreak: 0 } as LoopStatus
    expect(nextStep(snap({ phase: 'loop', loop }), 'projects')).toBeNull()
  })
})
