/**
 * Crew mode: the driver's Claude splits the work and hands missions to teammates' Claudes, which run
 * them on their own laptops and Claude plans (`npx harness-crew <join code>` in a terminal, no app
 * needed). Missions, progress, permission questions and Claude-to-Claude messages travel inside each
 * member's team status, sealed with the team key, so the relay needs no changes and can't read them.
 * Code travels through the team server as encrypted git bundles: the lead's project out to the crew,
 * each mission's commits back as a branch in the lead's repository. Teammates need no GitHub access.
 */
import { relTo } from './paths'
import { headroom, isOnline, type MemberStatus, type PlanUsage } from './team'

export const CREW_PROTOCOL = 1
export const MAX_BRIEF = 12_000
export const MAX_CREW_MESSAGE = 4000
export const MAX_SUMMARY = 6000
/** Messages stay in the sender's outbox this long (receivers skip ids they've seen). */
export const MESSAGE_TTL_MS = 30 * 60_000
export const MAX_OUTBOX = 30
/** Finished missions stay in a crew member's status this long. */
export const FINISHED_TTL_MS = 3 * 3600_000
/** A sealed crew payload stays under this many JSON characters (the relay takes 256 KB per status). */
export const MAX_CREW_JSON = 120_000
/** An unanswered permission question is denied after this long, so a mission never hangs on it. */
export const ASK_TIMEOUT_MS = 10 * 60_000

/** The project crew members clone. */
export interface CrewRepo {
  /** Branch missions start from. */
  base: string
  /** Folder name for the crew member's copy. */
  name: string
  /** The base branch's commit when this copy was shared. */
  head: string
  /** The team-server file holding the project (a git bundle of every branch). */
  bundle: string
  /** The lead's GitHub URL, if it has one (shown only). */
  url?: string
}

/** Work the driver's Claude gives one crew member's Claude. */
export interface Mission {
  id: string
  title: string
  /** Everything the crew Claude needs: task, owned paths, contracts to read, yes/no done criteria, checks to run. */
  brief: string
  /** Member id it's for. */
  to: string
  /** Branch to start from (default: the repo's base); a crew branch when continuing someone's work. */
  from?: string
  /** The commit `from` was at when the mission was given (the crew member waits for a copy that has it). */
  at?: string
  /** Branch the crew member works on (it comes back to the lead under this name). */
  branch: string
  model?: string
  /** Extra commands the crew Claude may run without asking, e.g. "Bash(docker compose *)". */
  allow?: string[]
  createdAt: number
}

export type MissionState = 'queued' | 'working' | 'done' | 'blocked' | 'failed' | 'limited' | 'stopped'

export const FINAL_STATES = new Set<MissionState>(['done', 'blocked', 'failed', 'limited', 'stopped'])
export const isFinal = (s: MissionState) => FINAL_STATES.has(s)

/** A crew member's progress on a mission (in their status). */
export interface MissionProgress {
  id: string
  title: string
  state: MissionState
  /** What it's doing now, e.g. "Bash: npm test". */
  activity?: string
  startedAt?: number
  endedAt?: number
  /** Pushed branch and its head commit. */
  branch?: string
  commit?: string
  commits?: number
  files?: string[]
  /** The crew Claude's report (or why it stopped). */
  summary?: string
  /** The report was written by harness-crew, not by Claude (it ended without reporting). */
  auto?: boolean
  /** The team-server file with the mission's commits (a git bundle of the branch). */
  bundle?: string
  /** Work couldn't be sent to the lead, and why. */
  sendError?: string
  /** When the plan limit that stopped it resets (state 'limited'). */
  resetsAt?: number
  costUsd?: number
  tokens?: number
}

export interface CrewMessage {
  id: string
  from: string
  fromName: string
  /** A member id, or '*' for everyone. */
  to: string
  text: string
  mission?: string
  at: number
}

/** A crew Claude wants to run something outside its allowlist; the driver (or the crew member) decides. */
export interface CrewAsk {
  id: string
  mission: string
  tool: string
  /** e.g. "Bash: rm -rf dist" */
  summary: string
  at: number
}

