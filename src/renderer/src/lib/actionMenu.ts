import type { HackforgeMode, HackforgeSnapshot } from '@shared/hackforge'
import { commandAction, QUICK_ACTIONS, visibleCommands, type QuickAction } from './actions'
import { HACKFORGE_ACTIONS, HACKFORGE_SETUP } from './hackforgeActions'
import { nextStep } from './nextStep'

export interface ActionGroup {
  heading: string
  actions: QuickAction[]
}

/** HackForge actions apply in projects that use it, or everywhere in "always" mode. */
export function hackforgeOn(hf: HackforgeSnapshot | null | undefined, mode: HackforgeMode): boolean {
  return mode !== 'off' && (!!hf?.present || mode === 'always')
}

/** HackForge's actions with the project's facts filled in: Run starts on the profile hackforge.yaml already has. */
export function hackforgeActions(hf: HackforgeSnapshot | null | undefined): QuickAction[] {
  const profile = hf?.config.profile
  return HACKFORGE_ACTIONS.map((a) => (a.id === 'hf-run' && profile ? { ...a, params: a.params.map((p) => (p.key === 'profile' ? { ...p, example: profile } : p)) } : a))
}

/** Finds an action by id: a quick action, a HackForge one, or 'cmd:<name>' for a slash command. */
export function findAction(id: string, hf?: HackforgeSnapshot | null): QuickAction | null {
  return QUICK_ACTIONS.find((a) => a.id === id) ?? hackforgeActions(hf).find((a) => a.id === id) ?? (id.startsWith('cmd:') ? commandAction(id.slice(4)) : null)
}

/**
 * Everything the / menu (and ⌘K) offers, grouped: the suggested next step, HackForge, quick
 * actions and the project's own slash commands. Same forms as the old chip rows.
 */
export function actionMenuItems(o: { hf?: HackforgeSnapshot | null; mode: HackforgeMode; slashCommands: string[] }): ActionGroup[] {
  const groups: ActionGroup[] = []
  const hfOn = hackforgeOn(o.hf, o.mode)
  const hf = hfOn ? hackforgeActions(o.hf).filter((a) => o.hf?.initialized || HACKFORGE_SETUP.has(a.id)) : []
  const next = nextStep(o.hf, o.mode)
  const suggested = next && hf.find((a) => a.id === next.actionId)
  if (suggested) groups.push({ heading: 'Suggested', actions: [suggested] })
  if (hf.length) groups.push({ heading: 'HackForge', actions: hf.filter((a) => a !== suggested) })
  groups.push({ heading: 'Quick actions', actions: QUICK_ACTIONS })
  // HackForge's own commands already have buttons above.
  const commands = visibleCommands(o.slashCommands).filter((c) => !(hfOn && c.startsWith('hackforge:')))
  if (commands.length) groups.push({ heading: 'Project commands', actions: commands.map(commandAction) })
  return groups
}

/**
 * How well a typed filter ("ver", "/verify full") fits an action: 3 when its name or command
 * starts with it, 2 when the name contains it, 1 for the description only, 0 for no match.
 */
export function actionScore(a: QuickAction, query: string): number {
  const q = query.trim().replace(/^\//, '').split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!q) return 1
  const label = a.label.toLowerCase().replace(/^\//, '')
  const cmd = /^\/([\w:-]+)/.exec(a.template)?.[1]?.toLowerCase() ?? ''
  if (label.startsWith(q) || cmd.startsWith(q) || cmd.split(':').pop()!.startsWith(q)) return 3
  if (label.includes(q) || cmd.includes(q)) return 2
  return a.description.toLowerCase().includes(q) ? 1 : 0
}

/** The menu's groups for a filter: matching actions only, best matches first; `best` is the one Enter picks. */
export function filterActions(groups: ActionGroup[], query: string): { groups: ActionGroup[]; flat: QuickAction[]; best: number } {
  const scored = groups
    .map((g) => ({
      heading: g.heading,
      actions: g.actions
        .map((a) => ({ a, s: actionScore(a, query) }))
        .filter((x) => x.s > 0)
        .sort((x, y) => y.s - x.s)
        .map((x) => x.a),
    }))
    .filter((g) => g.actions.length > 0)
  const flat = scored.flatMap((g) => g.actions)
  let best = 0
  flat.forEach((a, i) => {
    if (actionScore(a, query) > actionScore(flat[best], query)) best = i
  })
  return { groups: scored, flat, best }
}
