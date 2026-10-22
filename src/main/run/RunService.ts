import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { canTake, type CrewMemberView, type MissionView } from '@shared/crew'
import type { HarnessEvent, SessionStatus } from '@shared/events'
import type { HackforgeSnapshot } from '@shared/hackforge'
import type { PermissionDecision } from '@shared/ipc'
import {
  answerMessage,
  buildMessage,
  contractsMessage,
  EMPTY_RUN,
  finishMessage,
  fixMessage,
  formatDuration,
  integrateMessage,
  overrunMessage,
  PLAN_PROMPT,
  taskBackMessage,
  taskBrief,
  type ClaudePlan,
  type Contract,
  type ContractTask,
  type InboxItem,
  type RunMilestone,
  type RunStage,
  type RunState,
  type RunTask,
  type SetupInfo,
} from '@shared/run'
import { headroom, type PlanUsage } from '@shared/team'
import type { AssignResult, MissionEvent, MissionSpec } from '../crew/CrewDriver'
import {
  addFiles,
  commitAll,
  createGithub,
  createProject,
  hasChallenge,
  listFiles,
  prepareProject,
  readChallenge,
  readContracts,
  writeChallenge,
  type FileKind,
  type Gh,
} from './project'

/** What a turn Harness hands the lead's Claude is for, so its end moves the run on. */
type Tag =
  | { step: 'plan' }
  | { step: 'contracts' }
  | { step: 'build'; milestone: string; tasks: string[] }
  | { step: 'tasks'; tasks: string[] }
  | { step: 'integrate'; milestone: string }
  | { step: 'finish' }

interface Turn {
  text: string
  kind: 'run' | 'crew' | 'reply' | 'answer'
  tag?: Tag
}

/** What happens when the lead answers a Harness decision. */
type Decision = { kind: 'stuck'; milestone: string } | { kind: 'contracts' } | { kind: 'ask'; question: string; from: string }

interface Internal {
  queue: Turn[]
  inTurn?: Turn
  /** A turn cut off (pause, crash, limit): sent again first. */
  redo?: Turn
  /** The lead's own part of the current milestone is built. */
  leadDone: boolean
  reports: Record<string, { report: string; branch?: string }>
  decisions: Record<string, Decision>
  /** Inbox replies: the turn the answer continues. */
  replies: Record<string, Tag | undefined>
  contractTries: number
  finishNudged?: boolean
  pausedBy?: 'user' | 'limit'
  /** Lead permission requests by inbox id (for answering). */
  requests: Record<string, { requestId: string; input: Record<string, unknown> }>
}

const EMPTY_INTERNAL: Internal = { queue: [], leadDone: false, reports: {}, decisions: {}, replies: {}, contractTries: 0, requests: {} }

export interface RunDeps {
  /** run.json: the run survives a restart. */
  file?: string
  now?(): number
  push(state: RunState): void
  notify?(title: string, body: string, kind: 'done' | 'problem' | 'ask'): void
  team: {
    me(): { id: string; name: string } | null
    /** Creates the team on the team server set in Settings (or hosted on this laptop). */
    start(name: string): Promise<void>
    myUsage(): PlanUsage
  }
  crew: {
    assign(sessionId: string, cwd: string, specs: MissionSpec[], o: { silent?: boolean; avoid?: string[] }): Promise<AssignResult[]>
    onMission(fn: (e: MissionEvent) => void): () => void
    mission(id: string): MissionView | undefined
    members(): CrewMemberView[]
    stop(id: string, reason?: string): string
  }
  /** The lead's Claude session (started by the renderer, driven from here). */
  lead: {
    send(sessionId: string, text: string): void
    status(sessionId: string): SessionStatus | undefined
    respond(sessionId: string, requestId: string, d: PermissionDecision): void
    interrupt(sessionId: string): Promise<void> | void
  }
  hackforge(dir: string): Promise<Pick<HackforgeSnapshot, 'milestones' | 'decision' | 'loop' | 'config'>>
  contracts?(dir: string): Promise<Contract[]>
  gh?: Gh
  /** The run's project became this folder (event project, crew sharing). */
  onProject?(dir: string | undefined): void
  author?(): string | undefined
}

/** Usage left (%) below which a crew member gets no new task. */
const CREW_MIN = 15
/** Below this, the lead's Claude keeps its usage for integrating: its tasks go to the crew too. */
const LEAD_MIN = 20
const MAX_FIX_ROUNDS = 2
const TICK_MS = 30_000

const newId = () => randomBytes(4).toString('hex')

/**
 * The team run: Team → Setup → Plan → Run → Done, driven by Harness. Claude does the thinking
 * (HackForge plans, builds, integrates and verifies), Harness makes the steps happen in order: it
 * splits each milestone between the crew and the lead's Claude by usage left, hands the lead's Claude
 * one "[run]" turn at a time, moves failed work on, pauses at the plan limit, keeps to the deadline,
 * and puts everything that needs the person in one inbox.
 */
export class RunService {
  private s: RunState = structuredClone(EMPTY_RUN)
  private i: Internal = structuredClone(EMPTY_INTERNAL)
  private timer?: ReturnType<typeof setInterval>
  private unsubscribe?: () => void
  private busy = Promise.resolve()

  constructor(private readonly deps: RunDeps) {
    this.load()
    this.unsubscribe = deps.crew.onMission((e) => this.serial(() => this.onMission(e)))
  }