export interface CrewAnswer {
  id: string
  allow: boolean
  /** Allow this kind of call for the rest of the mission. */
  always?: boolean
  note?: string
}

/** The driver's part of its status. */
export interface DriverPayload {
  role: 'driver'
  v: number
  repo?: CrewRepo
  /** Missions not picked up yet (a crew member keeps its own copy once it has one). */
  missions: Mission[]
  /** Missions to stop. */
  cancel: string[]
  answers: CrewAnswer[]
  outbox: CrewMessage[]
}

/** A crew member's part of its status. */
export interface CrewPayload {
  role: 'crew'
  v: number
  app: 'cli' | 'harness'
  version: string
  accepting: boolean
  /** Why it can't take missions right now (not signed in to Claude, no access to the repo…). */
  problem?: string
  /** The lead's project, once this laptop has a copy. */
  repo?: { dir: string; head: string }
  missions: MissionProgress[]
  asks: CrewAsk[]
  outbox: CrewMessage[]
}

export type AnyCrewPayload = DriverPayload | CrewPayload

// ---------- sanitising (payloads come from other people's machines) ----------

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const arr = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : [])
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const ID = /^[A-Za-z0-9_-]{1,64}$/
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/
const STATES = new Set<MissionState>(['queued', 'working', 'done', 'blocked', 'failed', 'limited', 'stopped'])

const SHA = /^[0-9a-f]{7,64}$/
const FILE_ID = /^[A-Za-z0-9_-]{4,80}$/

