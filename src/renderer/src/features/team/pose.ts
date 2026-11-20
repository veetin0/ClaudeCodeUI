import { agentViews, currentActivity, type Activity, type ActivityKind, type AgentView } from '@/features/agents/model'
import type { SessionState } from '@/stores/reducer'
import { CHARACTER_LABEL, characterFor, cycleMs, variantFor, type Character } from './cast'

/** What a character shows: an animation, and a bubble over its head. */
export interface Pose {
  anim: string
  bubble?: 'waiting' | 'done' | 'failed'
}

export interface TeamMember {
  key: string
  agent: AgentView
  character: Character
  variant: { outfit: number; skin: number }
  pose: Pose
  activity: Activity
  /** "Builder · GAN Generator" */
  label: string
}

/** How long a failed step keeps a character down, a finish is celebrated, and a finished agent stays on stage. */
export const ERROR_MS = 4000
export const DONE_MS = 3000
export const CHEER_MS = 3000
export const ENTER_MS = 700
export const LEAVE_MS = 15_000
export const LEAVE_FAILED_MS = 30_000
/** In the world, a finished agent heads for the door this long before it leaves. */
export const EXIT_MS = 4000

export const LOCOMOTION: Record<Character, string> = { manager: 'idle', builder: 'run', scientist: 'walk', architect: 'walk', explorer: 'scout' }
const DONE: Record<Character, string> = { manager: 'cheer', builder: 'done', scientist: 'approve', architect: 'present', explorer: 'found' }
const ERROR: Record<Character, string> = { manager: 'facepalm', builder: 'knocked', scientist: 'nervous', architect: 'knocked', explorer: 'knocked' }

/** What each subagent character does for each kind of work. */
const WORK: Record<Exclude<Character, 'manager'>, Partial<Record<ActivityKind, string>> & { fallback: string }> = {
  builder: { writing: 'build', editing: 'build', running: 'run', fallback: 'ponder' },
  scientist: { running: 'inspect', browsing: 'inspect', fallback: 'read' },
  architect: { writing: 'draft', editing: 'draft', fallback: 'ponder' },
  explorer: { running: 'scout', browsing: 'scout', fallback: 'look' },
}

export interface PoseContext {
  now: number
  /** When the main agent last handed out work (its newest subagent's start). */
  lastSpawnAt?: number
  /** The main agent's last finished turn. */
  lastTurn?: { endedAt: number; isError: boolean }
  /** Some subagent is still working (the manager keeps an eye on the time). */
  teamBusy?: boolean
}

/** A step that failed in the last few seconds and that nothing has followed yet. */
export function failedStep(a: AgentView, now: number): AgentView['tools'][number] | undefined {
  let last: AgentView['tools'][number] | undefined
  for (const t of a.tools) if (t.status !== 'running' && t.endedAt !== undefined && (!last || t.endedAt > (last.endedAt ?? 0))) last = t
  if (!last || last.status !== 'error' || now - last.endedAt! >= ERROR_MS) return undefined
  return a.tools.some((t) => t.status === 'running' && t.startedAt > last!.endedAt!) ? undefined : last
}
const recentError = (a: AgentView, now: number) => failedStep(a, now) !== undefined

export function poseFor(a: AgentView, c: Character, ctx: PoseContext): Pose {
  const { now } = ctx
  const act = currentActivity(a)
  if (c === 'manager') {
    if (a.state === 'waiting') return { anim: 'crossed', bubble: 'waiting' }
    if (ctx.lastSpawnAt !== undefined && now >= ctx.lastSpawnAt && now - ctx.lastSpawnAt < cycleMs('manager', 'point_r')) return { anim: 'point_r' }
    if (recentError(a, now)) return { anim: 'facepalm' }
    if (a.state === 'running') return { anim: act.kind === 'running' || act.kind === 'delegating' ? 'watch' : 'plan' }
    if (ctx.teamBusy) return { anim: 'watch' }
    if (ctx.lastTurn && !ctx.lastTurn.isError && now - ctx.lastTurn.endedAt < CHEER_MS) return { anim: 'cheer', bubble: 'done' }
    return { anim: 'idle' }
  }
  if (a.state === 'waiting') return { anim: 'idle', bubble: 'waiting' }
  if (a.state === 'failed') return { anim: ERROR[c], bubble: 'failed' }
  if (a.state === 'completed') return { anim: a.endedAt !== undefined && now - a.endedAt < DONE_MS ? DONE[c] : 'idle', bubble: 'done' }
  if (a.state === 'stopped' || a.state === 'idle') return { anim: 'idle' }
  if (a.startedAt !== undefined && now >= a.startedAt && now - a.startedAt < ENTER_MS) return { anim: LOCOMOTION[c] }
  if (recentError(a, now)) return { anim: ERROR[c] }
  const work = WORK[c]
  return { anim: work[act.kind] ?? work.fallback }
}