  start() {
    this.timer ??= setInterval(() => this.serial(() => this.tick()), TICK_MS)
    this.timer.unref?.()
    // After a restart the lead's session isn't running until it's reconnected.
    if (this.s.sessionId && !this.deps.lead.status(this.s.sessionId)) this.s.sessionLive = false
    this.publish()
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    this.unsubscribe?.()
  }

  private now() {
    return this.deps.now?.() ?? Date.now()
  }

  /** One thing at a time: events, timers and the lead's clicks never interleave half-way. */
  private serial(fn: () => Promise<void> | void): Promise<void> {
    const next = this.busy.then(fn).catch((err: unknown) => this.log(`Harness hit a problem: ${err instanceof Error ? err.message : String(err)}`, 'warn'))
    this.busy = next.then(() => {
      this.save()
      this.publish()
    })
    return this.busy
  }

  state(): RunState {
    return this.s
  }

  /** Resolves once everything already started has finished (tests, shutdown). */
  whenIdle(): Promise<void> {
    return this.busy
  }

  /** The lead's session in the run. */
  owns(sessionId: string) {
    return !!sessionId && this.s.sessionId === sessionId
  }

  /** Sessions in the run's project get the run guide and the ask-the-lead tool. */
  isRunProject(cwd: string) {
    const dir = this.s.project?.dir
    return !!dir && this.s.stage !== 'done' && norm(cwd) === norm(dir)
  }

  // ---------- Team ----------

  startTeam(name: string): Promise<void> {
    return this.serial(async () => {
      if (!this.deps.team.me()) await this.deps.team.start(name)
      this.log('Team started. Teammates join with the command on screen.', 'good')
    })
  }

  /** Back or forward between the steps before the run starts. */
  goTo(stage: RunStage): Promise<void> {
    return this.serial(() => {
      if (this.s.stage === 'run') throw new Error('The run has started: stop it first.')
      if (stage === 'setup' || stage === 'team') this.s.stage = stage
      else if (stage === 'plan' && this.s.project) this.s.stage = 'plan'
    })
  }

  // ---------- Setup ----------

  createProject(o: { name: string; parent: string; deadline?: string; plan: ClaudePlan }): Promise<void> {
    return this.serial(async () => {
      const team = this.deps.crew.members().length + 1
      const dir = await createProject({ ...o, team, author: this.deps.author?.(), now: this.now() })
      this.setProject({ dir, name: o.name, deadline: o.deadline, plan: o.plan })
    })
  }

  useFolder(o: { dir: string; name: string; deadline?: string; plan: ClaudePlan }): Promise<void> {
    return this.serial(async () => {
      const team = this.deps.crew.members().length + 1
      await prepareProject(o.dir, { ...o, team, author: this.deps.author?.(), now: this.now() })
      this.setProject(o)
    })
  }

  private setProject(o: { dir: string; name: string; deadline?: string; plan: ClaudePlan }) {
    this.s = { ...structuredClone(EMPTY_RUN), stage: 'setup', project: { ...o, createdAt: this.now() } }
    this.i = structuredClone(EMPTY_INTERNAL)
    this.deps.onProject?.(o.dir)
    this.log(`Project ${o.name} is ready in ${o.dir}.`, 'good')
  }

  /** The challenge text and what's in each drop zone. */
  setupInfo(): SetupInfo | null {
    const dir = this.s.project?.dir
    if (!dir) return null
    return { challenge: readChallenge(dir), files: listFiles(dir), ready: hasChallenge(dir) }
  }

  setChallenge(text: string) {
    const dir = this.need().dir
    writeChallenge(dir, text)
    return this.setupInfo()
  }

  addFiles(kind: FileKind, paths: string[]) {
    const dir = this.need().dir
    const added = addFiles(dir, kind, paths)
    if (added.length) this.log(`Added to ${kind === 'challenge' ? 'the challenge' : kind === 'files' ? 'files' : 'private files'}: ${added.join(', ')}`)
    this.publish()
    return this.setupInfo()
  }

  github(): Promise<void> {
    return this.serial(async () => {
      const p = this.need()
      if (!this.deps.gh) throw new Error('GitHub isn’t available here.')
      await commitAll(p.dir, 'Challenge and files', this.deps.author?.())
      const r = await createGithub(p.dir, p.name, this.deps.gh)
      this.s.project = { ...p, github: r.url ?? p.github, githubProblem: r.problem }
      if (r.url) this.log(`GitHub repository: ${r.url}`, 'good')
    })
  }

  // ---------- Plan ----------

  /** The lead's session is up: commit the challenge and let HackForge plan. */
  plan(sessionId: string): Promise<void> {
    return this.serial(async () => {
      const p = this.need()
      if (!hasChallenge(p.dir)) throw new Error('Add the challenge first (text or files).')
      await commitAll(p.dir, 'Challenge and files', this.deps.author?.())
      this.deps.onProject?.(p.dir)
      // Back from Setup to the same Claude: it updates its plan rather than starting over.
      const again = sessionId === this.s.sessionId && this.s.sessionLive
      Object.assign(this.s, { stage: 'plan', step: 'planning', sessionId, sessionLive: true, inbox: again ? this.s.inbox : [], done: undefined })
      if (again) {
        this.log('The challenge changed: your Claude updates the plan.')
        this.enqueue({
          text: '[run] The lead changed the challenge or its files (challenge/, private/). Re-read what changed, update DECISION.md and PLAN.md if needed, then stop at the plan checkpoint again with a short summary.',
          kind: 'run',
          tag: { step: 'plan' },
        })
        return
      }
      this.i = { ...structuredClone(EMPTY_INTERNAL) }
      this.log('Your Claude is reading the challenge and planning (HackForge).')
      this.enqueue({ text: PLAN_PROMPT, kind: 'run', tag: { step: 'plan' } })
    })
  }

