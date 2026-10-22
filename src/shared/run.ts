/**
 * Team run: the one path through Harness for a hackathon. Team → Setup → Plan → Run → Done.
 *
 * The lead (driver) starts a team, teammates join from a terminal (harness-crew), the lead drops in
 * the challenge, HackForge plans, and on Run Harness itself drives the build milestone by milestone:
 * it splits each milestone's tasks between the crew and the lead's own Claude by usage left, tells
 * the lead's Claude when to build its part, when to integrate and verify, and when to finish. Claude
 * does the thinking; Harness makes sure the steps happen, in order, on time.
 */

import { CREW_ALLOW } from './crew'

export type RunStage = 'team' | 'setup' | 'plan' | 'run' | 'done'
export const RUN_STAGES: RunStage[] = ['team', 'setup', 'plan', 'run', 'done']

export type ClaudePlan = 'pro' | 'max' | 'team' | 'api'

export interface RunProject {
  dir: string
  name: string
  /** ISO with offset. */
  deadline?: string
  plan: ClaudePlan
  /** Public GitHub repository, once created. */
  github?: string
  githubProblem?: string
  createdAt: number
}

export interface RunTask {
  /** "M1.2" */
  id: string
  milestone: string
  role?: string
  owned: string[]
  /** Who does it: a crew member (with their mission) or the lead's own Claude. */
  assignee: { kind: 'crew'; id: string; name: string; mission?: string } | { kind: 'lead' }
  state: 'waiting' | 'working' | 'done' | 'failed'
  attempts: number
  note?: string
}

export interface RunMilestone {
  id: string
  goal: string
  status: 'todo' | 'building' | 'integrating' | 'done' | 'stuck'
  startedAt?: number
  endedAt?: number
  /** Share of the time left when the run started. */
  budgetMs?: number
  overrun?: boolean
  fixRounds: number
}

/** Something that needs the lead (the person). */
export interface InboxItem {
  id: string
  kind: 'approval' | 'question' | 'crew-approval' | 'decision' | 'reply'
  /** "Your Claude", "Anna's Claude", "Harness" */
  from: string
  title: string
  detail?: string
  /** AskUserQuestion: each question with its options. */
  questions?: { question: string; options: string[]; multiSelect?: boolean }[]
  /** Decisions: the choices, and Claude's suggested answer. */
  options?: string[]
  suggestion?: string
  at: number
}

export interface RunLogEntry {
  at: number
  text: string
  tone?: 'info' | 'good' | 'warn'
}

export type RunStep = 'idle' | 'planning' | 'plan-ready' | 'contracts' | 'building' | 'integrating' | 'finishing' | 'paused'

export interface RunState {
  stage: RunStage
  project?: RunProject
  /** The lead's Claude session. */
  sessionId?: string
  /** That session is running in this Harness (false after a restart until it's reconnected). */
  sessionLive: boolean
  step: RunStep
  /** Why the run is paused (the lead's plan limit, or the user). */
  pausedReason?: string
  resumeAt?: number
  milestones: RunMilestone[]
  tasks: RunTask[]
  current?: string
  startedAt?: number
  inbox: InboxItem[]
  log: RunLogEntry[]
  done?: { at: number; reason: string }
  /** The lead's Claude right now. */
  lead: { status?: string; activity?: string; lastText?: string }
  /** What Harness wants the lead to do next, in one line. */
  next?: string
}

export type FileKind = 'challenge' | 'files' | 'private'

/** The Setup screen: the challenge text and what's in each drop zone. */
export interface SetupInfo {
  challenge: string
  files: Record<FileKind, string[]>
  /** The challenge has something in it (text or files). */
  ready: boolean
}

export const EMPTY_RUN: RunState = { stage: 'team', sessionLive: false, step: 'idle', milestones: [], tasks: [], inbox: [], log: [], lead: {} }

// ---------- contracts (HackForge's per-milestone plan files) ----------

export interface ContractTask {
  id: string
  role?: string
  owned: string[]
  owner?: string
}

export interface Contract {
  milestone: string
  goal: string
  owned: string[]
  dod: { id?: string; check?: string; command?: string }[]
  validation: string[]
  status?: string
  tasks: ContractTask[]
}

const strs = (v: unknown, max = 60) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [])

