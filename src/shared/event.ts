/**
 * Event mode: a hackathon's schedule, partners and checklists, from an `event.yaml`.
 * Times in the YAML are wall-clock times in the event's IANA time zone ("2026-11-13 16:00"),
 * so they stay right across daylight-saving changes between now and the event.
 */

export type MilestoneKind = 'official' | 'deadline' | 'plan' | 'sleep'

export interface EventMilestone {
  id: string
  label: string
  /** Local time in the event's zone, "YYYY-MM-DD HH:mm". */
  at: string
  /** End of a span (sleep shifts, build blocks). */
  end?: string
  kind: MilestoneKind
  note?: string
}

export interface EventPartner {
  name: string
  url?: string
  category: string
  note?: string
}

export type ChecklistGroup = 'prep' | 'preliminary' | 'final' | 'logistics'

export interface ChecklistItem {
  id: string
  group: ChecklistGroup
  label: string
  /** Local date or time in the event's zone it should be done by. */
  due?: string
  note?: string
}

export interface EventConfig {
  id: string
  name: string
  theme?: string
  tagline?: string
  location?: string
  address?: string
  url?: string
  timezone: string
  teamSize?: number
  team: string[]
  milestones: EventMilestone[]
  partners: EventPartner[]
  checklist: ChecklistItem[]
}

/** Shared, git-synced progress for an event project (challenge/event-checklist.json). */
export interface EventProgress {
  done: Record<string, boolean>
  /** Per partner name: account + API key ready, starter kit tested. */
  partners: Record<string, { keys?: boolean; kit?: boolean }>
}

export interface EventState {
  config: EventConfig
  /** Where the config came from: the built-in preset or the project's challenge/event.yaml. */
  source: 'preset' | 'project'
  /** Linked event project folder, if any. */
  projectDir?: string
  /** The project has been set up for the event (challenge/event.yaml exists). */
  projectReady: boolean
  progress: EventProgress
}

export const CHECKLIST_GROUPS: Record<ChecklistGroup, string> = {
  prep: 'Preparation',
  logistics: 'Event-day logistics',
  preliminary: 'Preliminary submission',
  final: 'Final submission',
}

// ---------- time zones (no library: Intl gives the offset) ----------

/** Offset of `zone` from UTC at instant `ms`, in minutes. */
export function zoneOffsetMinutes(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000)
}

/** "2026-11-13 16:00" in `zone` → epoch ms. Accepts a full ISO string with offset too. */
export function zonedTime(local: string, zone: string): number {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(local.trim())) return Date.parse(local)
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(local.trim())
  if (!m) return NaN
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0))
  // Two passes settle the offset even right next to a DST change.
  let t = guess - zoneOffsetMinutes(guess, zone) * 60_000
  t = guess - zoneOffsetMinutes(t, zone) * 60_000
  return t
}

export function formatInZone(ms: number, zone: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: zone, ...opts }).format(ms)
}

