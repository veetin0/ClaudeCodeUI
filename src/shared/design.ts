/**
 * Design skills Harness ships and loads into every session (Settings › Tools):
 * - impeccable (github.com/pbakaus/impeccable, Apache-2.0): builds, polishes, critiques and audits
 *   UI, with an anti-pattern detector that checks every UI edit and does a deeper pass at the end.
 * - ui-ux-pro-max (github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT): picks a design system
 *   (style, palette, fonts) from a searchable database.
 * Claude pulls a skill in by itself when the task is UI work; only their short descriptions sit in
 * every session's context.
 */
export interface DesignSkillsSettings {
  impeccable: boolean
  uiUxProMax: boolean
  /** impeccable's detector reports only problems (no "clean file" notes), to save tokens. */
  quietDetector: boolean
}

export const DEFAULT_DESIGN_SKILLS: DesignSkillsSettings = { impeccable: true, uiUxProMax: true, quietDetector: true }

export const DESIGN_PLUGINS = [
  { key: 'impeccable', name: 'impeccable', label: 'impeccable', dir: 'impeccable', repo: 'https://github.com/pbakaus/impeccable' },
  { key: 'uiUxProMax', name: 'ui-ux-pro-max', label: 'UI/UX Pro Max', dir: 'ui-ux-pro-max', repo: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill' },
] as const

export type DesignPluginKey = (typeof DESIGN_PLUGINS)[number]['key']

export interface DesignPluginInfo {
  key: DesignPluginKey
  label: string
  /** 'builtin': Harness's copy; 'installed': your own newer install; 'off': switched off; 'missing': not bundled. */
  source: 'builtin' | 'installed' | 'off' | 'missing'
  version?: string
  path?: string
}

export interface DesignState {
  plugins: DesignPluginInfo[]
  /** impeccable's detector engine, downloaded once per computer to ~/.impeccable. */
  engine: { status: 'unknown' | 'checking' | 'ready' | 'failed' | 'off'; version?: string; error?: string }
}

/**
 * Appended to the system prompt: when to use which, so the two don't pull in different directions
 * (a style picked from a database vs impeccable's anti-pattern rules).
 */
export function designGuide(on: { impeccable: boolean; uiUxProMax: boolean }): string | undefined {
  if (!on.impeccable && !on.uiUxProMax) return undefined
  const lines = [
    '# Design skills (Harness)',
    'For frontend/UI work (pages, components, dashboards, forms, styling), load the matching design skill with the Skill tool before you start editing; skip them for backend-only work.',
  ]
  if (on.uiUxProMax) {
    lines.push(
      on.impeccable
        ? '- ui-ux-pro-max: once, at the start of a new product or a redesign, to choose the design system (style, palette, fonts, spacing). Record the choice in DESIGN.md at the project root, which impeccable reads. Don’t re-pick it on every change.'
        : '- ui-ux-pro-max: to choose the design system (style, palette, fonts, spacing) at the start of a new product or a redesign, and for UX and accessibility checks. Record the choice in DESIGN.md at the project root.',
    )
  }
  if (on.impeccable) {
    lines.push(
      '- impeccable: for building, polishing, critiquing and auditing UI. Act on its detector findings after edits. Where it disagrees with a style suggestion, DESIGN.md and impeccable’s anti-pattern rules win.',
      '- Messages starting "Change this element in the running app" come from Harness’s Click to change: treat them as polish work under impeccable’s rules, and keep the change to that element.',
    )
  }
  return lines.join('\n')
}
