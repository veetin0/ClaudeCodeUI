/**
 * Team board: each teammate's Harness shares a small status (what they're on, their sessions, plan
 * usage, HackForge state) through a relay, so four laptops and four Claude plans read as one team.
 */

export interface UsageWindow {
  /** Percent used, 0–100. */
  pct: number
  /** Epoch ms when the window resets. */
  resetsAt?: number
}

export interface PlanUsage {
  /** 'plan' = claude.ai subscription limits apply; 'api-key' = billed per token, no plan limits. */
  source: 'plan' | 'api-key' | 'unknown'
  subscription?: string
  fiveHour?: UsageWindow
  sevenDay?: UsageWindow
  /** Latest rate-limit status from the CLI. */
  status?: 'allowed' | 'allowed_warning' | 'rejected'
  /** When the status/limit that applies resets (epoch ms). */
  resetsAt?: number
  /** When this reading was taken (epoch ms). */
  at?: number
}

export interface MemberSession {
  title: string
  project: string
  status: 'starting' | 'idle' | 'running' | 'waiting' | 'compacting' | 'closed'
  /** Tool the main agent is running, e.g. "Bash: npm test". */
  activity?: string
  subagents: number
}

export interface MemberStatus {
  /** Stable per-install id. */
  id: string
  name: string
  /** What I'm working on (free text, e.g. "M3 frontend"). */
  focus?: string
  branch?: string
  sessions: MemberSession[]
  usage: PlanUsage
  hackforge?: { phase?: string; milestone?: string; mockScore?: number; loopIteration?: number; loopActive?: boolean }
  updatedAt: number
}

export interface TeamConfig {
  relayUrl: string
  token: string
  memberId: string
  memberName: string
  /** This Harness runs the relay (LAN). */
  hosting: boolean
}

export interface TeamState {
  config: TeamConfig | null
  /** Last sync worked. */
  connected: boolean
  error?: string
  lastSync?: number
  members: MemberStatus[]
  /** URLs teammates can use when this machine hosts the relay. */
  hostUrls?: string[]
  /** This machine's latest plan usage reading (also without a team). */
  myUsage: PlanUsage
}

/** A member who hasn't reported for this long is shown as offline. */
export const OFFLINE_AFTER_MS = 45_000

export const isOnline = (m: MemberStatus, now: number) => now - m.updatedAt < OFFLINE_AFTER_MS

// ---------- join codes ----------

