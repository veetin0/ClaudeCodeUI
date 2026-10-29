import { describe, expect, it } from 'vitest'
import type { HackforgeSnapshot } from '@shared/hackforge'
import { actionMenuItems, actionScore, filterActions, findAction, hackforgeOn } from '../src/renderer/src/lib/actionMenu'
import { QUICK_ACTIONS } from '../src/renderer/src/lib/actions'

const hf = (o: Partial<HackforgeSnapshot>) => ({ present: true, initialized: true, config: {}, state: {}, milestones: [], ...o }) as HackforgeSnapshot

describe('the / menu', () => {
  it('offers HackForge in projects that use it, everywhere in "always" mode, never when off', () => {
    expect(hackforgeOn(hf({}), 'projects')).toBe(true)
    expect(hackforgeOn(hf({ present: false }), 'projects')).toBe(false)
    expect(hackforgeOn(undefined, 'always')).toBe(true)
    expect(hackforgeOn(hf({}), 'off')).toBe(false)
  })

  it('groups the suggested next step, HackForge, quick actions and project commands', () => {
    const groups = actionMenuItems({ hf: hf({ state: { phase: 'verify' } }), mode: 'projects', slashCommands: ['compact', 'clear', 'hackforge:verify', '_hidden'] })
    expect(groups.map((g) => g.heading)).toEqual(['Suggested', 'HackForge', 'Quick actions', 'Project commands'])
    expect(groups[0].actions.map((a) => a.id)).toEqual(['hf-verify'])
    // The suggestion isn't listed twice.
    expect(groups[1].actions.some((a) => a.id === 'hf-verify')).toBe(false)
    expect(groups[2].actions).toHaveLength(QUICK_ACTIONS.length)
    // Terminal-only and HackForge's own commands stay out of the project commands.
    expect(groups[3].actions.map((a) => a.id)).toEqual(['cmd:compact'])
  })

  it('shows only the setup actions before kickoff, and no HackForge outside HackForge projects', () => {
    const before = actionMenuItems({ hf: hf({ initialized: false }), mode: 'projects', slashCommands: [] })
    const ids = before.flatMap((g) => g.actions.map((a) => a.id)).filter((id) => id.startsWith('hf-'))
    expect(ids).toContain('hf-run')
    expect(ids).not.toContain('hf-build')
    const plain = actionMenuItems({ hf: hf({ present: false, initialized: false }), mode: 'projects', slashCommands: [] })
    expect(plain.map((g) => g.heading)).toEqual(['Quick actions'])
  })

  it('ranks a name match above a description match, so /ver picks Verify', () => {
    const groups = actionMenuItems({ hf: hf({ state: { phase: 'build' } }), mode: 'projects', slashCommands: [] })
    const { flat, best } = filterActions(groups, '/ver')
    expect(flat[best].id).toBe('hf-verify')
    // Build still matches (its description says "verified"), just lower.
    expect(flat.some((a) => a.id === 'hf-build')).toBe(true)
    expect(filterActions(groups, 'zzzz').flat).toHaveLength(0)
    expect(filterActions(groups, '').flat.length).toBe(groups.flatMap((g) => g.actions).length)
  })

  it('scores names, commands and descriptions', () => {
    const verify = findAction('hf-verify')!
    expect(actionScore(verify, 'verify')).toBe(3)
    expect(actionScore(verify, '/hackforge:ver')).toBe(3)
    expect(actionScore(verify, 'erif')).toBe(2)
    expect(actionScore(verify, 'zzz')).toBe(0)
  })

  it('finds actions by id, with the project facts filled in', () => {
    expect(findAction('cmd:compact')?.label).toBe('/compact')
    const run = findAction('hf-run', hf({ config: { profile: 'lean' } }))
    expect(run?.params.find((p) => p.key === 'profile')?.example).toBe('lean')
    expect(findAction('nope')).toBeNull()
  })
})