  acceptPlan(): Promise<void> {
    return this.serial(() => {
      if (this.s.step !== 'plan-ready') throw new Error('There’s no plan to accept yet.')
      this.s.step = 'contracts'
      this.i.contractTries = 0
      this.log('Plan accepted. Your Claude is writing the milestone contracts.', 'good')
      this.enqueue({ text: contractsMessage(), kind: 'run', tag: { step: 'contracts' } })
    })
  }

  revisePlan(change: string): Promise<void> {
    return this.serial(() => {
      if (this.s.step !== 'plan-ready') throw new Error('There’s no plan to change yet.')
      this.s.step = 'planning'
      this.log(`Asked for changes: ${change.slice(0, 200)}`)
      this.enqueue({
        text: `[run] The lead wants changes to the plan: ${change}\nUpdate PLAN.md (and DECISION.md if it changes), then stop at the plan checkpoint again.`,
        kind: 'run',
        tag: { step: 'plan' },
      })
    })
  }

  // ---------- Run ----------

  private async beginRun(contracts: Contract[]) {
    const p = this.need()
    const now = this.now()
    const open = contracts.filter((c) => c.status !== 'done')
    const deadline = p.deadline ? Date.parse(p.deadline) : NaN
    // Time for the milestones: what's left minus the finish (pitch, verify, the loop).
    const left = Number.isFinite(deadline) ? deadline - now : 0
    const reserve = Math.max(90 * 60_000, left * 0.15)
    const budget = left > reserve && open.length ? (left - reserve) / open.length : undefined
    this.s.milestones = contracts.map(
      (c): RunMilestone => ({
        id: c.milestone,
        goal: c.goal,
        status: c.status === 'done' ? 'done' : 'todo',
        budgetMs: c.status === 'done' ? undefined : budget,
        fixRounds: 0,
      }),
    )
    this.s.tasks = []
    this.s.stage = 'run'
    this.s.startedAt = now
    this.log(
      `Run started: ${open.length} milestone${open.length === 1 ? '' : 's'}${budget ? `, about ${formatDuration(budget)} each` : ''}, ${this.deps.crew.members().filter(canTake).length} crew ready.`,
      'good',
    )
    this.deps.notify?.('Team run started', `${open.length} milestones`, 'done')
    await this.nextMilestone()
  }

  private async nextMilestone() {
    const rest = this.s.milestones.filter((m) => m.status === 'todo')
    if (!rest.length) return this.finish([])
    const p = this.need()
    const deadline = p.deadline ? Date.parse(p.deadline) : NaN
    if (Number.isFinite(deadline)) {
      const left = deadline - this.now()
      const total = this.s.startedAt ? deadline - this.s.startedAt : left
      if (left < Math.max(90 * 60_000, total * 0.15)) return this.finish(rest.map((m) => m.id))
    }
    await this.startMilestone(rest[0])
  }

  private async startMilestone(m: RunMilestone) {
    const p = this.need()
    const c = (await this.contracts()).find((x) => x.milestone === m.id)
    if (!c) {
      m.status = 'stuck'
      this.log(`${m.id}'s contract is gone; skipping it.`, 'warn')
      return this.nextMilestone()
    }
    m.status = 'building'
    m.startedAt = this.now()
    this.s.current = m.id
    this.s.step = 'building'
    this.i.leadDone = false
    const plan = this.split(c.tasks)
    const tasks: RunTask[] = c.tasks.map((t) => ({
      id: taskId(c, t),
      milestone: m.id,
      role: t.role,
      owned: t.owned,
      assignee: { kind: 'lead' },
      state: 'working',
      attempts: 0,
    }))
    const forCrew = plan.filter((x) => x.member)
    if (forCrew.length && this.s.sessionId) {
      const specs = forCrew.map((x) => ({
        title: `${m.id} ${x.task.id}${x.task.role ? ` (${x.task.role})` : ''}`,
        brief: taskBrief(c, x.task),
        to: x.member!.name,
      }))
      let results: AssignResult[] = []
      try {
        results = await this.deps.crew.assign(this.s.sessionId, p.dir, specs, { silent: true })
      } catch (err) {
        this.log(`Couldn't hand work to the crew (${err instanceof Error ? err.message : String(err)}); your Claude builds it all.`, 'warn')
      }
      forCrew.forEach((x, n) => {
        const r = results[n]
        const t = tasks.find((y) => y.id === taskId(c, x.task))!
        if (r?.id && r.to) t.assignee = { kind: 'crew', id: r.to, name: r.toName ?? x.member!.name, mission: r.id }
        else if (r?.error) t.note = `Crew couldn't take it: ${r.error}`
      })
    }
    this.s.tasks = [...this.s.tasks.filter((t) => t.milestone !== m.id), ...tasks]
    const crew = tasks.filter((t) => t.assignee.kind === 'crew')
    const mine = tasks.filter((t) => t.assignee.kind === 'lead')
    const budget = m.budgetMs ? formatDuration(m.budgetMs) : undefined
    this.log(
      `${m.id} started: ${crew.map((t) => `${t.id} → ${t.assignee.kind === 'crew' ? t.assignee.name : ''}`).join(', ') || 'no crew tasks'}${mine.length ? `; your Claude: ${mine.map((t) => t.id).join(', ')}` : ''}.`,
    )
    this.enqueue({
      text: buildMessage(
        m,
        crew.map((t) => ({ task: t.id, name: t.assignee.kind === 'crew' ? t.assignee.name : '' })),
        mine,
        budget,
      ),
      kind: 'run',
      tag: { step: 'build', milestone: m.id, tasks: mine.map((t) => t.id) },
    })
  }