/** A `.hackforge/contracts/M<n>.json`, or null if it isn't one. */
export function pickContract(x: unknown): Contract | null {
  const o = (x && typeof x === 'object' ? x : null) as Record<string, unknown> | null
  if (!o || typeof o.milestone !== 'string' || !/^M\d+$/i.test(o.milestone)) return null
  const tasks = (Array.isArray(o.tasks) ? o.tasks : []).flatMap((t, i) => {
    const r = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>
    return [
      {
        id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : `${o.milestone}.${i + 1}`,
        role: typeof r.role === 'string' ? r.role.slice(0, 40) : undefined,
        owned: strs(r.owned),
        owner: typeof r.owner === 'string' ? r.owner.slice(0, 60) : undefined,
      },
    ]
  })
  return {
    milestone: (o.milestone as string).toUpperCase(),
    goal: typeof o.goal === 'string' ? o.goal.slice(0, 300) : '',
    owned: strs(o.owned),
    dod: (Array.isArray(o.dod) ? o.dod : []).slice(0, 30).flatMap((d) => {
      const r = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
      return [
        {
          id: typeof r.id === 'string' ? r.id : undefined,
          check: typeof r.check === 'string' ? r.check.slice(0, 400) : undefined,
          command: typeof r.command === 'string' ? r.command.slice(0, 400) : undefined,
        },
      ]
    }),
    validation: strs(o.validation_commands, 20),
    status: typeof o.status === 'string' ? o.status : undefined,
    tasks: tasks.length ? tasks : [{ id: `${(o.milestone as string).toUpperCase()}.1`, owned: strs(o.owned) }],
  }
}

export const milestoneNumber = (id: string) => Number(/\d+/.exec(id)?.[0] ?? 0)

