import manifest from '@/assets/team/manifest.json'

/**
 * The team: each agent is played by a pixel character. The main agent is the manager; subagents
 * are cast by their type. Sprites come from scripts/team/anim.py (npm run team:sprites).
 */
export const CHARACTERS = ['manager', 'builder', 'scientist', 'architect', 'explorer'] as const
export type Character = (typeof CHARACTERS)[number]

export const CHARACTER_LABEL: Record<Character, string> = {
  manager: 'Manager',
  builder: 'Builder',
  scientist: 'Scientist',
  architect: 'Architect',
  explorer: 'Explorer',
}

export interface TeamManifest {
  frame: number
  frames: number
  skins: number
  outfits: number
  characters: Record<Character, { anims: string[]; ms: Record<string, number> }>
}

export const TEAM = manifest as TeamManifest

/** Reviewers, evaluators and analyzers check the work: the scientist in the lab coat. */
const SCIENTIST = /(review|evaluat|analy[sz]|auditor|hunter|sanitizer|e2e-runner|tester)/
/** Planners and architects draw the plan. */
const ARCHITECT = /(^plan$|planner|architect|spec-miner|design-direction)/
/** Explorers and researchers look things up. */
const EXPLORER = /(explore|explorer|docs-lookup|research|troubleshoot|scout)/

/** Who plays an agent: the main agent is the manager; a subagent by its type (e.g. "ecc:gan-evaluator"). */
export function characterFor(subagentType: string | undefined, isMain: boolean): Character {
  if (isMain) return 'manager'
  const type = (subagentType ?? '').replace(/^[\w-]+:/, '').toLowerCase()
  if (SCIENTIST.test(type)) return 'scientist'
  if (ARCHITECT.test(type)) return 'architect'
  if (EXPLORER.test(type)) return 'explorer'
  return 'builder'
}

/** A stable look for an agent: outfit accent and skin tone, from its id. */
export function variantFor(id: string): { outfit: number; skin: number } {
  // FNV-1a: tiny, stable, and well spread for short ids.
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return { outfit: h % TEAM.outfits, skin: Math.floor(h / TEAM.outfits) % TEAM.skins }
}

/** The row of an animation in its character's sheet (0 when the character doesn't have it). */
export function animRow(c: Character, anim: string): number {
  return Math.max(0, TEAM.characters[c].anims.indexOf(anim))
}

export function hasAnim(c: Character, anim: string): boolean {
  return TEAM.characters[c].anims.includes(anim)
}

/** Milliseconds a frame shows. */
export function frameMs(c: Character, anim: string): number {
  return TEAM.characters[c].ms[anim] ?? 220
}

/** One loop of an animation, in ms. */
export const cycleMs = (c: Character, anim: string) => frameMs(c, anim) * TEAM.frames