  /**
   * Who builds what: one task per crew member with usage left (most left first), the rest for the
   * lead's Claude, unless the lead is low, when the crew queues those too.
   */
  private split(tasks: ContractTask[]): { task: ContractTask; member?: CrewMemberView }[] {
    const crew = this.deps.crew
      .members()
      .filter((c) => canTake(c) && c.headroom > CREW_MIN)
      .sort((a, b) => b.headroom - a.headroom)
    const leadLow = headroom(this.deps.team.myUsage(), this.now()) < LEAD_MIN
    return tasks.map((task, n) => ({ task, member: n < crew.length ? crew[n] : leadLow && crew.length ? crew[n % crew.length] : undefined }))
  }

  private async onMission(e: MissionEvent) {
    if (!e.silent) return
    const t = this.s.tasks.find((x) => x.assignee.kind === 'crew' && x.assignee.mission === e.id)
    if (!t || t.assignee.kind !== 'crew') return
    const name = t.assignee.name
    if (e.continuation) {
      const next = this.deps.crew.mission(e.continuation)
      t.assignee = { kind: 'crew', id: next?.to ?? t.assignee.id, name: next?.toName ?? e.view.movedTo ?? name, mission: e.continuation }
      t.note = `${name} ${e.state === 'limited' ? 'ran out of usage' : 'went offline'}; ${t.assignee.name} carries on.`
      this.log(`${t.id}: ${t.note}`, 'warn')
      return
    }
    const p = e.view.progress
    if (e.state === 'done' && !e.importError) {
      t.state = 'done'
      t.note = p?.commits ? `${p.commits} commit${p.commits === 1 ? '' : 's'} on ${p.branch}` : 'done, no changes'
      this.i.reports[t.id] = { report: e.report, branch: p?.commits && e.imported ? p.branch : undefined }
      this.log(`${t.id} done by ${name}'s Claude.`, 'good')
    } else if (e.state === 'blocked') {
      this.i.reports[t.id] = { report: e.report }
      this.toLead(t, `${name}'s Claude got blocked: ${(p?.summary ?? '').slice(0, 600)}`)
    } else {
      t.attempts++
      const why = e.importError ? `their work didn't arrive (${e.importError})` : `${name}'s Claude ${e.state === 'limited' ? 'ran out of usage' : e.state}`
      if (t.attempts < 2 && (await this.reassign(t, why))) return
      this.toLead(t, `${why}.${p?.summary ? ` Their note: ${p.summary.slice(0, 600)}` : ''}`)
    }
    await this.advance()
  }

  private async reassign(t: RunTask, why: string): Promise<boolean> {
    if (t.assignee.kind !== 'crew' || !this.s.sessionId) return false
    const c = (await this.contracts()).find((x) => x.milestone === t.milestone)
    const ct = c?.tasks.find((x) => taskId(c, x) === t.id)
    if (!c || !ct) return false
    const avoid = t.assignee.id
    try {
      const [r] = await this.deps.crew.assign(
        this.s.sessionId,
        this.need().dir,
        [
          {
            title: `${t.milestone} ${ct.id}${ct.role ? ` (${ct.role})` : ''}`,
            brief: `${taskBrief(c, ct)}\n\nA first attempt didn't work out: ${why}. Start fresh from the base branch.`,
          },
        ],
        { silent: true, avoid: [avoid] },
      )
      if (!r?.id || !r.to) return false
      const was = t.assignee.name
      t.assignee = { kind: 'crew', id: r.to, name: r.toName ?? 'crew', mission: r.id }
      t.note = `${was}: ${why}; given to ${t.assignee.name}.`
      this.log(`${t.id}: ${t.note}`, 'warn')
      return true
    } catch {
      return false
    }
  }

  private toLead(t: RunTask, why: string) {
    t.assignee = { kind: 'lead' }
    t.state = 'working'
    t.note = why.slice(0, 300)
    this.log(`${t.id} goes to your Claude: ${why.slice(0, 200)}`, 'warn')
    this.enqueue({ text: taskBackMessage(t, why), kind: 'run', tag: { step: 'tasks', tasks: [t.id] } })
  }