/** Whether a subagent is still on stage: working, waiting, or recently finished. */
export function onStage(a: AgentView, now: number): boolean {
  if (a.id === null) return true
  if (a.state === 'running' || a.state === 'waiting') return true
  if (a.state === 'stopped' || a.endedAt === undefined) return false
  return now - a.endedAt < (a.state === 'failed' ? LEAVE_FAILED_MS : LEAVE_MS)
}

/** The team at a moment: the manager first, then the subagents on stage, oldest first. */
export function teamOf(s: SessionState, now: number, opts: { all?: boolean } = {}): TeamMember[] {
  const views = agentViews(s)
  const subs = Object.values(s.subagents)
  const spawned = subs.filter((x) => s.tools[x.id]?.agentId == null).map((x) => x.startedAt)
  const ctx: PoseContext = {
    now,
    lastSpawnAt: spawned.length ? Math.max(...spawned) : undefined,
    lastTurn: s.lastTurn,
    teamBusy: subs.some((x) => x.status === 'running'),
  }
  return views
    .filter((a) => opts.all || onStage(a, now))
    .map((a) => {
      const character = characterFor(a.subagentType, a.id === null)
      return {
        key: a.key,
        agent: a,
        character,
        variant: variantFor(a.id ?? `main:${s.id}`),
        pose: poseFor(a, character, ctx),
        activity: currentActivity(a),
        label: a.id === null ? `${CHARACTER_LABEL.manager} · main agent` : `${CHARACTER_LABEL[character]} · ${a.role}`,
      }
    })
}

/**
 * Who gets one of `n` places when the team doesn't fit: the manager always, then whoever needs
 * you, then the busy ones newest first (the one just handed work is the one the manager points
 * at), then the finished ones. Everyone keeps their order on stage.
 */
export function pickShown(team: TeamMember[], n: number): TeamMember[] {
  if (team.length <= n) return team
  const [main, ...subs] = team
  const rank = (m: TeamMember) => (m.agent.state === 'waiting' ? 0 : m.agent.state === 'running' ? 1 : 2)
  const keep = new Set(
    [...subs]
      .sort((a, b) => rank(a) - rank(b) || (b.agent.startedAt ?? 0) - (a.agent.startedAt ?? 0))
      .slice(0, Math.max(0, n - 1))
      .map((m) => m.key),
  )
  return [main, ...subs.filter((m) => keep.has(m.key))]
}

/** The next moment a time-based pose changes (a one-shot ending, someone leaving), so a tick is only needed until then. */
export function nextChange(s: SessionState, now: number): number | undefined {
  const times: number[] = []
  const add = (t: number | undefined) => t !== undefined && t > now && times.push(t)
  for (const x of Object.values(s.subagents)) {
    add(x.startedAt + ENTER_MS)
    add(x.startedAt + cycleMs('manager', 'point_r'))
    if (x.endedAt !== undefined) {
      add(x.endedAt + DONE_MS)
      add(x.endedAt + (x.status === 'failed' ? LEAVE_FAILED_MS : LEAVE_MS))
      add(x.endedAt + (x.status === 'failed' ? LEAVE_FAILED_MS : LEAVE_MS) - EXIT_MS)
    }
  }
  for (const t of Object.values(s.tools)) if (t.status === 'error' && t.endedAt !== undefined) add(t.endedAt + ERROR_MS)
  if (s.lastTurn) add(s.lastTurn.endedAt + CHEER_MS)
  return times.length ? Math.min(...times) : undefined
}
