import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { promisify } from 'node:util'
import type { SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import {
  describeRanges,
  findConflicts,
  HANDOFF_TTL_MS,
  listHandoffs,
  makeJoinCode,
  MAX_HANDOFFS,
  parseJoinCode,
  pickMember,
  type ChangeScan,
  type Conflict,
  type Handoff,
  type MemberSession,
  type MemberStatus,
  type OpenHandoff,
  type PlanUsage,
  type TeamConfig,
  type TeamState,
} from '@shared/team'
import { relTo } from '@shared/paths'
import { scanChanges } from './changes'
import { openBytes, openCrew, openSecrets, sealBytes, sealCrew, sealSecrets } from './secrets'
import { createRelay } from '../../../relay/relay.mjs'
import type { PlanUsageReading } from '../agent/AgentService'

const run = promisify(execFile)
export const RELAY_PORT = 47830
const SYNC_MS = 5000
/** While crew missions run: messages and permission questions shouldn't wait 5 s per hop. */
const FAST_SYNC_MS = 2000
const USAGE_POLL_MS = 120_000
/** How often the project's changed files are rescanned for the conflict radar. */
const SCAN_MS = 10_000

/** Teammates' shared partner keys: env name → value and who shared it. */
export type TeamKeys = Record<string, { value: string; from: string }>

/** Crew mode rides on the team sync: a payload out, teammates' payloads in. */
export interface CrewHook {
  /** What this laptop adds to its status (sealed with the team key before it leaves). */
  payload(): unknown
  /** Teammates' crew payloads after each sync (opened; not yet sanitised). */
  received(entries: { member: MemberStatus; payload: unknown }[]): void
  /** Sync faster (missions are running or waiting). */
  fast(): boolean
}

export interface TeamDeps {
  getConfig(): TeamConfig | null
  setConfig(c: TeamConfig | null): void
  /** A stable id for this install (kept across teams). */
  memberId(): string
  usesApiKey(): boolean
  planUsage(): Promise<PlanUsageReading | undefined>
  /** Folder whose git branch and HackForge state to report (the event project). */
  projectDir(): string | undefined
  hackforge(dir: string): Promise<MemberStatus['hackforge'] | undefined>
  push(state: TeamState): void
  fetch?: typeof fetch
  port?: number
  /** Partner keys this laptop shares with the team (env name → value). */
  sharedSecrets?(): Record<string, string>
  /** Teammates' shared keys changed. */
  onTeamKeys?(keys: TeamKeys): void
  /** Conflicts involving this laptop that weren't there before. */
  onConflicts?(conflicts: Conflict[]): void
  /** A teammate handed work to the team. */
  onHandoff?(handoff: OpenHandoff): void
  /** Tokens used today on this laptop. */
  today?(): MemberStatus['today']
  /** This laptop just hit its usage limit. */
  onLimitReached?(resetsAt?: number): void
  crew?: CrewHook
}

/**
 * Seconds or ms → ms; 0–1 or 0–100 → percent. Only for rate-limit events, whose units aren't
 * documented. The usage call is documented as 0–100, so it doesn't go through toPct.
 */
const toMs = (t?: number) => (t === undefined ? undefined : t < 1e12 ? t * 1000 : t)
const toPct = (u?: number | null) => (u === undefined || u === null ? undefined : u <= 1 ? u * 100 : u)

export function lanUrls(port: number): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${port}`)
}

export class TeamService {
  private local: { focus?: string; sessions: MemberSession[]; cwd?: string } = { sessions: [] }
  private usage: PlanUsage = { source: 'unknown' }
  private members: MemberStatus[] = []
  private connected = false
  private error?: string
  private lastSync?: number
  private timer?: NodeJS.Timeout
  private usageTimer?: NodeJS.Timeout
  private kick?: NodeJS.Timeout
  private server: Server | null = null
  /** The sync in flight, if any (leave waits for it so its PUT can't land after the DELETE). */
  private inflight?: Promise<void>
  private scan?: { at: number; dir: string; result?: ChangeScan & { root: string } }
  private knownConflicts = new Set<string>()
  private seenHandoffs = new Set<string>()
  private synced = false
  private teamKeysJson = '{}'
  private lastAttempt = 0

  constructor(private readonly deps: TeamDeps) {}

  start() {
    // Hosting (re)starts inside sync(), so a port that was busy at launch is retried every round.
    this.timer = setInterval(() => {
      if (Date.now() - this.lastAttempt >= (this.deps.crew?.fast() ? FAST_SYNC_MS : SYNC_MS)) void this.sync()
    }, 1000)
    this.usageTimer = setInterval(() => void this.pollUsage(), USAGE_POLL_MS)
    void this.sync()
  }

  state(): TeamState {
    const c = this.deps.getConfig()
    return {
      config: c,
      connected: this.connected,
      error: this.error,
      lastSync: this.lastSync,
      // Crew payloads are sealed and large; the board reads crew state from its own channel.
      members: this.members.map(({ crew: _crew, ...m }) => m),
      hostUrls: c?.hosting ? lanUrls(this.port) : undefined,
      myUsage: this.myUsage(),
      conflicts: c ? findConflicts(this.members, c.memberId) : [],
      handoffs: c ? listHandoffs(this.members, Date.now()) : [],
    }
  }

  private myUsage(): PlanUsage {
    return this.deps.usesApiKey() ? { source: 'api-key', at: Date.now() } : this.usage
  }

  joinCode(): string | null {
    const c = this.deps.getConfig()
    return c ? makeJoinCode(c.relayUrl, c.token) : null
  }

  // ---------- team lifecycle ----------

  async create(opts: { name: string; host: boolean; relayUrl?: string }): Promise<TeamState> {
    const token = randomBytes(18).toString('base64url')
    let relayUrl = opts.relayUrl?.trim().replace(/\/+$/, '') ?? ''
    if (opts.host) {
      await this.host()
      relayUrl = lanUrls(this.port)[0] ?? `http://127.0.0.1:${this.port}`
    } else if (!/^https?:\/\//.test(relayUrl)) throw new Error('Enter the relay URL, e.g. https://our-relay.example.com')
    else await this.checkRelay(relayUrl)
    this.deps.setConfig({ relayUrl, token, memberId: this.deps.memberId(), memberName: opts.name.trim() || 'Me', hosting: opts.host })
    await this.sync()
    return this.state()
  }

  async join(code: string, name: string): Promise<TeamState> {
    const parsed = parseJoinCode(code)
    if (!parsed) throw new Error('That is not a valid join code (it starts with HT1.).')
    await this.checkRelay(parsed.relayUrl)
    this.deps.setConfig({ ...parsed, memberId: this.deps.memberId(), memberName: name.trim() || 'Me', hosting: false })
    await this.sync()
    return this.state()
  }

  async leave(): Promise<TeamState> {
    const c = this.deps.getConfig()
    // Clear the config first so no new sync starts, and let a running one finish before deleting.
    this.deps.setConfig(null)
    await this.inflight
    if (c) {
      await this.request(c, `/v1/team/members/${c.memberId}`, { method: 'DELETE' }).catch(() => {})
    }
    this.stopHosting()
    this.members = []
    this.connected = false
    this.error = undefined
    this.synced = false
    this.knownConflicts.clear()
    this.seenHandoffs.clear()
    this.publishTeamKeys({})
    this.deps.crew?.received([])
    this.deps.push(this.state())
    return this.state()
  }

  update(patch: { name?: string; focus?: string }): TeamState {
    const c = this.deps.getConfig()
    if (patch.name !== undefined && c) this.deps.setConfig({ ...c, memberName: patch.name.trim() || c.memberName })
    if (patch.focus !== undefined) this.local.focus = patch.focus.slice(0, 200)
    this.soon()
    return this.state()
  }

  // ---------- handoffs ----------

  /** Puts work on the team board (kept across restarts until it expires or is withdrawn). */
  offerHandoff(h: Handoff): TeamState {
    const c = this.deps.getConfig()
    if (!c) throw new Error('Join a team first: handoffs go through the team board.')
    const now = Date.now()
    const kept = (c.handoffs ?? []).filter((x) => now - x.createdAt < HANDOFF_TTL_MS)
    this.deps.setConfig({ ...c, handoffs: [h, ...kept].slice(0, MAX_HANDOFFS) })
    this.soon()
    return this.state()
  }

  withdrawHandoff(id: string): TeamState {
    const c = this.deps.getConfig()
    if (c) this.deps.setConfig({ ...c, handoffs: (c.handoffs ?? []).filter((h) => h.id !== id) })
    this.soon()
    return this.state()
  }

  markTaken(id: string) {
    const c = this.deps.getConfig()
    if (c && !(c.took ?? []).includes(id)) this.deps.setConfig({ ...c, took: [id, ...(c.took ?? [])].slice(0, 50) })
    this.soon()
  }

  findHandoff(id: string): OpenHandoff | undefined {
    return listHandoffs(this.members, Date.now()).find((h) => h.id === id)
  }

  // ---------- conflict radar ----------

  /** The project the radar watches: the event project, else the folder in front. */
  private radarDir() {
    return this.deps.projectDir() ?? this.local.cwd
  }

  private async changes(): Promise<ChangeScan | undefined> {
    const dir = this.radarDir()
    if (!dir) return undefined
    const now = Date.now()
    if (!this.scan || this.scan.dir !== dir || now - this.scan.at >= SCAN_MS) {
      this.scan = { at: now, dir, result: await scanChanges(dir).catch(() => undefined) }
    }
    const r = this.scan.result
    return r ? { repo: r.repo, base: r.base, files: r.files } : undefined
  }

  /**
   * A heads-up for Claude when it's about to edit a file teammates have also changed, or undefined.
   * Uses the latest scans, so it costs nothing per edit.
   */
  radarFor(absPath: string): { text: string; names: string[] } | undefined {
    const c = this.deps.getConfig()
    const mine = this.scan?.result
    if (!c || !mine) return undefined
    const rel = relTo(absPath, mine.root)
    if (!rel) return undefined
    const hits = this.members.flatMap((m) => {
      if (m.id === c.memberId || m.changes?.repo !== mine.repo) return []
      const f = m.changes.files.find((x) => x.path === rel)
      return f ? [{ m, f }] : []
    })
    if (!hits.length) return undefined
    const names = hits.map((h) => h.m.name)
    const who = hits.map(({ m, f }) => `${m.name} (${f.uncommitted ? 'uncommitted' : 'committed on their branch'}, ${describeRanges(f.ranges)})`).join('; ')
    return {
      names,
      text:
        `Heads-up from Harness's team radar: ${rel} is also being changed by ${who}. ` +
        `Keep your edit to this file small and focused (no reformatting, reordering or renaming there) so merging stays easy, and tell the user that ${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} working in it too.`,
    }
  }

  private afterSync(c: TeamConfig) {
    const conflicts = findConflicts(this.members, c.memberId).filter((x) => x.involvesMe)
    const keys = new Set(conflicts.map((x) => `${x.path}|${x.members.map((m) => m.id).join(',')}`))
    const fresh = conflicts.filter((x) => !this.knownConflicts.has(`${x.path}|${x.members.map((m) => m.id).join(',')}`))
    this.knownConflicts = keys
    if (fresh.length) this.deps.onConflicts?.(fresh)

    for (const h of listHandoffs(this.members, Date.now())) {
      if (this.seenHandoffs.has(h.id)) continue
      this.seenHandoffs.add(h.id)
      // Only news from after we joined; not what was already on the board.
      if (this.synced && h.fromId !== c.memberId && !h.takenBy) this.deps.onHandoff?.(h)
    }
    this.synced = true

    const team: TeamKeys = {}
    for (const m of this.members) {
      if (m.id === c.memberId || !m.secrets) continue
      for (const [k, v] of Object.entries(openSecrets(c.token, m.secrets) ?? {})) team[k] ??= { value: v, from: m.name }
    }
    this.publishTeamKeys(team)

    if (this.deps.crew) {
      const entries = this.members.flatMap((m) => {
        if (m.id === c.memberId || !m.crew) return []
        const payload = openCrew(c.token, m.crew)
        return payload ? [{ member: m, payload }] : []
      })
      this.deps.crew.received(entries)
    }
  }

  private publishTeamKeys(keys: TeamKeys) {
    const json = JSON.stringify(keys)
    if (json === this.teamKeysJson) return
    this.teamKeysJson = json
    this.deps.onTeamKeys?.(keys)
  }

  /** The renderer reports this machine's open sessions (it already has them all). */
  setLocal(local: { sessions: MemberSession[]; cwd?: string }) {
    const changed = JSON.stringify(local.sessions.map((s) => [s.status, s.activity, s.subagents])) !== JSON.stringify(this.local.sessions.map((s) => [s.status, s.activity, s.subagents]))
    this.local = { ...this.local, sessions: local.sessions.slice(0, 12), cwd: local.cwd }
    if (changed) this.soon()
  }

  // ---------- usage ----------

  onRateLimit(info: SDKRateLimitInfo) {
    const was = this.usage.status
    const resetsAt = toMs(info.resetsAt)
    const pct = toPct(info.utilization)
    const u: PlanUsage = { ...this.usage, source: 'plan', status: info.status, resetsAt, at: Date.now() }
    if (pct !== undefined && info.rateLimitType === 'five_hour') u.fiveHour = { pct, resetsAt }
    if (pct !== undefined && info.rateLimitType === 'seven_day') u.sevenDay = { pct, resetsAt }
    this.usage = u
    this.soon()
    if (!this.deps.getConfig()) this.deps.push(this.state())
    if (info.status === 'rejected' && was !== 'rejected') this.deps.onLimitReached?.(resetsAt)
  }

  private async pollUsage() {
    const r = await this.deps.planUsage()
    if (!r) return
    const win = (w?: { utilization: number | null; resetsAt: string | null } | null) => {
      // Already a percentage: 0.5 means half a percent, not 50 %.
      const pct = typeof w?.utilization === 'number' ? Math.max(0, Math.min(100, w.utilization)) : undefined
      return pct === undefined ? undefined : { pct, resetsAt: w?.resetsAt ? Date.parse(w.resetsAt) : undefined }
    }
    this.usage = {
      ...this.usage,
      source: r.available ? 'plan' : this.usage.source,
      subscription: r.subscription ?? undefined,
      fiveHour: win(r.fiveHour) ?? this.usage.fiveHour,
      sevenDay: win(r.sevenDay) ?? this.usage.sevenDay,
      at: Date.now(),
    }
    if (!this.deps.getConfig()) this.deps.push(this.state())
  }

  // ---------- sync ----------

  /** Something to tell the team: sync in a moment rather than at the next round. */
  nudge() {
    this.soon()
  }

  private soon() {
    clearTimeout(this.kick)
    this.kick = setTimeout(() => void this.sync(), 800)
  }

  private get port() {
    return this.deps.port ?? RELAY_PORT
  }

  private async buildStatus(c: TeamConfig): Promise<MemberStatus> {
    const dir = this.local.cwd ?? this.deps.projectDir()
    const branch = dir
      ? await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, timeout: 3000 }).then(
          (r) => r.stdout.trim() || undefined,
          () => undefined,
        )
      : undefined
    const project = this.deps.projectDir()
    const now = Date.now()
    const secrets = this.deps.sharedSecrets?.() ?? {}
    const crew = this.deps.crew?.payload()
    return {
      id: c.memberId,
      name: c.memberName,
      focus: this.local.focus,
      branch,
      sessions: this.local.sessions,
      usage: this.myUsage(),
      hackforge: project ? await this.deps.hackforge(project).catch(() => undefined) : undefined,
      changes: await this.changes(),
      handoffs: (c.handoffs ?? []).filter((h) => now - h.createdAt < HANDOFF_TTL_MS),
      took: c.took,
      secrets: Object.keys(secrets).length ? sealSecrets(c.token, secrets) : undefined,
      today: this.deps.today?.(),
      crew: crew ? sealCrew(c.token, crew) : undefined,
      updatedAt: now,
    }
  }

  sync(): Promise<void> {
    if (this.inflight) return this.inflight
    const c = this.deps.getConfig()
    if (!c) return Promise.resolve()
    this.lastAttempt = Date.now()
    this.inflight = this.syncWith(c).finally(() => (this.inflight = undefined))
    return this.inflight
  }

  private async syncWith(c: TeamConfig): Promise<void> {
    // Left (or switched team) while this was in flight: its answer no longer applies.
    const current = () => this.deps.getConfig()?.token === c.token
    try {
      if (c.hosting) await this.host()
      const me = await this.buildStatus(c)
      const res = (await this.request(c, `/v1/team/members/${c.memberId}`, { method: 'PUT', body: JSON.stringify(me) })) as { members?: unknown[] }
      if (!current()) return
      const now = Date.now()
      this.members = (res.members ?? []).map((m) => pickMember(m, now)).filter((m): m is MemberStatus => !!m)
      // Show my own status straight from here (no round-trip lag).
      this.members = [me, ...this.members.filter((m) => m.id !== me.id)]
      this.connected = true
      this.error = undefined
      this.lastSync = Date.now()
      this.afterSync(c)
    } catch (err) {
      if (!current()) return
      this.connected = false
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      if (current()) this.deps.push(this.state())
    }
  }

  private async request(c: TeamConfig, path: string, init: { method: string; body?: string }) {
    // The host talks to its own relay over loopback, whatever its LAN address is now.
    const base = c.hosting ? `http://127.0.0.1:${this.port}` : c.relayUrl
    const f = this.deps.fetch ?? fetch
    let res: Response
    try {
      res = await f(`${base}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(6000),
      })
    } catch {
      throw new Error(`Can't reach the team relay at ${base}`)
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(body.error ? `Relay: ${body.error}` : `Relay answered ${res.status}`)
    return body
  }

  // ---------- files (crew mode moves the project and mission results as git bundles) ----------

  private fileUrl(c: TeamConfig, id: string) {
    const base = c.hosting ? `http://127.0.0.1:${this.port}` : c.relayUrl
    return `${base}/v1/team/blobs/${encodeURIComponent(id)}`
  }

  /** Stores a file for the team on the relay, sealed with the team key. */
  async putFile(id: string, data: Buffer): Promise<void> {
    const c = this.deps.getConfig()
    if (!c) throw new Error('Not in a team.')
    const f = this.deps.fetch ?? fetch
    const res = await f(this.fileUrl(c, id), {
      method: 'PUT',
      body: new Uint8Array(sealBytes(c.token, data)),
      headers: { authorization: `Bearer ${c.token}`, 'content-type': 'application/octet-stream' },
      signal: AbortSignal.timeout(180_000),
    }).catch(() => null)
    if (!res) throw new Error("Can't reach the team server.")
    if (res.status === 404) throw new Error('This team server is too old for crew mode: redeploy it (Settings → Team server).')
    if (res.status === 413) throw new Error(`Too large for the team server (${Math.round(data.length / 1e6)} MB; the limit is 40 MB). Keep big files out of git.`)
    if (!res.ok) throw new Error(`Team server answered ${res.status}`)
  }

  /** A file teammates stored, opened with the team key; null when it isn't (or no longer) there. */
  async getFile(id: string): Promise<Buffer | null> {
    const c = this.deps.getConfig()
    if (!c) return null
    const f = this.deps.fetch ?? fetch
    const res = await f(this.fileUrl(c, id), { headers: { authorization: `Bearer ${c.token}` }, signal: AbortSignal.timeout(180_000) }).catch(() => null)
    if (!res?.ok) return null
    return openBytes(c.token, Buffer.from(await res.arrayBuffer()))
  }

  private async checkRelay(url: string) {
    const f = this.deps.fetch ?? fetch
    // Free hosting (Render) puts an idle relay to sleep and takes up to a minute to wake it; a wrong address fails at once anyway.
    const r = await f(`${url}/health`, { signal: AbortSignal.timeout(75_000) }).catch(() => null)
    const body = r?.ok ? ((await r.json().catch(() => ({}))) as { service?: string }) : null
    if (body?.service !== 'harness-team-relay') throw new Error(`No Harness team relay answers at ${url}`)
  }

  // ---------- hosting ----------

  private host(): Promise<void> {
    if (this.server) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const server = createServer(createRelay())
      server.once('error', (e: NodeJS.ErrnoException) =>
        reject(
          new Error(
            e.code === 'EADDRINUSE'
              ? `Couldn't host the team relay: port ${this.port} is already in use (another Harness or app?). Quit it, or leave and use a relay server.`
              : `Couldn't host the team relay: ${e.message}`,
          ),
        ),
      )
      server.listen(this.port, '0.0.0.0', () => {
        this.server = server
        resolve()
      })
    })
  }

  private stopHosting() {
    this.server?.close()
    this.server = null
  }

  dispose() {
    clearInterval(this.timer)
    clearInterval(this.usageTimer)
    clearTimeout(this.kick)
    this.stopHosting()
  }
}

export const newMemberId = () => randomUUID().replace(/-/g, '').slice(0, 16)