/** The brief a crew member's Claude gets for one task: everything it needs, nothing it can't open. */
export function taskBrief(c: Contract, t: ContractTask): string {
  const lines = [
    `HackForge milestone ${c.milestone}: ${c.goal}`,
    `Your task: ${t.id}${t.role ? ` (${t.role})` : ''}.`,
    t.owned.length ? `Owned paths (change only these): ${t.owned.join(', ')}` : 'Owned paths: see the milestone contract.',
    '',
    'Done means (yes/no; run each command and quote its result):',
    ...(c.dod.length
      ? c.dod.map((d) => `- ${d.id ? `${d.id}: ` : ''}${d.check ?? ''}${d.command ? ` — \`${d.command}\`` : ''}`)
      : ['- the milestone contract’s DoD']),
    ...(c.validation.length ? ['', `Validation commands: ${c.validation.map((v) => `\`${v}\``).join(', ')}`] : []),
    '',
    `Read first: .hackforge/CONTRACTS.md, .hackforge/contracts/${c.milestone}.json, .hackforge/RULES.md, .hackforge/DIRECTIVES.md, and DESIGN.md for UI work.`,
    'Work as hackforge:builder (its rules are in your system prompt): stay in your owned paths, write tests, never weaken a check, commit as you go.',
    'Report with mcp__crew__report: put the worker report (files changed, each DoD item with the command output, assumptions, anything not finished) in the summary.',
  ]
  return lines.join('\n')
}

// ---------- what Harness tells the lead's Claude ----------

/** Appended to the lead session's system prompt during a team run. */
export const RUN_GUIDE = `# Harness team run
You are the lead's Claude in a Harness team run, and Harness drives the build: it splits each milestone's tasks between you and the crew (teammates' Claudes on their own laptops), and tells you with "[run]" messages when to build your part, when to integrate and verify, and when to finish. Follow those messages exactly and end your turn when a step is done; don't start the next milestone or hand out build tasks yourself unless a message says so. Plan with HackForge as usual until the plan checkpoint, then end your turn there with a short summary (no AskUserQuestion: the lead accepts the plan in Harness). While planning, give research and architect work to ready crew (mcp__harness__crew_dispatch, then mcp__harness__crew_wait before you decide) to save your own usage.
- Crew questions reach you as "[crew]" messages: answer routine ones yourself with mcp__harness__crew_message. For a real decision (scope, plan or rule changes, anything you'd checkpoint), use mcp__harness__crew_ask_driver with your suggested answer and carry on with other work; the answer comes back as a "[run]" message.
- Create and change files with the Write and Edit tools, not shell redirects or heredocs: those stop for the lead's approval. Keep shell commands simple so they match the allowlist: you're already in the project folder, so no "cd …;" prefix, one command per call, and HackForge's scripts by their full path (bash /…/scripts/hf-run.sh …), not through shell variables.
- Never ask the user to approve the permissions allowlist: apply HackForge's proposal (tools permissions --apply) and say so. The lead approves anything unusual from the Harness inbox.`

/**
 * What the lead's Claude may run without asking in a team run: the crew's dev commands plus the
 * shell basics HackForge's own scripts and builders use. Anything else comes to the lead's inbox;
 * HackForge's guard hook and the private-files rules still apply on top.
 */
export const RUN_ALLOW = [
  ...CREW_ALLOW.filter((t) => t !== 'mcp__crew'),
  ...[
    'bash',
    'sh',
    'cd',
    'chmod',
    'sed',
    'awk',
    'tr',
    'cut',
    'xargs',
    'test',
    'printf',
    'tee',
    'jq',
    'basename',
    'dirname',
    'date',
    'env',
    'git init',
    'git worktree',
    'git tag',
    'git reset --soft',
    'git cherry-pick',
    'git rm',
    'git mv',
  ].map((c) => `Bash(${c} *)`),
]

export const PLAN_PROMPT = `/hackforge:run --profile auto
(Harness team run: plan only. Stop at the plan checkpoint after writing PLAN.md: end your turn with a short summary of the decision and the milestones, without AskUserQuestion. The lead accepts the plan in Harness.)`

export function contractsMessage(): string {
  return `[run] The lead accepted the plan. Now do HackForge build step 2 only: freeze CONTRACTS.md, write .hackforge/contracts/M<n>.json for every milestone with its tasks (id, role, owned paths), DoD and validation commands, write gate.sh, apply the permissions proposal, and commit everything to the current branch. Then end your turn: Harness runs the milestones from here.`
}

export function buildMessage(m: { id: string; goal: string }, crew: { task: string; name: string }[], mine: RunTask[], budget?: string): string {
  return [
    `[run] Milestone ${m.id} — ${m.goal} — has started${budget ? ` (time-box ${budget})` : ''}.`,
    crew.length
      ? `The crew has: ${crew.map((c) => `${c.task} → ${c.name}`).join(', ')}. Their work comes back as local branches; don't touch those paths.`
      : 'The crew has nothing in this milestone.',
    mine.length
      ? `Your tasks: ${mine.map((t) => `${t.id}${t.role ? ` (${t.role})` : ''}${t.owned.length ? ` [${t.owned.join(', ')}]` : ''}`).join('; ')}. Build them now as HackForge's build step 3 says (hackforge:builder agents in worktrees, in parallel, each with its owned paths, the contract and the DoD), merge your own builders' branches, commit, then end your turn. Don't merge crew branches yet.`
      : 'You have no build tasks in this milestone: end your turn and wait for the integration message.',
  ].join('\n')
}

export function taskBackMessage(t: RunTask, why: string): string {
  return `[run] ${t.id}${t.role ? ` (${t.role})` : ''} is yours now: ${why} Build it as HackForge's build step 3 says (owned paths: ${t.owned.join(', ') || 'see the contract'}), commit, then end your turn.`
}

export function integrateMessage(m: { id: string; goal: string }, branches: string[], reports: string[]): string {
  return [
    `[run] All of ${m.id}'s work is in.${branches.length ? ` Crew branches in this repository: ${branches.join(', ')}.` : ''}`,
    ...(reports.length ? ['Their reports:', ...reports.map((r) => `---\n${r}`), '---'] : []),
    `Now run hackforge:integrator for ${m.id} (scope check each branch, merge in dependency order, run the gate, walk the demo path), then hackforge:verify on ${m.id}. Fix what fails, up to the contract's max_iterations. Then update STATE.md, set .hackforge/contracts/${m.id}.json "status" to "done", regenerate the views and commit "${m.id}: …". End your turn when ${m.id} is green, or say exactly what blocks it.`,
  ].join('\n')
}

export function fixMessage(m: { id: string }, status?: string): string {
  return `[run] ${m.id} isn't marked done yet (contract status: ${status ?? 'not set'}). Finish it: fix what's failing, run the gate and verify again, set "status": "done" in .hackforge/contracts/${m.id}.json and commit. If it can't be done, say exactly why and what you'd cut, then end your turn.`
}

export function overrunMessage(m: { id: string }): string {
  return `[run] ${m.id} is over its time-box by half. Cut scope from DECISION.md's cut list (note it there), keep the last green state submittable, and finish ${m.id} with what works.`
}

export function finishMessage(loop: boolean, skipped: string[]): string {
  return [
    skipped.length
      ? `[run] Time is short, so the remaining milestones (${skipped.join(', ')}) are cut: note that in DECISION.md.`
      : '[run] All planned milestones are done.',
    `Now run hackforge:pitch and hackforge:verify final${loop ? ', then hackforge:perfect (the improvement loop). In the loop you may hand independent fixes to the crew with mcp__harness__crew_dispatch while you work on one yourself' : ''}. End your turn when ${loop ? 'the loop ends' : 'verify final is written'}.`,
  ].join(' ')
}

export const answerMessage = (question: string, answer: string, by: string) => `[run] ${by} answered your question "${question.slice(0, 200)}": ${answer}`

/** "2 h 15 min" */
export function formatDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}
