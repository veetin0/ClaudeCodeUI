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

/** A file a teammate changed in the shared project: since their branch left main, committed or not. */
export interface FileChangeInfo {
  /** Relative to the repository root, forward slashes. */
  path: string
  /** Changed line ranges in the base version (1-based, inclusive). Absent for new or binary files. */
  ranges?: [number, number][]
  /** Not committed yet. */
  uncommitted: boolean
}

/** Where a member's changes are measured from, so only the same repository is compared. */
export interface ChangeScan {
  /** The repository, from its origin URL (host/owner/name), or the folder name without a remote. */
  repo: string
  /** Commit the line ranges refer to; ranges only line up between members on the same base. */
  base?: string
  files: FileChangeInfo[]
}

/** Work handed to the team, e.g. when the giver's usage limit ran out. */
export interface Handoff {
  id: string
  title: string
  /** Markdown: what was asked, the task list, changed files and where it stopped. */
  note: string
  /** Branch on the remote with the work (a snapshot of the giver's folder, uncommitted changes included). */
  branch?: string
  repo?: string
  project: string
  reason: 'limit' | 'manual'
  createdAt: number
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
  /** Files changed in the event project (conflict radar). */
  changes?: ChangeScan
  /** Work this member handed to the team. */
  handoffs?: Handoff[]
  /** Ids of handoffs this member took over. */
  took?: string[]
  /** Partner API keys shared with the team, encrypted with the team token (the relay can't read them). */
  secrets?: string
  /** Tokens used today on this laptop (usage view). */
  today?: { tokens: number; costUsd: number; byModel: Record<string, number> }
  updatedAt: number
}

export interface TeamConfig {
  relayUrl: string
  token: string
  memberId: string
  memberName: string
  /** This Harness runs the relay (LAN). */
  hosting: boolean
  /** Work I handed to the team (kept across restarts, shown on everyone's board). */
  handoffs?: Handoff[]
  /** Handoffs I took over. */
  took?: string[]
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
  /** Files two or more teammates changed (conflict radar). */
  conflicts: Conflict[]
  /** Work handed to the team, newest first. */
  handoffs: OpenHandoff[]
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

/**
 * Sanitises a status received from the relay (it's other people's data). `updatedAt` comes from
 * the relay's "seen n ms ago" when it sends one, so a teammate whose clock is off still shows
 * online correctly; older relays fall back to the sender's own timestamp.
 */
export function pickMember(x: unknown, now = Date.now()): MemberStatus | null {
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
    updatedAt: n(o.seenMsAgo) !== undefined && n(o.seenMsAgo)! >= 0 ? now - n(o.seenMsAgo)! : n(o.updatedAt)!,
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
    changes: pickChanges(o.changes),
    handoffs: (Array.isArray(o.handoffs) ? o.handoffs : []).slice(0, MAX_HANDOFFS).flatMap((x) => {
      const h = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
      if (!s(h.id, 64) || !s(h.title) || !n(h.createdAt)) return []
      return [
        {
          id: s(h.id, 64)!,
          title: s(h.title)!,
          note: s(h.note, MAX_NOTE) ?? '',
          branch: s(h.branch, 120),
          repo: s(h.repo, 200),
          project: s(h.project, 80) ?? '',
          reason: h.reason === 'limit' ? ('limit' as const) : ('manual' as const),
          createdAt: n(h.createdAt)!,
        },
      ]
    }),
    took: (Array.isArray(o.took) ? o.took : []).slice(0, 50).flatMap((t) => (s(t, 64) ? [s(t, 64)!] : [])),
    secrets: s(o.secrets, 16_000),
    today: pickToday(o.today),
  }
}

export const MAX_HANDOFFS = 4
export const MAX_NOTE = 8000
export const MAX_CHANGED_FILES = 300
const MAX_RANGES = 24

function pickChanges(x: unknown): ChangeScan | undefined {
  const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null
  if (!o || typeof o.repo !== 'string' || !Array.isArray(o.files)) return undefined
  const files = o.files.slice(0, MAX_CHANGED_FILES).flatMap((f) => {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    if (typeof r.path !== 'string' || !r.path || r.path.length > 400) return []
    const ranges = Array.isArray(r.ranges)
      ? r.ranges.slice(0, MAX_RANGES).flatMap((g) => (Array.isArray(g) && typeof g[0] === 'number' && typeof g[1] === 'number' && g[0] <= g[1] ? [[g[0], g[1]] as [number, number]] : []))
      : undefined
    return [{ path: r.path, ranges, uncommitted: r.uncommitted === true }]
  })
  return { repo: o.repo.slice(0, 200), base: typeof o.base === 'string' ? o.base.slice(0, 64) : undefined, files }
}