const b64url = {
  encode: (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  decode: (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
}

/** "HT1.<base64url {u,t}>" — everything a teammate needs to join. */
export function makeJoinCode(relayUrl: string, token: string): string {
  return `HT1.${b64url.encode(JSON.stringify({ u: relayUrl, t: token }))}`
}

export function parseJoinCode(code: string): { relayUrl: string; token: string } | null {
  const m = /HT1\.([A-Za-z0-9_-]+)/.exec(code.trim())
  if (!m) return null
  try {
    const o = JSON.parse(b64url.decode(m[1])) as { u?: unknown; t?: unknown }
    if (typeof o.u !== 'string' || typeof o.t !== 'string' || !/^https?:\/\//.test(o.u) || o.t.length < 16) return null
    return { relayUrl: o.u.replace(/\/+$/, ''), token: o.t }
  } catch {
    return null
  }
}

// ---------- usage ----------

/** How much room a member has left, 0 (none) – 100 (all). Unknown counts as half. */
export function headroom(u: PlanUsage, now: number): number {
  if (u.source === 'api-key') return 90
  if (u.status === 'rejected' && (!u.resetsAt || u.resetsAt > now)) return 0
  const left = (w?: UsageWindow) => (w && (!w.resetsAt || w.resetsAt > now) ? 100 - w.pct : w ? 100 : undefined)
  const five = left(u.fiveHour)
  const week = left(u.sevenDay)
  if (five === undefined && week === undefined) return u.status === 'allowed_warning' ? 20 : 50
  return Math.max(0, Math.min(five ?? 100, week ?? 100))
}

export interface UsageAdvice {
  /** Best member to give the next task. */
  best?: MemberStatus
  /** Members close to or over a limit. */
  warnings: { member: MemberStatus; text: string; severity: 'warn' | 'stop' }[]
}

export function usageAdvice(members: MemberStatus[], now: number, fmtTime: (ms: number) => string): UsageAdvice {
  const online = members.filter((m) => isOnline(m, now))
  const warnings: UsageAdvice['warnings'] = []
  for (const m of online) {
    const u = m.usage
    const reset = u.resetsAt ?? u.fiveHour?.resetsAt
    if (u.status === 'rejected' && (!u.resetsAt || u.resetsAt > now)) {
      warnings.push({ member: m, severity: 'stop', text: `${m.name} hit a usage limit${reset ? ` until ${fmtTime(reset)}` : ''}: hand their work to someone else.` })
    } else if ((u.fiveHour?.pct ?? 0) >= 80 || u.status === 'allowed_warning') {
      warnings.push({
        member: m,
        severity: 'warn',
        text: `${m.name} is near the limit${u.fiveHour ? ` (${Math.round(u.fiveHour.pct)}% of 5 h` : ''}${u.fiveHour?.resetsAt ? `, resets ${fmtTime(u.fiveHour.resetsAt)})` : u.fiveHour ? ')' : ''}: keep their next task small.`,
      })
    } else if ((u.sevenDay?.pct ?? 0) >= 85) {
      warnings.push({ member: m, severity: 'warn', text: `${m.name} has used ${Math.round(u.sevenDay!.pct)}% of the weekly limit.` })
    }
  }
  const ranked = [...online].sort((a, b) => headroom(b.usage, now) - headroom(a.usage, now))
  const best = ranked[0] && headroom(ranked[0].usage, now) > 0 && online.length > 1 ? ranked[0] : undefined
  return { best, warnings }
}

/** Sanitises a status received from the relay (it's other people's data). */
export function pickMember(x: unknown): MemberStatus | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const s = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined)
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  if (!s(o.id) || !s(o.name) || !n(o.updatedAt)) return null
  const u = (o.usage && typeof o.usage === 'object' ? o.usage : {}) as Record<string, unknown>
  const win = (w: unknown): UsageWindow | undefined => {
    const r = (w && typeof w === 'object' ? w : null) as Record<string, unknown> | null
    return r && n(r.pct) !== undefined ? { pct: Math.max(0, Math.min(100, n(r.pct)!)), resetsAt: n(r.resetsAt) } : undefined
  }
  const hf = (o.hackforge && typeof o.hackforge === 'object' ? o.hackforge : undefined) as Record<string, unknown> | undefined
  return {
    id: s(o.id, 64)!,
    name: s(o.name, 40)!,
    focus: s(o.focus),
    branch: s(o.branch, 100),
    updatedAt: n(o.updatedAt)!,
    sessions: (Array.isArray(o.sessions) ? o.sessions : []).slice(0, 12).flatMap((x) => {
      const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
      const status = s(r.status, 20) as MemberSession['status'] | undefined
      return s(r.title) !== undefined && status ? [{ title: s(r.title)!, project: s(r.project, 80) ?? '', status, activity: s(r.activity), subagents: n(r.subagents) ?? 0 }] : []
    }),
    usage: {
      source: u.source === 'plan' || u.source === 'api-key' ? u.source : 'unknown',
      subscription: s(u.subscription, 20),
      fiveHour: win(u.fiveHour),
      sevenDay: win(u.sevenDay),
      status: u.status === 'allowed' || u.status === 'allowed_warning' || u.status === 'rejected' ? u.status : undefined,
      resetsAt: n(u.resetsAt),
      at: n(u.at),
    },
    hackforge: hf
      ? { phase: s(hf.phase, 30), milestone: s(hf.milestone), mockScore: n(hf.mockScore), loopIteration: n(hf.loopIteration), loopActive: hf.loopActive === true }
      : undefined,
  }
}