function pickRepo(x: unknown): CrewRepo | undefined {
  const o = obj(x)
  const base = str(o.base, 120)
  const name = str(o.name, 80)
  const head = str(o.head, 64)
  const bundle = str(o.bundle, 80)
  if (!base || !BRANCH.test(base) || !name || !/^[\w.-]+$/.test(name) || name.startsWith('.')) return undefined
  if (!head || !SHA.test(head) || !bundle || !FILE_ID.test(bundle)) return undefined
  const url = str(o.url, 500)
  return { base, name, head, bundle, url: url && /^https?:\/\//.test(url) ? url : undefined }
}

export function pickMission(x: unknown): Mission | null {
  const o = obj(x)
  const id = str(o.id, 64)
  const branch = str(o.branch, 120)
  const from = str(o.from, 120)
  if (!id || !ID.test(id) || !str(o.title) || !str(o.to, 64) || !branch || !BRANCH.test(branch) || !num(o.createdAt)) return null
  if (from !== undefined && !BRANCH.test(from)) return null
  const at = str(o.at, 64)
  return {
    id,
    title: str(o.title)!,
    brief: str(o.brief, MAX_BRIEF) ?? '',
    to: str(o.to, 64)!,
    from,
    at: at && SHA.test(at) ? at : undefined,
    branch,
    model: str(o.model, 80),
    allow: arr(o.allow, 30).flatMap((a) => (typeof a === 'string' && a.length < 200 ? [a] : [])),
    createdAt: num(o.createdAt)!,
  }
}

function pickProgress(x: unknown): MissionProgress | null {
  const o = obj(x)
  const id = str(o.id, 64)
  const state = str(o.state, 20) as MissionState | undefined
  if (!id || !ID.test(id) || !state || !STATES.has(state)) return null
  return {
    id,
    title: str(o.title) ?? id,
    state,
    activity: str(o.activity),
    startedAt: num(o.startedAt),
    endedAt: num(o.endedAt),
    branch: str(o.branch, 120),
    commit: str(o.commit, 64),
    commits: num(o.commits),
    files: arr(o.files, 200).flatMap((f) => (typeof f === 'string' && f.length < 400 ? [f] : [])),
    summary: str(o.summary, MAX_SUMMARY),
    auto: o.auto === true || undefined,
    bundle: str(o.bundle, 80) && FILE_ID.test(str(o.bundle, 80)!) ? str(o.bundle, 80) : undefined,
    sendError: str(o.sendError, 500),
    resetsAt: num(o.resetsAt),
    costUsd: num(o.costUsd),
    tokens: num(o.tokens),
  }
}

function pickMessage(x: unknown): CrewMessage | null {
  const o = obj(x)
  const id = str(o.id, 64)
  if (!id || !ID.test(id) || !str(o.from, 64) || !str(o.to, 64) || !str(o.text, MAX_CREW_MESSAGE) || !num(o.at)) return null
  return {
    id,
    from: str(o.from, 64)!,
    fromName: str(o.fromName, 40) ?? '?',
    to: str(o.to, 64)!,
    text: str(o.text, MAX_CREW_MESSAGE)!,
    mission: str(o.mission, 64),
    at: num(o.at)!,
  }
}

function pickAsk(x: unknown): CrewAsk | null {
  const o = obj(x)
  const id = str(o.id, 100)
  if (!id || !str(o.mission, 64) || !str(o.tool, 100) || !num(o.at)) return null
  return { id, mission: str(o.mission, 64)!, tool: str(o.tool, 100)!, summary: str(o.summary, 600) ?? '', at: num(o.at)! }
}

const list = <T>(v: unknown, max: number, pick: (x: unknown) => T | null): T[] => arr(v, max).flatMap((x) => (pick(x) ? [pick(x)!] : []))

export function pickCrewPayload(x: unknown): AnyCrewPayload | null {
  const o = obj(x)
  const v = num(o.v) ?? 0
  if (o.role === 'driver') {
    return {
      role: 'driver',
      v,
      repo: pickRepo(o.repo),
      missions: list(o.missions, 40, pickMission),
      cancel: arr(o.cancel, 60).flatMap((c) => (typeof c === 'string' && ID.test(c) ? [c] : [])),
      answers: list(o.answers, 60, (a) => {
        const r = obj(a)
        return str(r.id, 100) && typeof r.allow === 'boolean'
          ? { id: str(r.id, 100)!, allow: r.allow, always: r.always === true || undefined, note: str(r.note, 500) }
          : null
      }),
      outbox: list(o.outbox, MAX_OUTBOX, pickMessage),
    }
  }
  if (o.role === 'crew') {
    const repo = obj(o.repo)
    return {
      role: 'crew',
      v,
      app: o.app === 'harness' ? 'harness' : 'cli',
      version: str(o.version, 20) ?? '?',
      accepting: o.accepting === true,
      problem: str(o.problem, 500),
      repo: str(repo.dir, 500) && str(repo.head, 64) ? { dir: str(repo.dir, 500)!, head: str(repo.head, 64)! } : undefined,
      missions: list(o.missions, 40, pickProgress),
      asks: list(o.asks, 20, pickAsk),
      outbox: list(o.outbox, MAX_OUTBOX, pickMessage),
    }
  }
  return null
}

/** Keeps a payload under MAX_CREW_JSON by dropping the oldest messages, then old finished missions. */
export function fitPayload<T extends AnyCrewPayload>(p: T): T {
  const out = { ...p, outbox: [...p.outbox] } as T
  const size = () => JSON.stringify(out).length
  while (size() > MAX_CREW_JSON && out.outbox.length) out.outbox.shift()
  if (out.role === 'crew') {
    const c = out as CrewPayload
    c.missions = [...c.missions]
    while (size() > MAX_CREW_JSON && c.missions.some((m) => isFinal(m.state)))
      c.missions.splice(
        c.missions.findIndex((m) => isFinal(m.state)),
        1,
      )
  } else {
    const d = out as DriverPayload
    d.missions = d.missions.map((m) => ({ ...m }))
    for (const m of d.missions) if (size() > MAX_CREW_JSON) m.brief = m.brief.slice(0, 4000)
  }
  return out
}

// ---------- names ----------

export const slug = (name: string, max = 24) =>
  name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, max) || 'crew'

/** "crew/anna/m-7f3a2": the branch a crew member works on for a mission. */
export const crewBranch = (name: string, missionId: string) => `crew/${slug(name)}/${missionId}`