  /** Moves the milestone on when everything it's waiting for is in. */
  private async advance() {
    if (this.s.stage !== 'run') return
    const m = this.s.milestones.find((x) => x.id === this.s.current)
    if (!m || m.status !== 'building' || !this.i.leadDone) return
    const tasks = this.s.tasks.filter((t) => t.milestone === m.id)
    if (tasks.some((t) => t.state !== 'done')) return
    // The lead's own turns for this milestone (handed-back tasks) are done too.
    if (this.i.inTurn?.tag?.step === 'tasks' || this.i.queue.some((q) => q.tag?.step === 'tasks')) return
    m.status = 'integrating'
    this.s.step = 'integrating'
    const done = tasks.map((t) => this.i.reports[t.id]).filter((r): r is { report: string; branch?: string } => !!r)
    this.log(`All of ${m.id}'s work is in: your Claude integrates and verifies it.`)
    this.enqueue({
      text: integrateMessage(
        m,
        done.flatMap((r) => (r.branch ? [r.branch] : [])),
        done.map((r) => r.report.slice(0, 3000)),
      ),
      kind: 'run',
      tag: { step: 'integrate', milestone: m.id },
    })
  }

  private async integrated(id: string) {
    const m = this.s.milestones.find((x) => x.id === id)
    if (!m) return
    const c = (await this.contracts()).find((x) => x.milestone === id)
    if (c?.status === 'done') {
      m.status = 'done'
      m.endedAt = this.now()
      this.log(`${m.id} is done${m.startedAt ? ` (${formatDuration(m.endedAt - m.startedAt)})` : ''}.`, 'good')
      this.deps.notify?.(`${m.id} done`, m.goal, 'done')
      return this.nextMilestone()
    }
    m.fixRounds++
    if (m.fixRounds <= MAX_FIX_ROUNDS) {
      this.log(`${m.id} isn't green yet (round ${m.fixRounds} of fixes).`, 'warn')
      this.enqueue({ text: fixMessage(m, c?.status), kind: 'run', tag: { step: 'integrate', milestone: m.id } })
      return
    }
    m.status = 'stuck'
    this.decide(
      { kind: 'stuck', milestone: m.id },
      {
        title: `${m.id} still isn't green after ${MAX_FIX_ROUNDS} rounds of fixes`,
        detail: this.s.lead.lastText?.slice(-1200),
        options: ['Move on to the next milestone', 'Keep fixing', 'Finish now (pitch and verify)'],
        suggestion: 'Move on to the next milestone',
      },
    )
  }

  private async finish(skipped: string[]) {
    this.s.step = 'finishing'
    this.s.current = undefined
    if (skipped.length) this.log(`Time is short: ${skipped.join(', ')} cut. Your Claude finishes up.`, 'warn')
    else this.log('All milestones are done: your Claude writes the pitch, verifies and improves.', 'good')
    const snap = await this.deps.hackforge(this.need().dir).catch(() => undefined)
    this.enqueue({ text: finishMessage(snap?.config.loopEnabled !== false, skipped), kind: 'run', tag: { step: 'finish' } })
  }

  private async finished() {
    const snap = await this.deps.hackforge(this.need().dir).catch(() => undefined)
    // The loop says it's still on: once, ask Claude to carry it to its end.
    if (snap?.loop?.active && !this.i.finishNudged) {
      this.i.finishNudged = true
      this.log('The improvement loop is still going.')
      return this.enqueue({
        text: '[run] The improvement loop is still active (LOOP.json). Carry on with hackforge:perfect until it ends, then end your turn.',
        kind: 'run',
        tag: { step: 'finish' },
      })
    }
    this.s.stage = 'done'
    this.s.step = 'idle'
    this.s.done = { at: this.now(), reason: snap?.loop?.endedReason ? `Loop ended: ${snap.loop.endedReason}` : 'Finished' }
    this.log('The run is done. Check the submission checklist in VERIFY.md.', 'good')
    this.deps.notify?.('Team run done', snap?.loop?.bestScore !== undefined ? `Best mock score ${snap.loop.bestScore.toFixed(1)}` : 'Ready to submit', 'done')
  }

  // ---------- the lead's Claude, one turn at a time ----------

  private enqueue(t: Turn) {
    this.i.queue.push(t)
    this.pump()
  }

  /** Crew messages for the lead's Claude wait for its turn, like Harness's own. */
  deliver(text: string): boolean {
    void this.serial(() => this.enqueue({ text, kind: 'crew' }))
    return true
  }

  /** Sends the next turn when the lead's Claude is free. */
  private pump() {
    const id = this.s.sessionId
    if (!id || this.i.inTurn || this.i.pausedBy) return
    if (this.deps.lead.status(id) !== 'idle') return
    const next = this.i.redo ?? this.i.queue.shift()
    if (!next) return
    this.i.redo = undefined
    try {
      this.deps.lead.send(id, next.text)
      this.i.inTurn = next
    } catch {
      this.i.redo = next
      this.s.sessionLive = false
    }
  }

  /** Events from the lead's session (only the ones the run follows: not every streamed token). */
  onEvents(events: HarnessEvent[]) {
    const id = this.s.sessionId
    const mine = id ? events.filter((e) => e.sessionId === id && FOLLOWED.has(e.type)) : []
    if (!mine.length) return
    void this.serial(async () => {
      for (const e of mine) await this.onEvent(e)
    })
  }

