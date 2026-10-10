import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { networkInterfaces } from 'node:os'
import { promisify } from 'node:util'
import type { SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import { makeJoinCode, parseJoinCode, pickMember, type MemberSession, type MemberStatus, type PlanUsage, type TeamConfig, type TeamState } from '@shared/team'
import { createRelay } from '../../../relay/relay.mjs'
import type { PlanUsageReading } from '../agent/AgentService'

const run = promisify(execFile)
export const RELAY_PORT = 47830
const SYNC_MS = 5000
const USAGE_POLL_MS = 120_000

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
}

/** Seconds or ms → ms; 0–1 or 0–100 → percent. The CLI's units aren't documented, so accept both. */
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

  constructor(private readonly deps: TeamDeps) {}

  start() {
    const c = this.deps.getConfig()
    if (c?.hosting) void this.host().catch((e) => (this.error = `Couldn't host the relay: ${e instanceof Error ? e.message : e}`))
    this.timer = setInterval(() => void this.sync(), SYNC_MS)
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
      members: this.members,
      hostUrls: c?.hosting ? lanUrls(this.port) : undefined,
      myUsage: this.myUsage(),
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

  /** The renderer reports this machine's open sessions (it already has them all). */
  setLocal(local: { sessions: MemberSession[]; cwd?: string }) {
    const changed = JSON.stringify(local.sessions.map((s) => [s.status, s.activity, s.subagents])) !== JSON.stringify(this.local.sessions.map((s) => [s.status, s.activity, s.subagents]))
    this.local = { ...this.local, sessions: local.sessions.slice(0, 12), cwd: local.cwd }
    if (changed) this.soon()
  }

  // ---------- usage ----------

  onRateLimit(info: SDKRateLimitInfo) {
    const resetsAt = toMs(info.resetsAt)
    const pct = toPct(info.utilization)
    const u: PlanUsage = { ...this.usage, source: 'plan', status: info.status, resetsAt, at: Date.now() }
    if (pct !== undefined && info.rateLimitType === 'five_hour') u.fiveHour = { pct, resetsAt }
    if (pct !== undefined && info.rateLimitType === 'seven_day') u.sevenDay = { pct, resetsAt }
    this.usage = u
    this.soon()
    if (!this.deps.getConfig()) this.deps.push(this.state())
  }

  private async pollUsage() {
    const r = await this.deps.planUsage()
    if (!r) return
    const win = (w?: { utilization: number | null; resetsAt: string | null } | null) => {
      const pct = toPct(w?.utilization)
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
    return {
      id: c.memberId,
      name: c.memberName,
      focus: this.local.focus,
      branch,
      sessions: this.local.sessions,
      usage: this.myUsage(),
      hackforge: project ? await this.deps.hackforge(project).catch(() => undefined) : undefined,
      updatedAt: Date.now(),
    }
  }

  sync(): Promise<void> {
    if (this.inflight) return this.inflight
    const c = this.deps.getConfig()
    if (!c) return Promise.resolve()
    this.inflight = this.syncWith(c).finally(() => (this.inflight = undefined))
    return this.inflight
  }

  private async syncWith(c: TeamConfig): Promise<void> {
    // Left (or switched team) while this was in flight: its answer no longer applies.
    const current = () => this.deps.getConfig()?.token === c.token
    try {
      const me = await this.buildStatus(c)
      const res = (await this.request(c, `/v1/team/members/${c.memberId}`, { method: 'PUT', body: JSON.stringify(me) })) as { members?: unknown[] }
      if (!current()) return
      this.members = (res.members ?? []).map(pickMember).filter((m): m is MemberStatus => !!m)
      // Show my own status straight from here (no round-trip lag).
      this.members = [me, ...this.members.filter((m) => m.id !== me.id)]
      this.connected = true
      this.error = undefined
      this.lastSync = Date.now()
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

  private async checkRelay(url: string) {
    const f = this.deps.fetch ?? fetch
    const r = await f(`${url}/health`, { signal: AbortSignal.timeout(6000) }).catch(() => null)
    const body = r?.ok ? ((await r.json().catch(() => ({}))) as { service?: string }) : null
    if (body?.service !== 'harness-team-relay') throw new Error(`No Harness team relay answers at ${url}`)
  }

  // ---------- hosting ----------

  private host(): Promise<void> {
    if (this.server) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const server = createServer(createRelay())
      server.once('error', reject)
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
