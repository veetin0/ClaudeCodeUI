import { commandAction, QUICK_ACTIONS, visibleCommands, type QuickAction } from './actions'
import { ECC_ACTIONS } from './eccActions'

export interface ActionGroup {
  heading: string
  actions: QuickAction[]
}

/** Finds an action by id: a quick action, an ECC one, or 'cmd:<name>' for a slash command. */
export function findAction(id: string): QuickAction | null {
  return QUICK_ACTIONS.find((a) => a.id === id) ?? ECC_ACTIONS.find((a) => a.id === id) ?? (id.startsWith('cmd:') ? commandAction(id.slice(4)) : null)
}

/**
 * Everything the / menu (and ⌘K) offers, grouped: ECC's build flow and tools, quick actions and
 * the project's own slash commands. ECC's hundreds of commands stay reachable by typing /ecc:…
 */
export function actionMenuItems(o: { ecc: boolean; slashCommands: string[] }): ActionGroup[] {
  const groups: ActionGroup[] = []
  if (o.ecc) groups.push({ heading: 'Build with ECC', actions: ECC_ACTIONS })
  groups.push({ heading: 'Quick actions', actions: QUICK_ACTIONS })
  const commands = visibleCommands(o.slashCommands).filter((c) => !c.startsWith('ecc:'))
  if (commands.length) groups.push({ heading: 'Project commands', actions: commands.map(commandAction) })
  return groups
}

/**
 * How well a typed filter ("ver", "/verify full") fits an action: 4 when it is the command, 3 when
 * its name or command starts with it, 2 when the name contains it, 1 for the description only, 0 for no match.
 */
export function actionScore(a: QuickAction, query: string): number {
  const q = query.trim().replace(/^\//, '').split(/\s+/)[0]?.toLowerCase() ?? ''
  if (!q) return 1
  const label = a.label.toLowerCase().replace(/^\//, '')
  const cmd = /^\/([\w:-]+)/.exec(a.template)?.[1]?.toLowerCase() ?? ''
  // The command itself, typed out (/plan, /ecc:plan), beats one that only starts with it (/plan-prd).
  if (cmd === q || cmd.split(':').pop() === q) return 4
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