  private async onEvent(e: HarnessEvent) {
    const lead = this.s.lead
    switch (e.type) {
      case 'status':
        lead.status = e.status
        if (e.status === 'closed') {
          this.s.sessionLive = false
          if (this.i.inTurn) this.i.redo = this.i.inTurn
          this.i.inTurn = undefined
        } else if (e.status === 'idle') this.pump()
        break
      case 'tool.start':
        if (!e.agentId) lead.activity = describeTool(e.name, e.input)
        break
      case 'subagent.start':
        lead.activity = `${e.subagentType ?? 'agent'}: ${e.description}`
        break
      case 'assistant.text':
        if (!e.agentId) lead.lastText = e.text.slice(-2000)
        break
      case 'permission.request':
        this.addRequest(e)
        break
      case 'permission.resolved': {
        const item = Object.entries(this.i.requests).find(([, r]) => r.requestId === e.requestId)
        if (item) this.drop(item[0])
        break
      }
      case 'turn.end':
        if (!e.internal) await this.turnEnded(e.isError, e.result)
        break
    }
  }

  private async turnEnded(isError: boolean, result: string) {
    const t = this.i.inTurn
    this.i.inTurn = undefined
    this.s.lead.activity = undefined
    if (isError && (headroom(this.deps.team.myUsage(), this.now()) === 0 || /limit|rate.?limit|usage/i.test(result))) {
      if (t) this.i.redo = t
      return this.pause('limit')
    }
    if (this.i.pausedBy === 'user' && t) {
      // Cut off by Pause: do it again on Resume.
      this.i.redo = t
      return
    }
    if (t?.tag) await this.stepDone(t.tag)
    this.pump()
  }

  private async stepDone(tag: Tag) {
    const dir = this.s.project?.dir
    if (!dir) return
    switch (tag.step) {
      case 'plan': {
        // Another planning turn is coming (the lead changed something): wait for that one.
        if (this.i.queue.some((q) => q.tag?.step === 'plan') || this.s.stage !== 'plan') break
        const snap = await this.deps.hackforge(dir).catch(() => undefined)
        if (snap?.milestones.length) {
          this.s.step = 'plan-ready'
          this.log(`The plan is ready: ${snap.milestones.length} milestones. Review it and accept, or ask for changes.`, 'good')
          this.deps.notify?.('The plan is ready', snap.decision?.title ?? 'Review it in Harness', 'ask')
        } else this.askReply(tag, 'Your Claude stopped before the plan was written')
        break
      }
      case 'contracts': {
        const contracts = await this.contracts()
        if (contracts.length) return this.beginRun(contracts)
        this.i.contractTries++
        if (this.i.contractTries < 2)
          this.enqueue({
            text: '[run] There are no milestone contracts in .hackforge/contracts/ yet (M1.json, M2.json, …). Write one per milestone with its tasks, owned paths, DoD and validation commands, commit, then end your turn.',
            kind: 'run',
            tag,
          })
        else
          this.decide(
            { kind: 'contracts' },
            {
              title: 'Your Claude didn’t write the milestone contracts',
              detail: this.s.lead.lastText?.slice(-1200),
              options: ['Try again', 'Stop the run'],
              suggestion: 'Try again',
            },
          )
        break
      }
      case 'build':
        this.i.leadDone = true
        for (const t of this.s.tasks) if (tag.tasks.includes(t.id) && t.assignee.kind === 'lead') t.state = 'done'
        if (tag.tasks.length) this.log(`Your Claude built ${tag.tasks.join(', ')}.`)
        await this.advance()
        break
      case 'tasks':
        for (const t of this.s.tasks) if (tag.tasks.includes(t.id)) t.state = 'done'
        await this.advance()
        break
      case 'integrate':
        await this.integrated(tag.milestone)
        break
      case 'finish':
        await this.finished()
        break
    }
  }

  // ---------- pause, limits, the deadline ----------

  private pause(by: 'user' | 'limit') {
    this.i.pausedBy = by
    this.s.pausedReason = by === 'user' ? 'Paused by you' : 'Your Claude plan limit ran out'
    const u = this.deps.team.myUsage()
    this.s.resumeAt = by === 'limit' ? (u.resetsAt && u.resetsAt > this.now() ? u.resetsAt : this.now() + 30 * 60_000) : undefined
    this.log(
      by === 'limit'
        ? `Your plan limit ran out: the run waits until ${new Date(this.s.resumeAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The crew keeps working.`
        : 'Paused. The crew finishes what it has.',
      'warn',
    )
    if (by === 'limit') this.deps.notify?.('Team run paused', this.s.pausedReason, 'problem')
  }

  pauseRun(): Promise<void> {
    return this.serial(async () => {
      if (this.s.stage !== 'run' && this.s.stage !== 'plan') return
      this.pause('user')
      if (this.s.sessionId && this.i.inTurn) await this.deps.lead.interrupt(this.s.sessionId)
    })
  }

  resumeRun(): Promise<void> {
    return this.serial(() => {
      this.i.pausedBy = undefined
      this.s.pausedReason = undefined
      this.s.resumeAt = undefined
      this.log('Resumed.')
      this.pump()
    })
  }

  private async tick() {
    const now = this.now()
    if (this.i.pausedBy === 'limit' && this.s.resumeAt && now >= this.s.resumeAt) {
      if (headroom(this.deps.team.myUsage(), now) > 0) {
        this.i.pausedBy = undefined
        this.s.pausedReason = undefined
        this.s.resumeAt = undefined
        this.log('Your plan limit reset: the run carries on.', 'good')
      } else this.s.resumeAt = now + 10 * 60_000
    }
    const m = this.s.milestones.find((x) => x.id === this.s.current)
    if (this.s.stage === 'run' && m?.startedAt && m.budgetMs && !m.overrun && now - m.startedAt > m.budgetMs * 1.5) {
      m.overrun = true
      if (m.status === 'integrating') this.enqueue({ text: overrunMessage(m), kind: 'run' })
      this.log(`${m.id} is over its time-box by half${m.status === 'integrating' ? ': your Claude cuts scope' : ''}.`, 'warn')
    }
    if (this.s.sessionId && this.s.sessionLive && !this.deps.lead.status(this.s.sessionId)) this.s.sessionLive = false
    this.pump()
  }