function pickToday(x: unknown): MemberStatus['today'] {
  const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null
  if (!o || typeof o.tokens !== 'number' || !Number.isFinite(o.tokens)) return undefined
  const byModel: Record<string, number> = {}
  for (const [k, v] of Object.entries((o.byModel && typeof o.byModel === 'object' ? o.byModel : {}) as Record<string, unknown>).slice(0, 8)) {
    if (typeof v === 'number' && Number.isFinite(v)) byModel[k.slice(0, 40)] = v
  }
  return { tokens: o.tokens, costUsd: typeof o.costUsd === 'number' && Number.isFinite(o.costUsd) ? o.costUsd : 0, byModel }
}

// ---------- conflict radar ----------

export interface ConflictMember {
  id: string
  name: string
  uncommitted: boolean
  ranges?: [number, number][]
}

export interface Conflict {
  path: string
  /** Everyone with changes to the file; you first. */
  members: ConflictMember[]
  /** 'lines': the same lines (or both created the file), so merging will conflict. 'file': different parts of it. */
  overlap: 'lines' | 'file'
  involvesMe: boolean
}

/** Changed lines this close count as the same place (git conflicts on adjacent lines too). */
const NEAR = 3

function rangesMeet(a?: [number, number][], b?: [number, number][]): boolean {
  if (!a || !b) return !a && !b
  return a.some(([s1, e1]) => b.some(([s2, e2]) => s1 <= e2 + NEAR && s2 <= e1 + NEAR))
}

/**
 * Files two or more teammates changed in the same repository. Line ranges are compared only when
 * both were measured from the same commit; otherwise a shared file counts as "same file".
 */
export function findConflicts(members: MemberStatus[], meId: string): Conflict[] {
  const byPath = new Map<string, { m: MemberStatus; f: FileChangeInfo }[]>()
  const me = members.find((m) => m.id === meId)
  const repo = me?.changes?.repo
  for (const m of members) {
    if (!m.changes || (repo && m.changes.repo !== repo)) continue
    for (const f of m.changes.files) {
      const list = byPath.get(f.path) ?? []
      list.push({ m, f })
      byPath.set(f.path, list)
    }
  }
  const out: Conflict[] = []
  for (const [path, list] of byPath) {
    if (list.length < 2) continue
    list.sort((a, b) => (a.m.id === meId ? -1 : b.m.id === meId ? 1 : a.m.name.localeCompare(b.m.name)))
    let lines = false
    for (let i = 0; i < list.length && !lines; i++)
      for (let j = i + 1; j < list.length && !lines; j++) {
        const [x, y] = [list[i], list[j]]
        const sameBase = !!x.m.changes?.base && x.m.changes.base === y.m.changes?.base
        lines = sameBase ? rangesMeet(x.f.ranges, y.f.ranges) : !x.f.ranges && !y.f.ranges
      }
    out.push({
      path,
      members: list.map(({ m, f }) => ({ id: m.id, name: m.name, uncommitted: f.uncommitted, ranges: f.ranges })),
      overlap: lines ? 'lines' : 'file',
      involvesMe: list.some((x) => x.m.id === meId),
    })
  }
  const rank = (c: Conflict) => (c.involvesMe ? 0 : 2) + (c.overlap === 'lines' ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))
}

/** "lines 40–62, 90" for a heads-up. */
export function describeRanges(ranges?: [number, number][]): string {
  if (!ranges?.length) return 'the whole file'
  const parts = ranges.slice(0, 4).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  return `line${ranges.length === 1 && ranges[0][0] === ranges[0][1] ? '' : 's'} ${parts.join(', ')}${ranges.length > 4 ? '…' : ''}`
}

// ---------- handoffs ----------

/** How long an offered handoff stays on the board. */
export const HANDOFF_TTL_MS = 12 * 3600_000

export interface OpenHandoff extends Handoff {
  fromId: string
  fromName: string
  /** Name of whoever took it, if someone did. */
  takenBy?: string
}

/** Handoffs on the board, newest first: everyone's, with who took them. */
export function listHandoffs(members: MemberStatus[], now: number): OpenHandoff[] {
  const takers = new Map<string, string>()
  for (const m of members) for (const id of m.took ?? []) if (!takers.has(id)) takers.set(id, m.name)
  return members
    .flatMap((m) => (m.handoffs ?? []).map((h) => ({ ...h, fromId: m.id, fromName: m.name, takenBy: takers.get(h.id) })))
    .filter((h) => now - h.createdAt < HANDOFF_TTL_MS)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** "handoff/ada-1114-2305": a branch name for a handoff from this member at this time. */
export function handoffBranch(name: string, at: Date): string {
  const slug =
    name
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .slice(0, 24) || 'teammate'
  const p = (n: number) => String(n).padStart(2, '0')
  return `handoff/${slug}-${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}`
}
