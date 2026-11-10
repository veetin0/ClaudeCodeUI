/**
 * Claude Code's advisor (experimental): the main model does the work and asks a more capable model
 * for advice at key moments (planning, when stuck, before calling a task done). Harness passes the
 * choice to each session it starts; '' leaves Claude Code's own setting (/advisor) alone.
 */
export const ADVISOR_CHOICES = ['', 'off', 'opus', 'fable'] as const
export type AdvisorChoice = (typeof ADVISOR_CHOICES)[number]

export const isAdvisorChoice = (v: unknown): v is AdvisorChoice => ADVISOR_CHOICES.includes(v as AdvisorChoice)

export const ADVISOR_LABEL: Record<AdvisorChoice, string> = {
  '': 'Claude Code’s setting',
  off: 'Off',
  opus: 'Opus',
  fable: 'Fable',
}

/** The CLI switch that turns the advisor off whatever the settings say. */
export const ADVISOR_OFF_ENV = 'CLAUDE_CODE_DISABLE_ADVISOR_TOOL'

/** What a session's SDK options need for a choice: the advisor model as a flag setting, or the off switch. */
export function advisorOptions(choice: AdvisorChoice | undefined): { settings?: { advisorModel: string }; env?: Record<string, string> } {
  if (choice === 'opus' || choice === 'fable') return { settings: { advisorModel: choice } }
  if (choice === 'off') return { env: { [ADVISOR_OFF_ENV]: '1' } }
  return {}
}

/** How the team run's lead Claude works: its main model and advisor ('' = the user's defaults). */
export interface LeadSetup {
  model: string
  advisor: AdvisorChoice
}

export const LEAD_SETUPS: { id: string; label: string; setup: LeadSetup; note?: string }[] = [
  {
    id: 'opus-fable',
    label: 'Opus, with Fable as advisor',
    setup: { model: 'opus', advisor: 'fable' },
    note: 'Opus does the work; Fable gives short advice at key moments. Fable uses your plan limits faster than Opus. Enable it once in a terminal: claude, then /model fable.',
  },
  { id: 'opus', label: 'Opus', setup: { model: 'opus', advisor: 'off' } },
  { id: 'default', label: 'Your default (Settings)', setup: { model: '', advisor: '' } },
]

export function leadSetupId(s: LeadSetup | undefined): string {
  return LEAD_SETUPS.find((x) => s && x.setup.model === s.model && x.setup.advisor === s.advisor)?.id ?? 'default'
}

/** A run project's saved lead setup, read defensively. */
export function parseLeadSetup(raw: unknown): LeadSetup | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  const model = typeof o.model === 'string' && /^[a-z0-9.\-[\]]{0,60}$/i.test(o.model) ? o.model : ''
  const advisor = isAdvisorChoice(o.advisor) ? o.advisor : ''
  return { model, advisor }
}