  /** The lead's session is back (after a restart or a crash). */
  reconnect(sessionId: string): Promise<void> {
    return this.serial(() => {
      this.s.sessionId = sessionId
      this.s.sessionLive = true
      // A turn cut off by the restart goes again; one already sent since the session came back doesn't.
      if (this.i.inTurn && this.deps.lead.status(sessionId) === 'idle') {
        this.i.redo = this.i.inTurn
        this.i.inTurn = undefined
      }
      this.log('Your Claude is reconnected.')
      this.pump()
    })
  }

  stop(): Promise<void> {
    return this.serial(async () => {
      for (const t of this.s.tasks)
        if (t.state !== 'done' && t.assignee.kind === 'crew' && t.assignee.mission) this.deps.crew.stop(t.assignee.mission, 'The lead stopped the run.')
      if (this.s.sessionId && this.i.inTurn) await this.deps.lead.interrupt(this.s.sessionId)
      this.i.queue = []
      this.i.redo = undefined
      this.i.inTurn = undefined
      this.i.pausedBy = undefined
      Object.assign(this.s, {
        stage: 'done',
        step: 'idle',
        pausedReason: undefined,
        resumeAt: undefined,
        done: { at: this.now(), reason: 'Stopped by the lead' },
      })
      this.log('Run stopped.', 'warn')
    })
  }

  /** A fresh start (the project folder stays on disk). */
  reset(): Promise<void> {
    return this.serial(() => {
      this.s = structuredClone(EMPTY_RUN)
      this.i = structuredClone(EMPTY_INTERNAL)
      this.deps.onProject?.(undefined)
    })
  }

  // ---------- the inbox ----------

  private addRequest(e: Extract<HarnessEvent, { type: 'permission.request' }>) {
    const id = newId()
    this.i.requests[id] = { requestId: e.requestId, input: e.input }
    if (e.toolName === 'AskUserQuestion') {
      const qs = Array.isArray(e.input.questions) ? (e.input.questions as Record<string, unknown>[]) : []
      this.inbox({
        id,
        kind: 'question',
        from: 'Your Claude',
        title: String(qs[0]?.question ?? 'Your Claude has a question'),
        questions: qs.map((q) => ({
          question: String(q.question ?? ''),
          options: (Array.isArray(q.options) ? q.options : []).map((o) => String((o as { label?: unknown })?.label ?? o)),
          multiSelect: q.multiSelect === true,
        })),
      })
    } else
      this.inbox({
        id,
        kind: 'approval',
        from: 'Your Claude',
        title: e.title ?? `${e.toolName} needs your OK`,
        detail: e.description ?? describeTool(e.toolName, e.input),
      })
    this.deps.notify?.('Your Claude needs you', e.title ?? e.toolName, 'ask')
  }

  /** The lead's Claude asks the person (mcp__harness__crew_ask_driver). */
  ask(q: { question: string; options?: string[]; suggestion: string; context?: string }): string {
    void this.serial(() => {
      this.decide(
        { kind: 'ask', question: q.question, from: 'Your Claude' },
        { title: q.question, detail: q.context, options: q.options, suggestion: q.suggestion },
      )
      this.deps.notify?.('A decision for you', q.question.slice(0, 140), 'ask')
    })
    return 'Asked the lead. Carry on with other work; the answer arrives as a "[run]" message.'
  }

  private decide(d: Decision, item: Omit<InboxItem, 'id' | 'kind' | 'from' | 'at'>) {
    const id = newId()
    this.i.decisions[id] = d
    this.inbox({ id, kind: 'decision', from: d.kind === 'ask' ? d.from : 'Harness', ...item })
  }

  private askReply(tag: Tag | undefined, title: string) {
    const id = newId()
    this.i.replies[id] = tag
    this.inbox({ id, kind: 'reply', from: 'Your Claude', title, detail: this.s.lead.lastText?.slice(-1500) })
    this.deps.notify?.('Your Claude is waiting for you', title, 'ask')
  }

  private inbox(item: Omit<InboxItem, 'at'>) {
    this.s.inbox = [...this.s.inbox, { ...item, at: this.now() }]
  }

  private drop(id: string) {
    this.s.inbox = this.s.inbox.filter((x) => x.id !== id)
    delete this.i.requests[id]
    delete this.i.decisions[id]
    delete this.i.replies[id]
  }