/** "UTC+2" for the zone at that instant. */
export function zoneLabel(ms: number, zone: string): string {
  const off = zoneOffsetMinutes(ms, zone)
  const h = Math.trunc(off / 60)
  const m = Math.abs(off % 60)
  return `UTC${off >= 0 ? '+' : '-'}${Math.abs(h)}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** "37d 4h", "5h 12m", "48m", "35s". */
export function formatSpan(ms: number): string {
  const a = Math.abs(ms)
  const d = Math.floor(a / 86_400_000)
  const h = Math.floor((a % 86_400_000) / 3_600_000)
  const m = Math.floor((a % 3_600_000) / 60_000)
  const s = Math.floor((a % 60_000) / 1000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

// ---------- the clock ----------

export interface TimedMilestone extends EventMilestone {
  t: number
  tEnd?: number
}

export interface EventClock {
  stage: 'before' | 'during' | 'after'
  start: number
  end: number
  milestones: TimedMilestone[]
  /** Next point in time (any kind except sleep). */
  next?: TimedMilestone
  /** Next official deadline. */
  nextDeadline?: TimedMilestone
  /** Spans (sleep shifts) happening now. */
  ongoing: TimedMilestone[]
}

export function timedMilestones(config: EventConfig): TimedMilestone[] {
  return config.milestones
    .map((m) => ({ ...m, t: zonedTime(m.at, config.timezone), tEnd: m.end ? zonedTime(m.end, config.timezone) : undefined }))
    .filter((m) => Number.isFinite(m.t))
    .sort((a, b) => a.t - b.t)
}

export function eventClock(config: EventConfig, now: number): EventClock {
  const ms = timedMilestones(config)
  const official = ms.filter((m) => m.kind === 'official' || m.kind === 'deadline')
  const start = official[0]?.t ?? ms[0]?.t ?? now
  const end = Math.max(...official.map((m) => m.tEnd ?? m.t), start)
  return {
    stage: now < start ? 'before' : now > end ? 'after' : 'during',
    start,
    end,
    milestones: ms,
    next: ms.find((m) => m.kind !== 'sleep' && m.t > now),
    nextDeadline: ms.find((m) => m.kind === 'deadline' && m.t > now),
    ongoing: ms.filter((m) => m.tEnd !== undefined && m.t <= now && now < m.tEnd),
  }
}

// ---------- parsing ----------

const str = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const KINDS: MilestoneKind[] = ['official', 'deadline', 'plan', 'sleep']
const GROUPS = Object.keys(CHECKLIST_GROUPS) as ChecklistGroup[]

/** event.yaml after YAML parsing → EventConfig. Unknown or malformed entries are dropped, not fatal. */
export function pickEvent(y: unknown, fallbackId = 'event'): EventConfig {
  const o = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object') : [])
  const name = str(o.name) || 'Hackathon'
  return {
    id: str(o.id) || slug(name) || fallbackId,
    name,
    theme: str(o.theme) || undefined,
    tagline: str(o.tagline) || undefined,
    location: str(o.location) || undefined,
    address: str(o.address) || undefined,
    url: str(o.url) || undefined,
    timezone: str(o.timezone) || 'UTC',
    teamSize: typeof o.team_size === 'number' ? o.team_size : undefined,
    team: Array.isArray(o.team) ? o.team.map(str).filter(Boolean) : [],
    milestones: list(o.schedule)
      .map((m) => ({
        id: str(m.id) || slug(str(m.label)),
        label: str(m.label),
        at: str(m.at),
        end: str(m.end) || undefined,
        kind: (KINDS.includes(m.kind as MilestoneKind) ? m.kind : 'plan') as MilestoneKind,
        note: str(m.note) || undefined,
      }))
      .filter((m) => m.label && m.at),
    partners: list(o.partners)
      .map((p) => ({ name: str(p.name), url: str(p.url) || undefined, category: str(p.category) || 'Other', note: str(p.note) || undefined }))
      .filter((p) => p.name),
    checklist: list(o.checklist)
      .map((c) => ({
        id: str(c.id) || slug(str(c.label)),
        group: (GROUPS.includes(c.group as ChecklistGroup) ? c.group : 'prep') as ChecklistGroup,
        label: str(c.label),
        due: str(c.due) || undefined,
        note: str(c.note) || undefined,
      }))
      .filter((c) => c.label),
  }
}

export function pickProgress(j: unknown): EventProgress {
  const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>
  const done = (o.done && typeof o.done === 'object' ? o.done : {}) as Record<string, unknown>
  const partners = (o.partners && typeof o.partners === 'object' ? o.partners : {}) as Record<string, Record<string, unknown>>
  return {
    done: Object.fromEntries(Object.entries(done).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>,
    partners: Object.fromEntries(Object.entries(partners).map(([k, v]) => [k, { keys: v?.keys === true, kit: v?.kit === true }])),
  }
}