/** "github.com/team/app.git" or "git@github.com:team/app.git" → "app". */
export function repoName(url: string): string {
  const last =
    url
      .replace(/[\\/]+$/, '')
      .split(/[/:\\]/)
      .pop() ?? ''
  return last.replace(/\.git$/, '').replace(/[^\w.-]/g, '-') || 'project'
}

/** One line for what a crew Claude is doing: "Edit src/app.ts", "Bash: npm test". */
export function describeToolCall(name: string, input: Record<string, unknown>, cwd: string): string {
  const path = (v: unknown) => (typeof v === 'string' ? (relTo(v, cwd) ?? v) : '')
  const cut = (v: unknown, n = 80) => (typeof v === 'string' ? (v.length > n ? `${v.slice(0, n - 1)}…` : v).replace(/\s+/g, ' ') : '')
  if (name === 'Bash') return `Bash: ${cut(input.command)}`
  if (['Read', 'Edit', 'MultiEdit', 'Write'].includes(name)) return `${name} ${path(input.file_path)}`
  if (name === 'NotebookEdit') return `Edit ${path(input.notebook_path)}`
  if (name === 'Grep' || name === 'Glob') return `${name} ${cut(input.pattern, 60)}`
  if (name === 'Task' || name === 'Agent') return `Subagent: ${cut(input.description, 60)}`
  if (name === 'WebSearch') return `Search: ${cut(input.query, 60)}`
  if (name === 'WebFetch') return `Fetch ${cut(input.url, 70)}`
  if (name === 'Skill') return `Skill ${cut(input.skill ?? input.command, 50)}`
  if (name.startsWith('mcp__crew__')) return `Crew: ${name.slice(11)}`
  if (name.startsWith('mcp__')) return name.slice(5).replace('__', ': ')
  return name
}

// ---------- the driver's view ----------

export interface CrewMemberView {
  id: string
  name: string
  online: boolean
  app: 'cli' | 'harness'
  version: string
  accepting: boolean
  problem?: string
  /** 0–100: how much plan usage is left (see headroom()). */
  headroom: number
  usage: PlanUsage
  /** The mission it's running now. */
  current?: { id: string; title: string; activity?: string; since?: number }
  /** Missions waiting for it. */
  queued: number
  /** Hasn't got the project yet (nothing shared, or still downloading it). */
  waiting: boolean
}

export interface MissionView extends Mission {
  toName: string
  state: MissionState
  progress?: MissionProgress
  /** The driver session that sent it (its Claude gets the report). */
  sessionId?: string
  /** Given to someone else (their usage ran out, or they left). */
  movedTo?: string
  /** The mission this one continues. */
  continues?: string
}

export interface CrewAskView extends CrewAsk {
  fromId: string
  fromName: string
  missionTitle?: string
}

export interface CrewState {
  /** In a team: crew mode is available. */
  available: boolean
  members: CrewMemberView[]
  missions: MissionView[]
  asks: CrewAskView[]
  /** Recent messages between the Claudes, oldest first. */
  messages: CrewMessage[]
  /** What a teammate runs to join as crew. */
  joinCommand?: string
  /** Crew reports start a turn in the session that sent the mission. */
  autoReports: boolean
  /** The project crew members clone, once there's one to share. */
  project?: CrewRepo
  /** Why there's nothing to share yet, or what crew can't see (uncommitted changes). */
  projectNote?: { tone: 'warn' | 'info'; text: string }
}

export const EMPTY_CREW: CrewState = { available: false, members: [], missions: [], asks: [], messages: [], autoReports: true }

