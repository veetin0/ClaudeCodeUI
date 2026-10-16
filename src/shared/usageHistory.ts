/** Tokens one model used, as Claude Code reports them (cumulative per agent process). */
export interface ModelTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  costUsd: number
}

export type ModelFamily = 'sonnet' | 'opus' | 'haiku' | 'other'

/** Fixed order: chart colors follow the family, never its rank. */
export const FAMILIES: ModelFamily[] = ['sonnet', 'opus', 'haiku', 'other']

export const FAMILY_LABEL: Record<ModelFamily, string> = { sonnet: 'Sonnet', opus: 'Opus', haiku: 'Haiku', other: 'Other' }

export function familyOf(model: string): ModelFamily {
  const m = model.toLowerCase()
  return m.includes('sonnet') ? 'sonnet' : m.includes('opus') ? 'opus' : m.includes('haiku') ? 'haiku' : 'other'
}

/**
 * What a turn added: the difference between two cumulative readings (a resumed session starts
 * counting from zero again, so a drop means a new process).
 */
export function usageDelta(prev: Record<string, ModelTokens> | undefined, now: Record<string, ModelTokens>): Record<string, ModelTokens> {
  const out: Record<string, ModelTokens> = {}
  for (const [model, u] of Object.entries(now)) {
    const p = prev?.[model]
    const restarted = p && (u.input < p.input || u.output < p.output || u.cacheRead < p.cacheRead)
    const base = p && !restarted ? p : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 }
    const d = {
      input: u.input - base.input,
      output: u.output - base.output,
      cacheRead: u.cacheRead - base.cacheRead,
      cacheWrite: u.cacheWrite - base.cacheWrite,
      costUsd: Math.max(0, u.costUsd - base.costUsd),
    }
    if (d.input > 0 || d.output > 0 || d.cacheRead > 0 || d.cacheWrite > 0) out[model] = d
  }
  return out
}

/** New tokens a turn processed: fresh input, cache writes and output (cache reads are counted apart). */
export const freshTokens = (u: Pick<ModelTokens, 'input' | 'output' | 'cacheWrite'>) => u.input + u.output + u.cacheWrite

/** YYYY-MM-DD in this computer's time zone. */
export function localDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface DayUsage {
  day: string
  /** Fresh tokens per model family. */
  tokens: Record<ModelFamily, number>
  cacheRead: number
  costUsd: number
}

export interface UsageHistory {
  /** Oldest first, one entry per day (empty days included). */
  days: DayUsage[]
  totals: { tokens: Record<ModelFamily, number>; cacheRead: number; costUsd: number }
  topSessions: { id: string; title: string; cwd: string; tokens: number; costUsd: number; lastTs: number }[]
  saver: { sonnetTurns: number; opusTurns: number; takeovers: number; compactions: number; compactedTokens: number; skipped: number; skippedTokens: number }
  /** Plan usage readings over the last two days (5-hour and weekly percent). */
  samples: { ts: number; fivePct?: number; sevenPct?: number }[]
}

export const emptyFamilies = (): Record<ModelFamily, number> => ({ sonnet: 0, opus: 0, haiku: 0, other: 0 })
export const sumFamilies = (t: Record<ModelFamily, number>) => t.sonnet + t.opus + t.haiku + t.other
