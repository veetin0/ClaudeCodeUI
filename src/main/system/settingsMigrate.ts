/** Settings from earlier versions that no longer exist (hackathon mode, the team board, crew, HackForge). */
export const RETIRED_SETTINGS = ['eventProject', 'hackforgeMode', 'team', 'teamMemberId', 'handoffDirs', 'crewAutoReports', 'teamServer'] as const

/**
 * A stored settings file brought up to date: the event project becomes the current project, and
 * retired settings are dropped so they aren't written back.
 */
export function migrateStored<T extends Record<string, unknown>>(stored: T): Omit<T, (typeof RETIRED_SETTINGS)[number]> & { project?: string | null } {
  const out: Record<string, unknown> = { ...stored }
  if (out.project === undefined && typeof stored.eventProject === 'string') out.project = stored.eventProject
  for (const k of RETIRED_SETTINGS) delete out[k]
  return out as Omit<T, (typeof RETIRED_SETTINGS)[number]> & { project?: string | null }
}
