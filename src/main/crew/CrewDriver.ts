import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  CREW_PROTOCOL,
  crewBranch,
  crewMembers,
  crewMessageTurn,
  canTake,
  fitPayload,
  isFinal,
  MESSAGE_TTL_MS,
  MAX_OUTBOX,
  missionReportText,
  pickAssignee,
  pickCrewPayload,
  type CrewAnswer,
  type CrewAskView,
  type CrewMemberView,
  type CrewMessage,
  type CrewPayload,
  type CrewRepo,
  type CrewState,
  type DriverPayload,
  type Mission,
  type MissionProgress,
  type MissionState,
  type MissionView,
} from '@shared/crew'
import { headroom, type MemberStatus, type PlanUsage } from '@shared/team'
import type { CrewDriverTools } from './crewTools'
import { branchHead, driverRepo, importResultBundle, makeProjectBundle, type DriverRepo } from './git'

/** A mission as the driver keeps it. */
interface DriverMission extends Mission {
  sessionId?: string
  /** The crew member has it (it's in their status), so it's no longer sent. */
  acked?: boolean
  progress?: MissionProgress
  /** Final state the driver set itself (cancelled before pickup, member left). */
  local?: MissionProgress
  reported?: boolean
  movedTo?: string
  continues?: string
  /** The crew member's branch is in the lead's repository. */
  imported?: boolean
  importError?: string
  settling?: boolean
  /** A team run's mission: its report goes to the run, not into the session. */
  silent?: boolean
}

export type MissionSpec = Parameters<CrewDriverTools['dispatch']>[0][number]

export interface AssignResult {
  title: string
  id?: string
  to?: string
  toName?: string
  branch?: string
  headroom?: number
  /** Queued behind the member's current work. */
  queued?: boolean
  error?: string
}

/** A mission that ended, once its work is in the lead's repository (or didn't arrive). */
export interface MissionEvent {
  id: string
  state: MissionState
  view: MissionView
  imported: boolean
  importError?: string
  /** The mission that carries on with someone else (usage ran out, or they left). */
  continuation?: string
  report: string
  silent: boolean
}

export interface CrewDriverDeps {
  /** This member, while in a team. */
  me(): { id: string; name: string } | null
  myUsage(): PlanUsage
  /** Missions kept across restarts. */
  file?: string
  nudge(): void
  push(state: CrewState): void
  /** Hands a "[crew]" update to a session as a turn; false when that session isn't running. */
  deliver(sessionId: string, text: string): boolean
  /** Reports and messages start a turn in the session (always true for a team run's lead). */
  autoReports(sessionId?: string): boolean
  joinCommand(): string | undefined
  notify?(title: string, body: string, kind: 'done' | 'problem' | 'ask'): void
  repoOf?(cwd: string): Promise<DriverRepo>
  /** Files on the team server (the project out, mission results back), sealed with the team key. */
  files: { put(id: string, data: Buffer): Promise<void>; get(id: string): Promise<Buffer | null> }
  /** Scratch folder for git bundles. */
  tmpDir?: string
  now?(): number
}

/** A crew member gone this long (no status) with a mission running is treated as having left (a lid closed for a coffee isn't). */
const GONE_MS = 10 * 60_000
const ANSWER_TTL_MS = 15 * 60_000