/** Crew members as the driver sees them: online first, most usage left first. */
export function crewMembers(members: MemberStatus[], payloads: Map<string, CrewPayload>, waiting: Map<string, number>, now: number): CrewMemberView[] {
  return members
    .flatMap((m) => {
      const p = payloads.get(m.id)
      if (!p) return []
      const cur = p.missions.find((x) => x.state === 'working')
      return [
        {
          id: m.id,
          name: m.name,
          online: isOnline(m, now),
          app: p.app,
          version: p.version,
          accepting: p.accepting,
          problem: p.problem,
          headroom: headroom(m.usage, now),
          usage: m.usage,
          current: cur ? { id: cur.id, title: cur.title, activity: cur.activity, since: cur.startedAt } : undefined,
          queued: (waiting.get(m.id) ?? 0) + p.missions.filter((x) => x.state === 'queued').length,
          waiting: !p.repo && !p.problem,
        },
      ]
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || b.headroom - a.headroom || a.name.localeCompare(b.name))
}

/** Can take a mission: online, set up, accepting and with usage left. */
export const canTake = (m: CrewMemberView) => m.online && m.accepting && !m.problem && m.headroom > 5

/**
 * Who gets the next mission: an idle member with the most usage left, else the one with the
 * shortest queue (then most usage). A named member wins if they can take it at all.
 */
export function pickAssignee(crew: CrewMemberView[], extra: Map<string, number> = new Map(), name?: string): CrewMemberView | undefined {
  const ok = crew.filter(canTake)
  if (name) {
    const n = name.trim().toLowerCase()
    return ok.find((m) => m.name.toLowerCase() === n) ?? ok.find((m) => m.name.toLowerCase().startsWith(n))
  }
  const load = (m: CrewMemberView) => (m.current ? 1 : 0) + m.queued + (extra.get(m.id) ?? 0)
  return [...ok].sort((a, b) => load(a) - load(b) || b.headroom - a.headroom)[0]
}

// ---------- prompts ----------

/** Commands crew Claudes run without asking (dev loops); anything else is asked of the driver. */
export const CREW_ALLOW = [
  'mcp__crew',
  'WebSearch',
  'WebFetch',
  ...[
    'npm',
    'npx',
    'pnpm',
    'yarn',
    'bun',
    'node',
    'deno',
    'tsc',
    'python',
    'python3',
    'py',
    'pip',
    'pip3',
    'uv',
    'pytest',
    'go',
    'cargo',
    'make',
    'ls',
    'cat',
    'head',
    'tail',
    'wc',
    'grep',
    'rg',
    'find',
    'mkdir',
    'touch',
    'cp',
    'mv',
    'echo',
    'which',
    'sort',
    'diff',
    'git status',
    'git diff',
    'git log',
    'git show',
    'git add',
    'git commit',
    'git branch',
    'git fetch',
    'git merge',
    'git switch',
    'git checkout',
    'git stash',
    'git restore',
    'git rev-parse',
    'git ls-files',
    'bash .hackforge/gate.sh',
  ].map((c) => `Bash(${c} *)`),
  'Bash(pwd)',
  'Bash(ls)',
  'Bash(git status)',
  'Bash(git diff)',
  'Bash(bash .hackforge/gate.sh)',
]

/** System-prompt text for a crew mission session. */
export function crewSystemPrompt(o: { me: string; driver: string; crew: string[]; mission: Mission; hackforge: boolean; builderRules?: string }): string {
  const others = o.crew.filter((n) => n !== o.me)
  return [
    `# Harness crew mission`,
    `You are ${o.me}'s Claude, working as one of ${o.driver}'s crew: ${o.driver}'s Claude leads the project and gave you this mission${others.length ? `; ${others.join(', ')} ${others.length > 1 ? 'are' : 'is'} working on other missions in parallel` : ''}. Nobody is watching this computer, so never wait for a human here: decide yourself, or ask the lead with mcp__crew__message and wait for the answer with mcp__crew__wait.`,
    `- You are on branch ${o.mission.branch}, made for this mission. Commit as you go with clear messages. Don't push, merge into or switch to other branches: harness-crew sends your branch to ${o.driver}'s Claude when you report, and it merges it.`,
    `- Stay inside the mission's scope and owned paths. If you must touch a shared file (contracts, config, package.json), keep the change minimal and say so in your report. Check mcp__crew__team before editing files someone else may own, and message them (to: their name) when your work affects theirs.`,
    `- Done means the mission's done criteria pass: run its checks and tests yourself. When finished, or blocked, call mcp__crew__report once (done / blocked / failed) with what you did, the commands you ran and their results, and anything the lead must know to merge. Then end your turn.`,
    `- Messages from the lead or teammates arrive as turns starting "[crew]". Answer with mcp__crew__message.`,
    o.hackforge
      ? `- This is a HackForge project, and you are a builder, not the lead: don't run /hackforge:run, kickoff, build, perfect or pitch, and don't edit .hackforge/ state (STATE.md, PLAN.md, LOOP.json, contracts) unless the mission says so. Hard rules in .hackforge/RULES.md and frozen contracts in .hackforge/CONTRACTS.md apply.`
      : undefined,
    o.builderRules ? `\n## Builder rules (HackForge)\n${o.builderRules}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

/** The first message of a mission session. */
export function missionMessage(m: Mission, inbox: CrewMessage[] = []): string {
  return [
    `Mission ${m.id}: ${m.title}`,
    '',
    m.brief.trim(),
    ...(inbox.length ? ['', 'Messages that arrived for you before this mission:', ...inbox.map((x) => `- ${x.fromName}: ${x.text}`)] : []),
    '',
    `When it's done (or you're blocked), commit and call mcp__crew__report.`,
  ].join('\n')
}

/** Sent when a crew Claude ends its turn without reporting. */
export const CREW_NUDGE = `[crew] You ended your turn without calling mcp__crew__report. If the mission is finished, make sure everything is committed and call mcp__crew__report (status done). If you're blocked, report blocked with what you need. Otherwise keep working; nobody at this computer can answer questions.`

/** A message from a teammate's Claude, as a turn in a session. */
export const crewMessageTurn = (m: CrewMessage) => `[crew] Message from ${m.fromName}${m.mission ? ` (about ${m.mission})` : ''}:\n${m.text}`

/** How a finished mission reads to the driver's Claude. */
export function missionReportText(m: MissionView): string {
  const p = m.progress
  const head = `${m.toName}'s Claude ${m.state === 'done' ? 'finished' : m.state === 'limited' ? 'ran out of plan usage on' : m.state === 'blocked' ? 'is blocked on' : m.state === 'stopped' ? 'stopped' : 'failed'} ${m.id} "${m.title}"`
  const lines = [head + (m.movedTo ? ` → given to ${m.movedTo}` : '')]
  if (p?.branch && p.commits && !p.sendError)
    lines.push(
      `Branch ${p.branch} is in your repository${p.commits !== undefined ? ` (${p.commits} commit${p.commits === 1 ? '' : 's'}` : ''}${p.files?.length ? `, ${p.files.length} file${p.files.length === 1 ? '' : 's'}: ${p.files.slice(0, 12).join(', ')}${p.files.length > 12 ? '…' : ''})` : p.commits !== undefined ? ')' : ''}`,
    )
  if (p?.sendError) lines.push(`Their work didn't arrive: ${p.sendError}`)
  if (p?.resetsAt) lines.push(`Their limit resets ${new Date(p.resetsAt).toISOString()}.`)
  if (p?.summary) lines.push(`${p.auto ? 'Last words (no report)' : 'Report'}: ${p.summary}`)
  return lines.join('\n')
}

/** Appended to the driver's sessions while it's in a team. */
export const CREW_GUIDE = `# Harness crew
Teammates can lend their Claude to this project (harness-crew): mcp__harness__crew_status shows who is ready and how much plan usage each has left. When crew is ready, split independent work into missions and hand them out with mcp__harness__crew_dispatch (each crew Claude starts fresh on its own laptop and branch, so its brief must carry everything: task, owned paths, contracts to read, yes/no done criteria, checks to run). Commit before dispatching: crew gets a copy of the committed branches through the team server (no GitHub needed). When a crew Claude reports, its branch appears in this repository as crew/<name>/<mission>, so never ask crew to push or merge. Keep working on your own part, collect reports with mcp__harness__crew_wait (reports also arrive as "[crew]" messages), merge each branch (git merge crew/<name>/<mission>) and run the checks. Give bigger missions to whoever has the most usage left, never two missions the same files.`
