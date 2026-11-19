import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHARACTERS, TEAM } from '../src/renderer/src/features/team/cast'

const DIR = join(import.meta.dirname, '..', 'src', 'renderer', 'src', 'assets', 'team')
const size = (file: string) => {
  const b = readFileSync(join(DIR, file))
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

describe('the team sprites', () => {
  it('has a sheet for every character variant, one 32 px row of 4 frames per animation', () => {
    expect(Object.keys(TEAM.characters).sort()).toEqual([...CHARACTERS].sort())
    for (const c of CHARACTERS) {
      const anims = TEAM.characters[c].anims
      expect(anims[0], c).toBe('idle')
      for (let o = 0; o < TEAM.outfits; o++)
        for (let s = 0; s < TEAM.skins; s++) expect(size(`${c}-${o}-${s}.png`), `${c}-${o}-${s}`).toEqual({ w: TEAM.frame * TEAM.frames, h: TEAM.frame * anims.length })
    }
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png'))).toHaveLength(CHARACTERS.length * TEAM.outfits * TEAM.skins)
  })

  it('has the animations each character needs', () => {
    const need = {
      manager: ['idle', 'plan', 'point_r', 'watch', 'crossed', 'cheer', 'facepalm'],
      builder: ['idle', 'run', 'build', 'ponder', 'knocked', 'done'],
      scientist: ['idle', 'walk', 'read', 'inspect', 'nervous', 'approve'],
      architect: ['idle', 'walk', 'draft', 'ponder', 'present', 'knocked'],
      explorer: ['idle', 'scout', 'look', 'found', 'knocked'],
    }
    for (const c of CHARACTERS) expect(TEAM.characters[c].anims, c).toEqual(expect.arrayContaining(need[c]))
    expect(TEAM.characters.builder.ms.run).toBeLessThan(TEAM.characters.builder.ms.build)
  })
})