const newMissionId = () => `m-${randomBytes(3).toString('hex').slice(0, 5)}`
const ago = (ms: number) => (ms < 90_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`)

/**
 * The driver side of crew mode: the driver's Claude hands out missions (crew_dispatch), crew
 * members' harness-crew runs them, and reports come back to the session that sent them, either to
 * a waiting crew_wait call or as a "[crew]" turn, so the driver's Claude keeps orchestrating
 * without anyone typing.
 */
export class CrewDriver {
  private missions: DriverMission[] = []
  private payloads = new Map<string, CrewPayload>()
  private statuses = new Map<string, MemberStatus>()
  private outbox: CrewMessage[] = []
  private answers: (CrewAnswer & { at: number })[] = []
  private cancel = new Set<string>()
  private repo?: CrewRepo
  private seen = new Set<string>()
  private log: CrewMessage[] = []
  private waiters = new Map<string, { missions?: string[]; resolve: (texts: string[]) => void }>()
  private pending = new Map<string, string[]>()
  /** The last session that used the crew (crew messages without a mission go there). */
  private lastSession?: string
  /** What's in the way of sharing the project, or what crew can't see yet. */
  private projectNote?: CrewState['projectNote']
  /** The lead's project folder, and the branch heads last shared with the crew. */
  private projectDir?: string
  private shared?: string
  private sharing?: Promise<void>
  /** Updates gathered during one sync, handed to each session together. */
  private batch?: Map<string, { text: string; mission?: string }[]>
  private listeners = new Set<(e: MissionEvent) => void>()

  constructor(private readonly deps: CrewDriverDeps) {
    this.load()
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  // ---------- team sync ----------

  fast(): boolean {
    return this.missions.some((m) => !isFinal(this.stateOf(m))) || [...this.payloads.values()].some((p) => p.asks.length > 0)
  }

  payload(): DriverPayload | undefined {
    if (!this.repo && !this.missions.length) return undefined
    const now = this.now()
    return fitPayload<DriverPayload>({
      role: 'driver',
      v: CREW_PROTOCOL,
      repo: this.repo,
      missions: this.missions
        .filter((m) => !m.acked && !m.local && !this.cancel.has(m.id))
        .map(
          ({
            sessionId: _s,
            acked: _a,
            progress: _p,
            local: _l,
            reported: _r,
            movedTo: _m,
            continues: _c,
            imported: _i,
            importError: _e,
            settling: _g,
            silent: _q,
            ...m
          }) => m,
        ),
      cancel: [...this.cancel],
      answers: this.answers.filter((a) => now - a.at < ANSWER_TTL_MS).map(({ at: _at, ...a }) => a),
      outbox: this.outbox.filter((m) => now - m.at < MESSAGE_TTL_MS),
    })
  }

  received(entries: { member: MemberStatus; payload: unknown }[]) {
    const me = this.deps.me()
    if (!me) return this.reset()
    const now = this.now()
    this.payloads = new Map()
    this.statuses = new Map()
    for (const e of entries) {
      const p = pickCrewPayload(e.payload)
      this.statuses.set(e.member.id, e.member)
      if (p?.role === 'crew') this.payloads.set(e.member.id, p)
    }
    let changed = false
    this.batch = new Map()
    for (const [id, p] of this.payloads) {
      // Messages first: they were sent before the report that comes with them.
      for (const msg of p.outbox) {
        if (this.seen.has(msg.id)) continue
        this.seen.add(msg.id)
        this.log = [...this.log, msg].slice(-80)
        changed = true
        if (msg.to === me.id || msg.to === '*') {
          const target = (msg.mission && this.missions.find((m) => m.id === msg.mission)?.sessionId) || this.lastSession
          if (target) this.toSession(target, crewMessageTurn(msg), msg.mission)
          if (msg.to === me.id) this.deps.notify?.(`${msg.fromName}'s Claude`, msg.text.slice(0, 140), 'ask')
        }
      }
      for (const prog of p.missions) {
        const m = this.missions.find((x) => x.id === prog.id && x.to === id)
        if (!m) continue
        if (!m.acked) changed = true
        m.acked = true
        const was = m.progress?.state
        m.progress = prog
        if (prog.state !== was) changed = true
        if (isFinal(prog.state) && !m.reported && !m.settling) {
          m.settling = true
          void this.settle(m)
        }
      }
    }
    // A crew member who left (or vanished) mid-mission: report it so the work can move on.
    for (const m of this.missions) {
      if (isFinal(this.stateOf(m)) || !m.acked) continue
      const st = this.statuses.get(m.to)
      if (!st || now - st.updatedAt > GONE_MS) {
        m.local = {
          id: m.id,
          title: m.title,
          state: 'stopped',
          branch: m.progress?.branch,
          endedAt: now,
          summary: `${this.nameOf(m.to)} went offline (harness-crew closed or the laptop slept). Nothing arrived after their last report.`,
          auto: true,
        }
        void this.onFinal(m)
        // If they come back, they stop it (and push what they had) rather than finish work someone else now has.
        this.cancel.add(m.id)
        changed = true
      }
    }
    // A cancel stays until the crew member has stopped the mission (or never had it).
    for (const id of this.cancel) {
      const m = this.missions.find((x) => x.id === id)
      if (!m || (m.progress && isFinal(m.progress.state)) || (!m.acked && m.local && now - (m.local.endedAt ?? 0) > 2 * 60_000)) this.cancel.delete(id)
    }
    const batch = this.batch
    this.batch = undefined
    for (const [sessionId, items] of batch) this.flush(sessionId, items)
    if (changed) this.save()
    this.publish()
  }

  private stateOf(m: DriverMission) {
    return (m.local ?? m.progress)?.state ?? 'queued'
  }

  private nameOf(id: string) {
    return this.statuses.get(id)?.name ?? 'crew member'
  }

  private crew(): CrewMemberView[] {
    const waiting = new Map<string, number>()
    for (const m of this.missions) if (!m.acked && !m.local && !this.cancel.has(m.id)) waiting.set(m.to, (waiting.get(m.to) ?? 0) + 1)
    return crewMembers([...this.statuses.values()], this.payloads, waiting, this.now())
  }

  private view(m: DriverMission): MissionView {
    const { acked: _a, local, reported: _r, imported: _i, importError, settling: _g, silent: _q, ...rest } = m
    const progress = local ?? (importError && m.progress ? { ...m.progress, sendError: importError } : m.progress)
    return { ...rest, toName: this.nameOf(m.to), state: this.stateOf(m), progress }
  }

  /** A finished mission: bring its branch into the lead's repository, then report it. */
  private async settle(m: DriverMission) {
    const p = m.progress
    if (p?.bundle && p.commits && this.projectDir) {
      const file = join(this.deps.tmpDir ?? tmpdir(), `${p.bundle}.bundle`)
      try {
        const data = await this.deps.files.get(p.bundle)
        if (!data) throw new Error('their work isn’t on the team server (it may have expired)')
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, data)
        await importResultBundle(this.projectDir, file, p.branch ?? m.branch)
        m.imported = true
      } catch (err) {
        m.importError = err instanceof Error ? err.message : String(err)
      } finally {
        rmSync(file, { force: true })
      }
    }
    m.settling = false
    await this.onFinal(m)
    this.save()
    this.publish()
  }

  private async onFinal(m: DriverMission) {
    m.reported = true
    const state = this.stateOf(m)
    const p = m.local ?? m.progress
    let continuation: string | undefined
    // Out of usage or gone: give it to someone with usage left, continuing from the work that arrived.
    if ((state === 'limited' || state === 'stopped') && !this.cancel.has(m.id)) {
      const next = pickAssignee(this.crew().filter((c) => c.id !== m.to))
      if (next) {
        const id = newMissionId()
        const from = p?.branch && p.commits && m.imported ? p.branch : m.from
        // Their branch is new here: share the project again so the next crew member has it.
        if (from !== m.from && this.projectDir) await this.setProject(this.projectDir)
        const at = this.projectDir && from ? await branchHead(this.projectDir, from) : undefined
        const handed: DriverMission = {
          id,
          title: m.title,
          brief:
            `Continuing mission ${m.id}, which ${this.nameOf(m.to)}'s Claude couldn't finish (${state === 'limited' ? 'their plan usage ran out' : 'they went offline'}).${from !== m.from ? ` Their work so far is on this branch (you start from it); check what's done before continuing.` : ''}${p?.summary ? `\nTheir last note: ${p.summary.slice(0, 1500)}` : ''}\n\n${m.brief}`.slice(
              0,
              12_000,
            ),
          to: next.id,
          from,
          at,
          branch: crewBranch(next.name, id),
          model: m.model,
          allow: m.allow,
          createdAt: this.now(),
          sessionId: m.sessionId,
          continues: m.id,
          silent: m.silent,
        }
        m.movedTo = next.name
        continuation = id
        this.missions.push(handed)
      }
    }
    const v = this.view(m)
    const event: MissionEvent = {
      id: m.id,
      state,
      view: v,
      imported: !!m.imported,
      importError: m.importError,
      continuation,
      report: missionReportText(v),
      silent: !!m.silent,
    }
    for (const l of this.listeners) l(event)
    if (m.silent) return
    const hint =
      state === 'done' && p?.branch && p.commits && m.imported
        ? `\nMerge it when it fits your plan: git merge ${p.branch} (then run the checks).`
        : m.movedTo
          ? `\nHarness gave it to ${m.movedTo} automatically.`
          : ''
    if (m.sessionId) this.toSession(m.sessionId, `[crew] ${missionReportText(v)}${hint}`, m.id)
    this.deps.notify?.(
      `${v.toName}: ${state === 'done' ? 'mission done' : state}`,
      `${m.title}${m.movedTo ? ` → ${m.movedTo}` : ''}`,
      state === 'done' ? 'done' : 'problem',
    )
  }

  private toSession(sessionId: string, text: string, mission?: string) {
    if (this.batch) this.batch.set(sessionId, [...(this.batch.get(sessionId) ?? []), { text, mission }])
    else this.flush(sessionId, [{ text, mission }])
  }

  /** Gives updates to a session: a waiting crew_wait first, else one "[crew]" turn, else keeps them for the next wait. */
  private flush(sessionId: string, items: { text: string; mission?: string }[]) {
    const w = this.waiters.get(sessionId)
    if (w && items.some((i) => !i.mission || !w.missions?.length || w.missions.includes(i.mission))) {
      this.waiters.delete(sessionId)
      w.resolve([...(this.pending.get(sessionId) ?? []), ...items.map((i) => i.text)])
      this.pending.delete(sessionId)
      return
    }
    const texts = items.map((i) => i.text)
    if (!w && this.deps.autoReports(sessionId) && this.deps.deliver(sessionId, texts.join('\n\n'))) return
    this.pending.set(sessionId, [...(this.pending.get(sessionId) ?? []), ...texts].slice(-30))
  }

  // ---------- the project ----------

  /**
   * The project crew members get ahead of the first mission (the run's project). Shares a fresh copy
   * through the team server whenever a branch moved, so missions start from the latest commits.
   */
  async setProject(dir: string | undefined) {
    const before = JSON.stringify([this.repo, this.projectNote])
    if (!dir) {
      if (!this.repo) this.projectNote = { tone: 'info', text: 'Create the project (Setup) so crew members can get it before the first mission.' }
    } else {
      this.projectDir = dir
      const r = await (this.deps.repoOf ?? driverRepo)(dir).catch(() => ({ problem: 'Not a git repository.' }) as DriverRepo)
      if (r.problem || !r.repo) this.projectNote = { tone: 'warn', text: r.problem ?? 'Not a git repository.' }
      else {
        let problem: string | undefined
        if (this.deps.me() && (r.fingerprint !== this.shared || !this.repo)) problem = await this.share(dir, r)
        this.projectNote = problem
          ? { tone: 'warn', text: problem }
          : !this.deps.me()
            ? { tone: 'info', text: 'Start the team to share the project with the crew.' }
            : r.dirty
              ? { tone: 'info', text: 'Uncommitted changes reach the crew once they’re committed.' }
              : undefined
      }
    }
    if (JSON.stringify([this.repo, this.projectNote]) !== before) {
      this.deps.nudge()
      this.publish()
    }
  }

  /** Bundles every branch and puts it on the team server; returns a problem, if any. */
  private async share(dir: string, r: DriverRepo): Promise<string | undefined> {
    while (this.sharing) await this.sharing
    if (r.fingerprint === this.shared && this.repo) return undefined
    let problem: string | undefined
    this.sharing = (async () => {
      const file = join(this.deps.tmpDir ?? tmpdir(), `project-${r.fingerprint}.bundle`)
      try {
        mkdirSync(dirname(file), { recursive: true })
        await makeProjectBundle(dir, file)
        const id = `p-${r.fingerprint}`
        await this.deps.files.put(id, readFileSync(file))
        this.repo = { ...r.repo!, bundle: id, url: r.repo!.url && /^https?:\/\//.test(r.repo!.url) ? r.repo!.url : undefined }
        this.shared = r.fingerprint
      } catch (err) {
        problem = `Couldn't share the project with the crew: ${err instanceof Error ? err.message : String(err)}`
      } finally {
        rmSync(file, { force: true })
      }
    })()
    await this.sharing
    this.sharing = undefined
    return problem
  }

  // ---------- tools for the driver's sessions ----------

  toolsFor(sessionId: string, cwd: string): CrewDriverTools {
    return {
      status: async () => {
        this.lastSession = sessionId
        await this.setProject(cwd)
        return this.statusText()
      },
      dispatch: (specs) => this.dispatch(sessionId, cwd, specs),
      wait: (o, signal) => this.wait(sessionId, o, signal),
      message: (to, text, mission) => this.message(to, text, mission),
      cancel: (id, reason) => this.stop(id, reason),
    }
  }

  statusText(): string {
    const me = this.deps.me()
    if (!me) return 'Not in a team yet. Create one on the Team board, then teammates join with `npx harness-crew <join code>`.'
    const now = this.now()
    const crew = this.crew()
    const lines: string[] = []
    const ready = crew.filter(canTake)
    lines.push(
      crew.length
        ? `Crew: ${ready.length} of ${crew.length} ready.`
        : `No crew yet. Teammates join from a terminal with: ${this.deps.joinCommand() ?? 'npx harness-crew <join code>'}`,
    )
    for (const c of crew) {
      const u = c.usage
      const usage =
        u.source === 'api-key' ? 'API key (no plan limit)' : `${c.headroom}% usage left${u.fiveHour ? ` (5 h window ${Math.round(u.fiveHour.pct)}% used)` : ''}`
      const doing = c.current
        ? `working on ${c.current.id} "${c.current.title}"${c.current.activity ? ` (${c.current.activity})` : ''}${c.current.since ? ` for ${ago(now - c.current.since)}` : ''}`
        : 'idle'
      const state = !c.online
        ? 'offline'
        : c.problem
          ? `not ready: ${c.problem}`
          : c.waiting
            ? 'waiting for the project (calling crew_status from the project shares it)'
            : !c.accepting
              ? 'not taking missions'
              : doing
      lines.push(`- ${c.name}: ${state}; ${usage}${c.queued ? `; ${c.queued} queued` : ''}`)
    }
    lines.push(
      `Your own plan: ${headroom(this.deps.myUsage(), now)}% usage left.${ready.length ? ' Hand bigger missions to whoever has more left than you.' : ''}`,
    )
    if (this.repo)
      lines.push(
        `Project shared with the crew: ${this.repo.name}, ${this.repo.base} at ${this.repo.head.slice(0, 7)} (missions start from ${this.repo.base} unless you say otherwise).`,
      )
    const recent = this.missions.slice(-15)
    if (recent.length) {
      lines.push('Missions:')
      for (const m of recent) {
        const v = this.view(m)
        const p = v.progress
        lines.push(
          `- ${m.id} "${m.title}" → ${v.toName}: ${v.state}${m.movedTo ? ` (moved to ${m.movedTo})` : ''}${p?.activity && v.state === 'working' ? ` (${p.activity})` : ''}${p?.branch && isFinal(v.state) && p.commits && m.imported ? `, branch ${p.branch} (${p.commits} commits)` : ''}`,
        )
      }
    }
    const asks = this.asks()
    if (asks.length) lines.push(`Waiting for approval in Harness (the user decides): ${asks.map((a) => `${a.fromName}: ${a.summary}`).join('; ')}`)
    return lines.join('\n')
  }

  async dispatch(sessionId: string, cwd: string, specs: MissionSpec[]): Promise<string> {
    const results = await this.assign(sessionId, cwd, specs)
    const out = results.map((r) =>
      r.id
        ? `✓ ${r.id} "${r.title}" → ${r.toName} (${r.headroom}% usage left${r.queued ? ', queued after their current work' : ''}), branch ${r.branch}`
        : `✗ "${r.title}": ${r.error}`,
    )
    const sent = results.filter((r) => r.id).length
    return `${out.join('\n')}${sent ? `\n${this.projectNote?.text ? `Note: ${this.projectNote.text}\n` : ''}They start within seconds. Carry on with your own part and collect reports with crew_wait (they also arrive as "[crew]" messages).` : ''}`
  }

  /**
   * Hands missions out by usage left. Throws when nobody could take any (no team, no project, no
   * crew); otherwise one result per spec. `silent` missions report to listeners only (a team run),
   * and `avoid` leaves out members (who already failed the task).
   */
  async assign(sessionId: string, cwd: string, specs: MissionSpec[], o: { silent?: boolean; avoid?: string[] } = {}): Promise<AssignResult[]> {
    const me = this.deps.me()
    if (!me) throw new Error('Not in a team yet: create one on the Team board first, then teammates join with npx harness-crew <join code>.')
    // Crew gets the latest committed branches before any mission starts.
    await this.setProject(cwd)
    const repo = this.repo
    if (!repo || this.projectNote?.tone === 'warn') throw new Error(this.projectNote?.text ?? 'There is no project to share yet.')
    if (!o.silent) this.lastSession = sessionId
    const crew = this.crew().filter((c) => !o.avoid?.includes(c.id))
    if (!crew.length) throw new Error(`No crew members yet. Teammates join from a terminal with: ${this.deps.joinCommand() ?? 'npx harness-crew <join code>'}`)
    const extra = new Map<string, number>()
    const out: AssignResult[] = []
    for (const s of specs) {
      const title = s.title.slice(0, 120)
      const target = pickAssignee(crew, extra, s.to)
      if (!target) {
        const why = crew
          .map((c) => `${c.name}: ${!c.online ? 'offline' : c.problem ? c.problem : !c.accepting ? 'not taking missions' : `${c.headroom}% usage left`}`)
          .join('; ')
        out.push({ title, error: `${s.to ? `${s.to} can't take it` : 'nobody can take it'} right now (${why}). Do it yourself or later.` })
        continue
      }
      const from = s.from ?? repo.base
      const at = from === repo.base ? repo.head : await branchHead(cwd, from)
      if (!at) {
        out.push({ title, error: `there's no branch ${from} in this repository to start from.` })
        continue
      }
      const id = newMissionId()
      const m: DriverMission = {
        id,
        title,
        brief: s.brief,
        to: target.id,
        from,
        at,
        branch: crewBranch(target.name, id),
        model: s.model,
        allow: s.allow,
        createdAt: this.now(),
        sessionId,
        silent: o.silent || undefined,
      }
      this.missions.push(m)
      extra.set(target.id, (extra.get(target.id) ?? 0) + 1)
      const queued = !!(target.current || target.queued || (extra.get(target.id) ?? 0) > 1)
      out.push({ title, id, to: target.id, toName: target.name, branch: m.branch, headroom: target.headroom, queued })
    }
    this.missions = this.missions.slice(-80)
    this.save()
    this.deps.nudge()
    this.publish()
    return out
  }

  wait(sessionId: string, o: { missions?: string[]; timeoutSec: number }, signal?: AbortSignal): Promise<string> {
    this.lastSession = sessionId
    const ids = o.missions?.filter(Boolean)
    const pend = this.pending.get(sessionId) ?? []
    const relevant = ids?.length ? pend.filter((t) => ids.some((id) => t.includes(id))) : pend
    if (relevant.length) {
      this.pending.set(
        sessionId,
        pend.filter((t) => !relevant.includes(t)),
      )
      return Promise.resolve(relevant.join('\n\n') + this.stillRunning(ids))
    }
    if (ids?.length && ids.every((id) => isFinal(this.stateOf(this.missions.find((m) => m.id === id) ?? ({} as DriverMission))))) {
      return Promise.resolve(
        ids
          .map((id) => this.missions.find((m) => m.id === id))
          .filter((m): m is DriverMission => !!m)
          .map((m) => missionReportText(this.view(m)))
          .join('\n\n'),
      )
    }
    return new Promise((resolve) => {
      const finish = (texts: string[]) => {
        clearTimeout(timer)
        resolve(texts.length ? texts.join('\n\n') + this.stillRunning(ids) : `No reports in ${o.timeoutSec} s.${this.stillRunning(ids)}`)
      }
      const timer = setTimeout(() => {
        if (this.waiters.get(sessionId)?.resolve === finish) this.waiters.delete(sessionId)
        finish([])
      }, o.timeoutSec * 1000)
      signal?.addEventListener(
        'abort',
        () => {
          if (this.waiters.get(sessionId)?.resolve === finish) this.waiters.delete(sessionId)
          finish([])
        },
        { once: true },
      )
      this.waiters.get(sessionId)?.resolve([])
      this.waiters.set(sessionId, { missions: ids, resolve: finish })
    })
  }

  private stillRunning(ids?: string[]): string {
    const open = this.missions.filter((m) => !isFinal(this.stateOf(m)) && (!ids?.length || ids.includes(m.id)))
    if (!open.length) return ''
    return `\nStill running: ${open.map((m) => `${m.id} "${m.title}" (${this.nameOf(m.to)}: ${m.progress?.activity ?? this.stateOf(m)})`).join('; ')}`
  }

  message(to: string, text: string, mission?: string): string {
    const me = this.deps.me()
    if (!me) throw new Error('Not in a team.')
    const t = to.trim().toLowerCase()
    const crew = this.crew()
    const target = ['all', 'everyone', '*', 'crew'].includes(t)
      ? '*'
      : (crew.find((c) => c.name.toLowerCase() === t) ?? crew.find((c) => c.name.toLowerCase().startsWith(t)))?.id
    if (!target) throw new Error(`No crew member called "${to}". Crew: ${crew.map((c) => c.name).join(', ') || 'none yet'}, or "all".`)
    const msg: CrewMessage = { id: `d${randomBytes(8).toString('hex')}`, from: me.id, fromName: me.name, to: target, text, mission, at: this.now() }
    this.outbox = [...this.outbox.filter((m) => this.now() - m.at < MESSAGE_TTL_MS), msg].slice(-MAX_OUTBOX)
    this.log = [...this.log, msg].slice(-80)
    this.seen.add(msg.id)
    this.deps.nudge()
    this.publish()
    return `Sent to ${target === '*' ? 'all crew' : this.nameOf(target)}.`
  }

  stop(id: string, reason?: string): string {
    const m = this.missions.find((x) => x.id === id)
    if (!m) throw new Error(`No mission ${id}.`)
    if (isFinal(this.stateOf(m))) return `${id} already ended (${this.stateOf(m)}).`
    this.cancel.add(id)
    if (!m.acked) {
      m.local = { id, title: m.title, state: 'stopped', endedAt: this.now(), summary: reason ?? 'Cancelled before it started.' }
      m.reported = true
    }
    this.save()
    this.deps.nudge()
    this.publish()
    return m.acked ? `Stopping ${id}; ${this.nameOf(m.to)} pushes what's done to ${m.branch} and reports.` : `Cancelled ${id} before it started.`
  }

  /** The user's answer to a crew Claude's permission question (from the Team board). */
  answer(askId: string, allow: boolean, always?: boolean) {
    this.answers = [...this.answers.filter((a) => a.id !== askId && this.now() - a.at < ANSWER_TTL_MS), { id: askId, allow, always, at: this.now() }]
    this.deps.nudge()
    this.publish()
  }

  private asks(): CrewAskView[] {
    const answered = new Set(this.answers.map((a) => a.id))
    return [...this.payloads].flatMap(([id, p]) =>
      p.asks
        .filter((a) => !answered.has(a.id))
        .map((a) => ({ ...a, fromId: id, fromName: this.nameOf(id), missionTitle: this.missions.find((m) => m.id === a.mission)?.title })),
    )
  }

  state(): CrewState {
    return {
      available: !!this.deps.me(),
      members: this.crew(),
      missions: this.missions
        .slice(-40)
        .reverse()
        .map((m) => this.view(m)),
      asks: this.asks(),
      messages: this.log.slice(-40),
      joinCommand: this.deps.joinCommand(),
      autoReports: this.deps.autoReports(),
      project: this.repo,
      projectNote: this.projectNote,
    }
  }

  publish() {
    this.deps.push(this.state())
  }

  // ---------- for the team run ----------

  /** Called whenever a mission ends (after its branch is imported); returns an unsubscribe. */
  onMission(fn: (e: MissionEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  mission(id: string): MissionView | undefined {
    const m = this.missions.find((x) => x.id === id)
    return m && this.view(m)
  }

  /** Whether a mission has ended and been dealt with (its work imported, or not arriving). */
  settled(id: string): boolean {
    const m = this.missions.find((x) => x.id === id)
    return !!m && !!m.reported && !m.settling
  }

  /** The crew members as Harness sees them right now. */
  members(): CrewMemberView[] {
    return this.crew()
  }

  /** Left the team: forget who the crew was (missions stay for the record). */
  reset() {
    this.payloads.clear()
    this.statuses.clear()
    this.publish()
  }

  private load() {
    if (!this.deps.file) return
    try {
      const s = JSON.parse(readFileSync(this.deps.file, 'utf8')) as { missions?: DriverMission[]; seen?: string[] }
      this.missions = s.missions ?? []
      for (const id of s.seen ?? []) this.seen.add(id)
    } catch {
      // first run
    }
  }

  private save() {
    if (!this.deps.file) return
    try {
      mkdirSync(dirname(this.deps.file), { recursive: true })
      writeFileSync(this.deps.file, JSON.stringify({ missions: this.missions.slice(-80), seen: [...this.seen].slice(-500) }))
    } catch {
      // not fatal
    }
  }
}
