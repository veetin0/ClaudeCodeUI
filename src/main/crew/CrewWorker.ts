import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import {
  ASK_TIMEOUT_MS,
  CREW_ALLOW,
  CREW_NUDGE,
  CREW_PROTOCOL,
  crewBranch,
  crewMessageTurn,
  crewSystemPrompt,
  describeToolCall,
  FINISHED_TTL_MS,
  fitPayload,
  isFinal,
  MESSAGE_TTL_MS,
  MAX_OUTBOX,
  missionMessage,
  pickCrewPayload,
  slug,
  type CrewAsk,
  type CrewMessage,
  type CrewPayload,
  type CrewRepo,
  type DriverPayload,
  type Mission,
  type MissionProgress,
  type MissionState,
} from '@shared/crew'
import type { HarnessEvent } from '@shared/events'
import type { MemberSession, MemberStatus } from '@shared/team'
import { describeRanges } from '@shared/team'
import type { AgentService, SessionExtras } from '../agent/AgentService'
import { createCrewServer, type CrewMissionTools } from './crewTools'
import * as gitOps from './git'

/** What the terminal (or the app) shows as the crew member's log. */
export type CrewWorkerEvent =
  | { kind: 'driver'; name: string }
  | { kind: 'repo'; state: 'downloading' | 'ready' | 'updated' | 'problem'; text: string }
  | { kind: 'mission'; mission: Mission; state: MissionState | 'starting'; progress?: MissionProgress }
  | { kind: 'activity'; mission: string; text: string }
  | { kind: 'message'; direction: 'in' | 'out'; message: CrewMessage; toName?: string }
  | { kind: 'ask'; ask: CrewAsk }
  | { kind: 'answer'; id: string; allow: boolean; by: string }
  | { kind: 'note'; tone: 'info' | 'warn'; text: string }

export interface CrewWorkerDeps {
  /** This member, while in a team. */
  me(): { id: string; name: string } | null
  agents: Pick<AgentService, 'start' | 'send' | 'close' | 'respondPermission' | 'interrupt'>
  bus: { subscribe(fn: (e: HarnessEvent) => void): () => void }
  /** Folder the lead's project is copied into. */
  home: string
  app: 'cli' | 'harness'
  version: string
  /** Asks the team to sync now. */
  nudge(): void
  /** Files on the team server (the project, mission results), sealed with the team key. */
  files: { get(id: string): Promise<Buffer | null>; put(id: string, data: Buffer): Promise<void> }
  /** Missions and seen messages, kept across restarts. */
  stateFile?: string
  /** HackForge's builder rules, when the clone is a HackForge project. */
  builderRules?(dir: string): string | undefined
  /** Something that stops missions from starting (e.g. not signed in to Claude). */
  preflight?(): Promise<string | undefined>
  /** Extra per-mission session setup (dev tools, partner keys). */
  sessionExtras?(dir: string): SessionExtras
  onEvent?(e: CrewWorkerEvent): void
  /** The mission session, for the team board. */
  onSession?(s: MemberSession | undefined, dir?: string): void
  git?: typeof gitOps
  now?(): number
}

interface Record_ {
  m: Mission
  p: MissionProgress
  /** Member id of the driver who sent it. */
  driver: string
  /** Attempts to get the project version it starts from. */
  tries?: number
}

interface Running {
  id: string
  sessionId: string
  start: string
  nudged: boolean
  finishing: boolean
  report?: { status: 'done' | 'blocked' | 'failed'; summary: string }
  lastText?: string
  lastError?: string
  unsub: () => void
  status: MemberSession['status']
}

interface Saved {
  missions: Record_[]
  seen: string[]
  known: string[]
}

/** What came of sending a mission's work to the lead. */
interface SentWork {
  commit?: string
  commits: number
  files: string[]
  bundle?: string
  sendError?: string
}

/** A peer's status plus its crew payload, as the `team` tool reports it. */
interface Peer {
  member: MemberStatus
  payload: CrewPayload | DriverPayload
}

/**
 * The crew side of crew mode: watches the driver's status for missions addressed to this laptop,
 * keeps a clone of the driver's project, runs one mission at a time in a fresh Claude session on
 * its own branch, pushes the branch and reports back. Permission questions go to the driver;
 * messages between Claudes go through the team sync.
 */
