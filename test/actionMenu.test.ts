import { describe, expect, it } from 'vitest'
import { actionMenuItems, actionScore, filterActions, findAction } from '../src/renderer/src/lib/actionMenu'
import { QUICK_ACTIONS } from '../src/renderer/src/lib/actions'
import { ECC_ACTIONS } from '../src/renderer/src/lib/eccActions'

describe('the / menu', () => {
  it('groups ECC’s build flow, quick actions and project commands', () => {
    const groups = actionMenuItems({ ecc: true, slashCommands: ['compact', 'clear', 'ecc:plan', 'ecc:gan-build', '_hidden'] })
    expect(groups.map((g) => g.heading)).toEqual(['Build with ECC', 'Quick actions', 'Project commands'])
    expect(groups[0].actions.map((a) => a.id).slice(0, 4)).toEqual(['ecc-prd', 'ecc-plan', 'ecc-mvp', 'ecc-improve'])
    expect(groups[1].actions).toHaveLength(QUICK_ACTIONS.length)
    // Terminal-only commands and ECC's hundreds of commands stay out of the project commands.
    expect(groups[2].actions.map((a) => a.id)).toEqual(['cmd:compact'])
  })

  it('leaves ECC out when it is turned off', () => {
    expect(actionMenuItems({ ecc: false, slashCommands: [] }).map((g) => g.heading)).toEqual(['Quick actions'])
  })

  it('runs ECC through its plugin commands and skills', () => {
    for (const a of ECC_ACTIONS) expect(a.template).toMatch(/^\/ecc:[a-z-]+|ecc:[a-z-]+ skill/)
    expect(new Set(ECC_ACTIONS.map((a) => a.id)).size).toBe(ECC_ACTIONS.length)
  })

  it('ranks a name match above a description match, so /plan picks Plan it', () => {
    const groups = actionMenuItems({ ecc: true, slashCommands: [] })
    const { flat, best } = filterActions(groups, '/plan')
    expect(flat[best].id).toBe('ecc-plan')
    expect(filterActions(groups, 'zzzz').flat).toHaveLength(0)
    expect(filterActions(groups, '').flat.length).toBe(groups.flatMap((g) => g.actions).length)
  })

  it('scores names, commands and descriptions', () => {
    const review = findAction('ecc-review')!
    expect(actionScore(review, 'code')).toBe(3)
    expect(actionScore(review, '/ecc:code-rev')).toBe(3)
    expect(actionScore(review, 'review')).toBe(2)
    expect(actionScore(review, 'zzz')).toBe(0)
  })

  it('finds actions by id', () => {
    expect(findAction('cmd:compact')?.label).toBe('/compact')
    expect(findAction('ecc-mvp')?.template).toBe('/ecc:orch-build-mvp {doc}')
    expect(findAction('nope')).toBeNull()
  })
})