  /** The lead's answer to an inbox item. */
  answer(id: string, a: { allow?: boolean; always?: boolean; answers?: Record<string, string>; text?: string }): Promise<void> {
    return this.serial(async () => {
      const item = this.s.inbox.find((x) => x.id === id)
      if (!item) return
      const sid = this.s.sessionId
      const req = this.i.requests[id]
      const decision = this.i.decisions[id]
      if (item.kind === 'reply') {
        const tag = this.i.replies[id]
        this.drop(id)
        if (a.text?.trim()) this.enqueue({ text: a.text.trim(), kind: 'reply', tag })
        return
      }
      this.drop(id)
      if (req && sid) {
        if (item.kind === 'question')
          this.deps.lead.respond(sid, req.requestId, { behavior: 'allow', updatedInput: { ...req.input, answers: a.answers ?? {} } })
        else
          this.deps.lead.respond(
            sid,
            req.requestId,
            a.allow ? { behavior: 'allow', always: a.always } : { behavior: 'deny', message: a.text || 'The lead said no.' },
          )
        return
      }
      if (!decision) return
      const text = (a.text ?? '').trim()
      if (decision.kind === 'ask') {
        this.enqueue({ text: answerMessage(decision.question, text || item.suggestion || 'Do what you suggested.', 'The lead'), kind: 'answer' })
        this.log(`You answered: ${(text || item.suggestion || '').slice(0, 160)}`)
      } else if (decision.kind === 'contracts') {
        if (/stop/i.test(text)) {
          Object.assign(this.s, { stage: 'done', step: 'idle', done: { at: this.now(), reason: 'Stopped by the lead' } })
          return
        }
        this.i.contractTries = 0
        this.enqueue({ text: contractsMessage(), kind: 'run', tag: { step: 'contracts' } })
      } else if (decision.kind === 'stuck') {
        const m = this.s.milestones.find((x) => x.id === decision.milestone)
        if (!m) return
        if (/keep/i.test(text)) {
          m.status = 'integrating'
          m.fixRounds = 0
          this.enqueue({ text: fixMessage(m), kind: 'run', tag: { step: 'integrate', milestone: m.id } })
        } else if (/finish/i.test(text)) {
          await this.finish(this.s.milestones.filter((x) => x.status === 'todo').map((x) => x.id))
        } else {
          this.log(`${m.id} left as it is; on to the next milestone.`, 'warn')
          await this.nextMilestone()
        }
      }
    })
  }

  // ---------- bookkeeping ----------

  private need() {
    const p = this.s.project
    if (!p) throw new Error('Create the project first (Setup).')
    return p
  }

  private contracts(): Promise<Contract[]> {
    const dir = this.need().dir
    return (this.deps.contracts ?? readContracts)(dir)
  }

  private log(text: string, tone?: 'info' | 'good' | 'warn') {
    this.s.log = [...this.s.log, { at: this.now(), text, tone }].slice(-200)
  }

  private publish() {
    this.s.next = this.nextStep()
    this.deps.push(this.s)
  }

  /** One line: what the lead should do now. */
  private nextStep(): string | undefined {
    const s = this.s
    if (s.inbox.length) return `${s.inbox.length} thing${s.inbox.length === 1 ? '' : 's'} need${s.inbox.length === 1 ? 's' : ''} you in the inbox.`
    if (s.sessionId && !s.sessionLive && (s.stage === 'plan' || s.stage === 'run')) return 'Reconnect your Claude to carry on.'
    if (s.pausedReason) return s.pausedReason
    switch (s.stage) {
      case 'team':
        return this.deps.team.me() ? 'Teammates paste the command in a terminal. Continue when everyone is in.' : 'Start the team.'
      case 'setup':
        return s.project ? 'Add the challenge and files, then Continue.' : 'Create the project.'
      case 'plan':
        return s.step === 'plan-ready'
          ? 'Review the plan: accept it to start the run, or ask for changes.'
          : s.step === 'contracts'
            ? 'Your Claude is writing the milestone contracts…'
            : 'Your Claude is planning…'
      case 'run':
        return s.step === 'finishing' ? 'Your Claude is writing the pitch, verifying and improving.' : s.current ? `Building ${s.current}.` : undefined
      case 'done':
        return 'Done. Check VERIFY.md and submit.'
    }
  }

  private load() {
    if (!this.deps.file) return
    try {
      const saved = JSON.parse(readFileSync(this.deps.file, 'utf8')) as { state?: RunState; internal?: Internal }
      if (saved.state) this.s = { ...structuredClone(EMPTY_RUN), ...saved.state, sessionLive: false }
      if (saved.internal) this.i = { ...structuredClone(EMPTY_INTERNAL), ...saved.internal }
      // Permission requests die with the process that asked.
      for (const id of Object.keys(this.i.requests)) this.drop(id)
    } catch {
      // first run
    }
  }

  private save() {
    if (!this.deps.file) return
    try {
      mkdirSync(dirname(this.deps.file), { recursive: true })
      writeFileSync(this.deps.file, JSON.stringify({ state: this.s, internal: this.i }))
    } catch {
      // not fatal
    }
  }
}

const FOLLOWED = new Set<HarnessEvent['type']>([
  'status',
  'tool.start',
  'subagent.start',
  'assistant.text',
  'permission.request',
  'permission.resolved',
  'turn.end',
])

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** "M2.3": the contract's own id when it names the milestone, else prefixed with it. */
const taskId = (c: Contract, t: ContractTask) => (t.id.toUpperCase().startsWith(c.milestone) ? t.id : `${c.milestone}.${t.id}`)

function describeTool(name: string, input: Record<string, unknown>): string {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const arg = s('command') || s('file_path') || s('pattern') || s('description') || s('url') || s('skill')
  return `${name}${arg ? `: ${arg.split('\n')[0].slice(0, 120)}` : ''}`
}