export class CrewWorker {
  private missions = new Map<string, Record_>()
  /** Mission ids ever received (so one the driver still lists isn't run twice). */
  private known = new Set<string>()
  private seen = new Set<string>()
  private outbox: CrewMessage[] = []
  private inbox: CrewMessage[] = []
  private asks = new Map<string, { ask: CrewAsk; sessionId: string; timer: NodeJS.Timeout }>()
  private answered = new Set<string>()
  private peers: Peer[] = []
  private driverId?: string
  private repo?: { base: string; name: string; dir: string; head: string; bundle: string }
  private repoProblem?: string
  private repoBusy?: Promise<void>
  private leadRepo?: CrewRepo
  private repoRetryAt = 0
  private problem?: string
  private preflightRetryAt = 0
  private running?: Running
  private starting = false
  private waiter?: (m: CrewMessage[]) => void
  private limitedUntil?: number
  private readonly startedAt: number
  accepting = true
  private closed = false

  constructor(private readonly deps: CrewWorkerDeps) {
    this.startedAt = this.now()
    this.load()
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  private get git() {
    return this.deps.git ?? gitOps
  }

  private emit(e: CrewWorkerEvent) {
    this.deps.onEvent?.(e)
  }

  // ---------- team sync ----------

  /** Sync faster while there's mission traffic. */
  fast(): boolean {
    return !!this.running || this.starting || this.asks.size > 0 || [...this.missions.values()].some((r) => r.p.state === 'queued')
  }

  payload(): CrewPayload | undefined {
    if (this.closed) return undefined
    const now = this.now()
    const problem = this.problem ?? this.repoProblem
    return fitPayload<CrewPayload>({
      role: 'crew',
      v: CREW_PROTOCOL,
      app: this.deps.app,
      version: this.deps.version,
      // Without the project yet it still takes missions: they wait for the project to arrive.
      accepting: this.accepting && !problem && !(this.limitedUntil && this.limitedUntil > now),
      problem,
      repo: this.repo ? { dir: this.repo.dir, head: this.repo.head } : undefined,
      missions: [...this.missions.values()].map((r) => r.p).filter((p) => !isFinal(p.state) || now - (p.endedAt ?? now) < FINISHED_TTL_MS),
      asks: [...this.asks.values()].map((a) => a.ask),
      outbox: this.outbox.filter((m) => now - m.at < MESSAGE_TTL_MS),
    })
  }

  received(entries: { member: MemberStatus; payload: unknown }[]) {
    const me = this.deps.me()
    if (!me || this.closed) return
    this.peers = entries.flatMap((e) => {
      const payload = pickCrewPayload(e.payload)
      return payload ? [{ member: e.member, payload }] : []
    })
    const drivers = this.peers.filter((p): p is Peer & { payload: DriverPayload } => p.payload.role === 'driver')
    // The driver who has work for me, else the one sharing a project.
    const lead = drivers.find((d) => d.payload.missions.some((m) => m.to === me.id)) ?? drivers.find((d) => d.payload.repo) ?? drivers[0]
    if (lead && lead.member.id !== this.driverId) {
      this.driverId = lead.member.id
      this.emit({ kind: 'driver', name: lead.member.name })
    }
    this.leadRepo = lead?.payload.repo
    if (lead?.payload.repo) void this.ensureRepo(lead.payload.repo)

    let changed = false
    for (const d of drivers) {
      for (const m of d.payload.missions) {
        if (m.to !== me.id || this.known.has(m.id)) continue
        this.known.add(m.id)
        this.missions.set(m.id, { m, p: { id: m.id, title: m.title, state: 'queued', branch: m.branch }, driver: d.member.id })
        this.emit({ kind: 'mission', mission: m, state: 'queued' })
        changed = true
      }
      for (const id of d.payload.cancel) {
        const r = this.missions.get(id)
        if (r && r.driver === d.member.id && !isFinal(r.p.state)) {
          void this.stop(id, `Stopped by ${d.member.name}.`)
          changed = true
        }
      }
      for (const a of d.payload.answers) if (this.asks.has(a.id)) this.answer(a.id, a.allow, d.member.name, a.always, a.note)
    }
    for (const p of this.peers) {
      for (const msg of p.payload.outbox) {
        if (this.seen.has(msg.id) || msg.from === me.id) continue
        if (msg.to !== me.id && msg.to !== '*') continue
        this.seen.add(msg.id)
        // Broadcasts from before this laptop joined aren't news.
        if (msg.to === '*' && msg.at < this.startedAt - 60_000) continue
        this.deliver(msg)
        changed = true
      }
    }
    if (changed) {
      this.save()
      this.deps.nudge()
    }
    this.pump()
  }

  private name(id: string): string {
    return this.peers.find((p) => p.member.id === id)?.member.name ?? 'teammate'
  }

  // ---------- the project ----------

  /** Gets (or updates) this laptop's copy of the lead's project from the team server. */
  private async ensureRepo(repo: CrewRepo): Promise<void> {
    if (this.repo?.bundle === repo.bundle) {
      this.repo.base = repo.base
      return
    }
    if (this.repoBusy) return this.repoBusy
    if (this.repoProblem && this.now() < this.repoRetryAt) return
    const me = this.deps.me()
    if (!me) return
    this.repoBusy = this.syncRepo(repo, me).finally(() => {
      this.repoBusy = undefined
      this.deps.nudge()
      this.pump()
    })
    return this.repoBusy
  }

  private async syncRepo(repo: CrewRepo, me: { id: string; name: string }) {
    const first = !this.repo
    if (first) this.emit({ kind: 'repo', state: 'downloading', text: `Getting ${repo.name} from the team server` })
    const file = join(this.deps.home, '.bundles', `${repo.bundle}.bundle`)
    try {
      const data = await this.deps.files.get(repo.bundle)
      if (!data) throw new Error('The project isn’t on the team server (it may have expired); waiting for the lead to share it again')
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, data)
      const dir = this.repo?.dir ?? join(this.deps.home, repo.name)
      await this.git.syncFromBundle(dir, file, repo.base)
      if (first) await this.git.ensureIdentity(dir, me.name, `${slug(me.name)}@users.noreply.github.com`)
      this.repo = { base: repo.base, name: repo.name, dir, head: repo.head, bundle: repo.bundle }
      this.repoProblem = undefined
      this.emit({ kind: 'repo', state: first ? 'ready' : 'updated', text: dir })
    } catch (err) {
      this.repoProblem = `Couldn't get the project: ${err instanceof Error ? err.message : String(err)}`
      this.repoRetryAt = this.now() + 30_000
      this.emit({ kind: 'repo', state: 'problem', text: this.repoProblem })
    } finally {
      rmSync(file, { force: true })
    }
  }

  // ---------- missions ----------

  private pump() {
    if (this.running || this.starting || this.closed || !this.accepting || !this.repo || this.now() < this.preflightRetryAt) return
    const next = [...this.missions.values()].find((r) => r.p.state === 'queued')
    if (next) void this.run(next)
  }

  private update(r: Record_, patch: Partial<MissionProgress>) {
    r.p = { ...r.p, ...patch }
    this.deps.nudge()
  }

  private async run(r: Record_) {
    const me = this.deps.me()
    const repo = this.repo
    if (!me || !repo) return
    this.starting = true
    try {
      if (this.limitedUntil && this.limitedUntil > this.now()) return this.limitQueued()
      const was = this.problem
      this.problem = await this.deps.preflight?.()
      if (this.problem) {
        this.preflightRetryAt = this.now() + 30_000
        if (this.problem !== was) this.emit({ kind: 'note', tone: 'warn', text: this.problem })
        this.deps.nudge()
        return
      }
      // The lead shares a new copy with each mission; wait for it rather than start from an old one.
      if (r.m.at && !(await this.git.hasCommit(repo.dir, r.m.at))) {
        if (this.leadRepo) await this.ensureRepo(this.leadRepo)
        if (!(await this.git.hasCommit(repo.dir, r.m.at))) {
          r.tries = (r.tries ?? 0) + 1
          if (r.tries < 4) {
            this.preflightRetryAt = this.now() + 20_000
            return
          }
          this.finish(r, 'failed', `This laptop never got the version of the project this mission starts from (${r.m.at.slice(0, 7)}).`, true)
          return
        }
      }
      this.emit({ kind: 'mission', mission: r.m, state: 'starting' })
      this.update(r, { state: 'working', startedAt: this.now(), activity: 'Setting up the branch' })
      let start: string
      try {
        start = await this.git.startMissionBranch(repo.dir, r.m.from ?? repo.base, r.m.branch)
      } catch (err) {
        this.finish(r, 'failed', `Couldn't set up branch ${r.m.branch}: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      const extras = this.deps.sessionExtras?.(repo.dir) ?? {}
      const crewNames = this.peers.filter((p) => p.payload.role === 'crew').map((p) => p.member.name)
      const summary = this.deps.agents.start({ cwd: repo.dir, model: r.m.model, permissionMode: 'acceptEdits' }, undefined, {
        ...extras,
        append: [
          extras.append,
          crewSystemPrompt({
            me: me.name,
            driver: this.name(r.driver),
            crew: [me.name, ...crewNames],
            mission: r.m,
            hackforge: !!this.deps.builderRules?.(repo.dir),
            builderRules: this.deps.builderRules?.(repo.dir),
          }),
        ]
          .filter(Boolean)
          .join('\n\n'),
        mcpServers: { ...extras.mcpServers, crew: createCrewServer(this.tools(r)) },
        allow: [...CREW_ALLOW, ...(extras.allow ?? []), ...(r.m.allow ?? [])],
      })
      const run: Running = { id: r.m.id, sessionId: summary.id, start, nudged: false, finishing: false, unsub: () => {}, status: 'running' }
      run.unsub = this.deps.bus.subscribe((e) => {
        if (e.sessionId === run.sessionId) this.onSessionEvent(r, run, e)
      })
      this.running = run
      this.update(r, { activity: 'Reading the brief' })
      this.session(r, run)
      this.deps.agents.send(summary.id, missionMessage(r.m, this.inbox.splice(0)))
    } finally {
      this.starting = false
      this.save()
    }
  }

  private session(r: Record_, run?: Running) {
    this.deps.onSession?.(
      run ? { title: r.m.title, project: this.repo?.name ?? '', status: run.status, activity: r.p.activity, subagents: 0 } : undefined,
      this.repo?.dir,
    )
  }

  private onSessionEvent(r: Record_, run: Running, e: HarnessEvent) {
    if (this.running !== run) return
    switch (e.type) {
      case 'tool.start': {
        const text = describeToolCall(e.name, e.input, this.repo?.dir ?? '')
        this.update(r, { activity: text })
        if (e.agentId === null) this.emit({ kind: 'activity', mission: r.m.id, text })
        this.session(r, run)
        break
      }
      case 'assistant.text':
        if (e.agentId === null && e.text.trim()) run.lastText = e.text.trim()
        break
      case 'status':
        run.status = e.status
        this.session(r, run)
        if (e.status === 'closed' && !run.finishing) void this.finalize(r, run, 'failed', run.lastError ?? 'The Claude process ended unexpectedly.')
        break
      case 'error':
        run.lastError = e.message.split('\n')[0].slice(0, 500)
        break
      case 'permission.request':
        this.onAsk(r, run, e)
        break
      case 'turn.end':
        if (e.internal) break
        this.update(r, {
          costUsd: e.costUsd || r.p.costUsd,
          tokens: e.modelUsage ? Object.values(e.modelUsage).reduce((n, u) => n + u.input + u.output + u.cacheRead + u.cacheWrite, 0) : r.p.tokens,
        })
        this.onTurnEnd(r, run, e)
        break
    }
  }

  private onTurnEnd(r: Record_, run: Running, e: Extract<HarnessEvent, { type: 'turn.end' }>) {
    if (run.finishing) return
    if (run.report) return void this.finalize(r, run, run.report.status, run.report.summary)
    const limited =
      (this.limitedUntil && this.limitedUntil > this.now()) || (e.isError && /usage limit|rate limit|limit reached|out of extra usage/i.test(e.result))
    if (limited)
      return void this.finalize(r, run, 'limited', `The Claude plan's usage limit ran out mid-mission. Work so far is on the branch.`, { auto: true })
    if (!run.nudged) {
      run.nudged = true
      this.deps.agents.send(run.sessionId, CREW_NUDGE, undefined, 'crew')
      return
    }
    void this.finalize(r, run, e.isError ? 'failed' : 'done', (e.isError ? e.result : run.lastText) || 'Ended without a report.', { auto: true })
  }

  private async finalize(r: Record_, run: Running, state: MissionState, summary: string, o: { auto?: boolean } = {}) {
    if (run.finishing) return
    run.finishing = true
    this.update(r, { activity: 'Sending the work to the lead' })
    for (const [id, a] of this.asks) if (a.sessionId === run.sessionId) this.answer(id, false, 'harness-crew', false, 'The mission ended.')
    this.waiter?.([])
    this.waiter = undefined
    run.unsub()
    this.deps.agents.close(run.sessionId)
    // The report goes out with the work, so the lead can merge it straight away.
    const res = this.repo ? await this.sendWork(r, run) : undefined
    if (this.running === run) this.running = undefined
    this.finish(r, state, summary, o.auto, res)
    this.session(r)
    if (state === 'limited') this.limitQueued()
    this.save()
    this.deps.nudge()
    this.pump()
  }

  /** Commits what's left, bundles the mission's commits and puts them on the team server for the lead. */
  private async sendWork(r: Record_, run: Running): Promise<SentWork> {
    const me = this.deps.me()
    const file = join(this.deps.home, '.bundles', `${r.m.id}.bundle`)
    try {
      mkdirSync(dirname(file), { recursive: true })
      const res = await this.git.finishMissionBranch(this.repo!.dir, run.start, r.m.branch, `crew(${me?.name ?? 'crew'}): ${r.m.title} [${r.m.id}]`, file)
      const out: SentWork = { commit: res.commit, commits: res.commits, files: res.files, sendError: res.error }
      if (res.bundle) {
        const id = `r-${r.m.id}-${randomUUID().slice(0, 8)}`
        await this.deps.files.put(id, readFileSync(res.bundle))
        out.bundle = id
      }
      return out
    } catch (err) {
      return { commits: 0, files: [], sendError: err instanceof Error ? err.message : String(err) }
    } finally {
      rmSync(file, { force: true })
    }
  }

  private finish(r: Record_, state: MissionState, summary: string, auto?: boolean, res?: SentWork) {
    this.update(r, {
      state,
      summary: summary.slice(0, 6000),
      auto: auto || undefined,
      endedAt: this.now(),
      activity: undefined,
      resetsAt: state === 'limited' ? this.limitedUntil : undefined,
      ...(res ? { commit: res.commit, commits: res.commits, files: res.files, bundle: res.bundle, sendError: res.sendError } : {}),
    })
    this.emit({ kind: 'mission', mission: r.m, state, progress: r.p })
    this.save()
  }

  /** Out of usage: missions still waiting here go back to the driver to hand to someone else. */
  private limitQueued() {
    for (const r of this.missions.values()) if (r.p.state === 'queued') this.finish(r, 'limited', 'Usage limit reached on this laptop before it started.', true)
  }

  async stop(id: string, why: string) {
    const r = this.missions.get(id)
    if (!r || isFinal(r.p.state)) return
    if (this.running?.id === id) {
      const run = this.running
      await this.deps.agents.interrupt(run.sessionId).catch(() => {})
      await this.finalize(r, run, 'stopped', why, { auto: true })
    } else this.finish(r, 'stopped', why, true)
  }

  /** The Claude plan's rate-limit reports (from every session on this laptop). */
  onRateLimit(info: SDKRateLimitInfo) {
    if (info.status === 'rejected') {
      const t = info.resetsAt
      this.limitedUntil = t ? (t < 1e12 ? t * 1000 : t) : this.now() + 3600_000
    } else if (info.status === 'allowed') this.limitedUntil = undefined
  }

  // ---------- permission questions ----------

  private onAsk(r: Record_, run: Running, e: Extract<HarnessEvent, { type: 'permission.request' }>) {
    if (e.toolName === 'AskUserQuestion') {
      this.deps.agents.respondPermission(run.sessionId, e.requestId, {
        behavior: 'deny',
        message: 'Nobody is at this computer. Decide yourself, or ask the lead with mcp__crew__message and wait for the answer with mcp__crew__wait.',
      })
      return
    }
    if (e.toolName === 'ExitPlanMode') {
      this.deps.agents.respondPermission(run.sessionId, e.requestId, { behavior: 'allow' })
      return
    }
    const input = e.input
    // Pushing is harness-crew's job (after the report), whoever asked Claude to do it.
    if (e.toolName === 'Bash' && typeof input.command === 'string' && /\bgit\s+push\b/.test(input.command)) {
      this.deps.agents.respondPermission(run.sessionId, e.requestId, {
        behavior: 'deny',
        message: `Don't push: harness-crew pushes ${r.m.branch} for you as soon as you call mcp__crew__report. Commit, then report.`,
      })
      return
    }
    const detail =
      typeof input.command === 'string'
        ? input.command
        : typeof input.file_path === 'string'
          ? input.file_path
          : typeof input.url === 'string'
            ? input.url
            : (e.title ?? JSON.stringify(input).slice(0, 200))
    const ask: CrewAsk = { id: e.requestId, mission: r.m.id, tool: e.toolName, summary: `${e.toolName}: ${String(detail).slice(0, 500)}`, at: this.now() }
    const timer = setTimeout(
      () => this.answer(ask.id, false, 'timeout', false, 'Nobody approved this in 10 minutes. Find another way, or explain what you need in your report.'),
      ASK_TIMEOUT_MS,
    )
    this.asks.set(ask.id, { ask, sessionId: run.sessionId, timer })
    this.update(r, { activity: `Waiting for approval: ${ask.summary.slice(0, 80)}` })
    this.emit({ kind: 'ask', ask })
  }

  /** Answers a permission question (from the driver, this terminal, or a timeout). */
  answer(id: string, allow: boolean, by: string, always?: boolean, note?: string) {
    const a = this.asks.get(id)
    if (!a || this.answered.has(id)) return
    this.answered.add(id)
    clearTimeout(a.timer)
    this.asks.delete(id)
    this.deps.agents.respondPermission(
      a.sessionId,
      id,
      allow
        ? { behavior: 'allow', always }
        : { behavior: 'deny', message: note ?? `${by} didn't approve this. Find another way, or explain what you need in your report.` },
    )
    this.emit({ kind: 'answer', id, allow, by })
    this.deps.nudge()
  }

  pendingAsks(): CrewAsk[] {
    return [...this.asks.values()].map((a) => a.ask)
  }

  // ---------- messages ----------

  private deliver(msg: CrewMessage) {
    this.emit({ kind: 'message', direction: 'in', message: msg })
    if (this.running && !this.running.finishing && this.waiter) {
      this.waiter([msg])
      this.waiter = undefined
    } else if (this.running && !this.running.finishing) this.deps.agents.send(this.running.sessionId, crewMessageTurn(msg), undefined, 'crew')
    else this.inbox.push(msg)
  }

  private send(to: string, text: string, mission?: string): CrewMessage {
    const me = this.deps.me()
    if (!me) throw new Error('Not in a team.')
    const msg: CrewMessage = { id: `c${randomUUID().replace(/-/g, '').slice(0, 15)}`, from: me.id, fromName: me.name, to, text, mission, at: this.now() }
    this.outbox = [...this.outbox.filter((m) => this.now() - m.at < MESSAGE_TTL_MS), msg].slice(-MAX_OUTBOX)
    this.emit({ kind: 'message', direction: 'out', message: msg, toName: to === '*' ? 'everyone' : this.name(to) })
    this.deps.nudge()
    return msg
  }

  private resolveTo(to: string): string {
    const t = to.trim().toLowerCase()
    if (['lead', 'driver', 'leader'].includes(t)) {
      if (!this.driverId) throw new Error('No lead is online right now.')
      return this.driverId
    }
    if (['all', 'everyone', '*', 'team'].includes(t)) return '*'
    const hit = this.peers.find((p) => p.member.name.toLowerCase() === t) ?? this.peers.find((p) => p.member.name.toLowerCase().startsWith(t))
    if (!hit)
      throw new Error(
        `No teammate called "${to}". Use "lead", "all", or one of: ${this.peers.map((p) => p.member.name).join(', ') || 'nobody else is online'}.`,
      )
    return hit.member.id
  }

  private tools(r: Record_): CrewMissionTools {
    return {
      report: (status, summary) => {
        if (this.running?.id !== r.m.id) throw new Error('This mission has already ended.')
        this.running.report = { status, summary }
        return 'Recorded. harness-crew pushes your branch and tells the lead when you end your turn. End your turn now.'
      },
      message: (to, text) => {
        const id = this.resolveTo(to)
        this.send(id, text, r.m.id)
        return `Sent to ${id === '*' ? 'everyone' : this.name(id)}. Replies arrive as "[crew]" turns, or call mcp__crew__wait to wait for one.`
      },
      team: () => this.teamText(),
      wait: (timeoutSec, signal) =>
        new Promise<string>((resolve) => {
          const done = (msgs: CrewMessage[]) => {
            clearTimeout(timer)
            resolve(msgs.length ? msgs.map((m) => `${m.fromName}: ${m.text}`).join('\n\n') : 'No messages yet. Carry on with what you can, or wait again.')
          }
          const timer = setTimeout(() => {
            if (this.waiter === done) this.waiter = undefined
            done([])
          }, timeoutSec * 1000)
          signal?.addEventListener('abort', () => done([]), { once: true })
          const pending = this.inbox.splice(0)
          if (pending.length) return done(pending)
          this.waiter = done
        }),
    }
  }

  private teamText(): string {
    const lines: string[] = []
    const lead = this.peers.find((p) => p.member.id === this.driverId)
    if (lead) lines.push(`Lead: ${lead.member.name}${lead.member.focus ? ` (${lead.member.focus})` : ''}`)
    for (const p of this.peers) {
      if (p.payload.role !== 'crew') continue
      const cur = p.payload.missions.find((m) => m.state === 'working')
      const recent = p.payload.missions.filter((m) => m.state === 'done').slice(-3)
      lines.push(
        `- ${p.member.name}: ${cur ? `working on ${cur.id} "${cur.title}" (branch ${cur.branch})${cur.activity ? `, now: ${cur.activity}` : ''}` : 'idle'}` +
          (recent.length ? `; finished ${recent.map((m) => `"${m.title}" (${m.branch})`).join(', ')}` : ''),
      )
    }
    for (const p of this.peers) {
      const files = p.member.changes?.files ?? []
      if (files.length)
        lines.push(
          `  ${p.member.name} has changed: ${files
            .slice(0, 25)
            .map((f) => `${f.path} (${describeRanges(f.ranges)})`)
            .join(', ')}${files.length > 25 ? '…' : ''}`,
        )
    }
    return lines.length ? lines.join('\n') : 'Nobody else is online.'
  }

  // ---------- lifecycle ----------

  /** Stops taking missions; a running one is stopped and its work pushed. */
  async shutdown(why = 'harness-crew was closed on this laptop.') {
    this.accepting = false
    for (const r of this.missions.values()) if (r.p.state === 'queued') this.finish(r, 'stopped', why, true)
    if (this.running) await this.stop(this.running.id, why)
    this.save()
    this.deps.nudge()
  }

  /** After shutdown and a last sync: nothing more is sent. */
  close() {
    this.closed = true
    for (const a of this.asks.values()) clearTimeout(a.timer)
  }

  status() {
    const problem = this.problem ?? this.repoProblem
    return {
      driver: this.driverId ? this.name(this.driverId) : undefined,
      repo: this.repo,
      problem,
      running: this.running ? this.missions.get(this.running.id)?.m : undefined,
      queued: [...this.missions.values()].filter((r) => r.p.state === 'queued').length,
      done: [...this.missions.values()].filter((r) => isFinal(r.p.state)).length,
    }
  }

  private load() {
    if (!this.deps.stateFile) return
    try {
      const s = JSON.parse(readFileSync(this.deps.stateFile, 'utf8')) as Saved
      for (const r of s.missions ?? []) {
        // Cut off by a restart: its session is gone. Report it so the driver can hand it on.
        if (!isFinal(r.p.state) && r.p.state !== 'queued')
          r.p = { ...r.p, state: 'stopped', activity: undefined, endedAt: this.now(), summary: 'harness-crew restarted during this mission.', auto: true }
        this.missions.set(r.m.id, r)
      }
      for (const id of s.seen ?? []) this.seen.add(id)
      for (const id of s.known ?? []) this.known.add(id)
    } catch {
      // first run
    }
  }

  private save() {
    if (!this.deps.stateFile) return
    const missions = [...this.missions.values()].slice(-40)
    const saved: Saved = { missions, seen: [...this.seen].slice(-500), known: [...this.known].slice(-500) }
    try {
      mkdirSync(dirname(this.deps.stateFile), { recursive: true })
      writeFileSync(this.deps.stateFile, JSON.stringify(saved))
    } catch {
      // not fatal: the driver still has the missions
    }
  }
}
