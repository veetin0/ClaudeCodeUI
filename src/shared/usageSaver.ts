import type { PermissionMode } from './events'

/**
 * Usage saver: spend Claude plan usage where it buys quality, and cut what buys nothing.
 *
 * - Auto model: Opus for turns that need judgement (planning, design, debugging, review, big requests,
 *   anything that didn't work), Sonnet for carrying out agreed work and routine steps. Opus comes back
 *   by itself when Sonnet struggles. Effort stays at each model's default, so reasoning depth isn't cut.
 * - Compact between tasks: a long conversation is re-read on every step, so it's compacted before your
 *   next message (never mid-task, never while you're debugging).
 * - Skip generated files: whole-file reads of lockfiles, minified bundles and build output are refused
 *   with a hint to search them or read a range instead.
 * - Lean output: quiet command output and replies that lead with the answer.
 */
export interface UsageSaverSettings {
  enabled: boolean
  /** New sessions start on Auto (the model picker can still pick one model for a session). */
  autoModel: boolean
  compact: boolean
  skipGenerated: boolean
  leanOutput: boolean
}

export const DEFAULT_USAGE_SAVER: UsageSaverSettings = { enabled: true, autoModel: true, compact: true, skipGenerated: true, leanOutput: true }

/** Model value meaning "the Usage saver picks per turn". */
export const AUTO_MODEL = 'auto'

export type SaverTier = 'opus' | 'sonnet'
export type TurnKind = 'think' | 'build'

/** What the saver did, as recorded in the session's event log. */
export type SaverNote =
  /** The session's saver settings (at start, and when the model picker changes Auto on or off). */
  | { kind: 'config'; enabled: boolean; auto: boolean; compact: boolean; skipGenerated: boolean; leanOutput: boolean }
  /** The model for a turn (or a switch in the middle of one). `text` is shown to the user. */
  | { kind: 'route'; model: SaverTier; turn: TurnKind; reason: string; switched: boolean; held?: boolean; midTurn?: boolean; text: string }
  /** The saver compacted the conversation before a message. */
  | { kind: 'compact'; preTokens: number; postTokens?: number }
  /** A whole-file read of a generated file was refused. */
  | { kind: 'skip'; path: string; bytes: number; what: GeneratedKind }
  | { kind: 'notice'; text: string }

export function tierOf(model?: string): SaverTier | undefined {
  const m = model?.toLowerCase() ?? ''
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  return undefined
}

export const tierLabel = (t: SaverTier) => (t === 'opus' ? 'Opus' : 'Sonnet')

/** Compact between tasks once the conversation holds this many tokens: half the window, at most 100k. */
export function compactThreshold(contextWindow: number): number {
  return Math.min(Math.round((contextWindow || 200_000) * 0.5), 100_000)
}

/** Failed tool calls in a row on Sonnet before Opus takes over mid-task. */
export const STRUGGLE_LIMIT = 3

/** Sent as a message to compact; says what the summary must keep so the work continues as before. */
export const COMPACT_COMMAND =
  '/compact Keep everything needed to continue the work exactly as before: the goal and constraints, decisions made and why, ' +
  'files changed and what each change does, the commands that build, run and test the project, unresolved errors quoted exactly, and the next steps.'

/** Appended to the system prompt with "Lean output" on. Trims waste only; never the work. */
export const LEAN_OUTPUT_PROMPT = `# Usage saver (Harness)
The user's Claude usage is limited (a plan limit or an API budget). Work exactly as thoroughly as you otherwise would; these rules only cut waste:
- Command output: run tests, builds and installs in their quiet or summary mode when they have one. When you only need the end or the failures of long output, pipe it through \`tail -n 80\` or \`grep\`. When diagnosing a failure, read all the output you need.
- Files: search (Grep, Glob) before opening large files, read only the line ranges you need from files over ~800 lines, and don't re-read a file already in this conversation unless it changed.
- Generated files (lockfiles, minified bundles, source maps, build output): search them or read a range, never the whole file.
- Replies: lead with the answer or result. Don't restate the request or narrate each step between tool calls. Finish a task with a short summary: what changed, how you checked it, and anything the user must do. Code, commands, error messages and warnings stay complete and exact.`

// ---------------------------------------------------------------------------------------------
// Picking the model for a turn
// ---------------------------------------------------------------------------------------------

export interface RouteInput {
  prompt: string
  /** The model the session is on now (undefined before the first turn of an Auto session). */
  current?: SaverTier
  firstTurn: boolean
  permissionMode: PermissionMode
  contextTokens: number
  contextWindow: number
  opusAvailable: boolean
  /** This project's HackForge settings pick Sonnet for the main session (Pro plan / lean profile). */
  hackforgeLean: boolean
}

export interface RouteDecision {
  model: SaverTier
  kind: TurnKind
  /** Short, user-facing: "debugging", "a routine step"… */
  reason: string
  /** The user reported something not working: keep the details (don't compact) and use Opus. */
  escalation?: boolean
  /** Wanted Sonnet but stays on Opus: switching now would re-read a long conversation uncached. */
  held?: boolean
  /** A command (/compact, /context…) that runs on whatever model is current. */
  passthrough?: boolean
}

type Classified = { kind: TurnKind | 'keep'; reason: string; escalation?: boolean; passthrough?: boolean }

/** HackForge commands that only read or write its notes. */
const HF_LIGHT = new Set(['help', 'init', 'status', 'views', 'team', 'rules', 'focus', 'retro'])

const THINK: [RegExp, string][] = [
  [/\b(plan|plans|planning|roadmap|spec|specification)\b/i, 'planning'],
  [/\b(design|architect\w*|approach(es)?|strateg\w*|trade-?offs?|pros and cons|best way|how should (we|i)|which (option|approach|library|framework|stack)|should (we|i) use)\b/i, 'a design decision'],
  [/\b(debug\w*|root cause|diagnos\w*|investigat\w*|figure out|race condition|deadlock|memory leak|flaky|intermittent\w*|why (does|is|did|do|are|isn'?t|doesn'?t|won'?t))\b/i, 'debugging'],
  [/\b(review\w*|audit\w*|analy[sz]\w*|evaluat\w*|compare|assess\w*|research\w*|critique)\b/i, 'review or analysis'],
  [/\b(refactor\w*|restructur\w*|migrat\w*|rewrite|redesign\w*|from scratch|overhaul\w*)\b/i, 'a structural change'],
  [/\b(security|secure|vulnerab\w*|exploit\w*|performance|optimi[sz]\w*|scalab\w*|concurren\w*|algorithm\w*)\b/i, 'hard engineering'],
  // Finnish (no \b: JavaScript word boundaries don't know ä/ö).
  [/(suunnittel|arkkitehtuur|selvit|tutki|analysoi|vertaa|arvioi|optimoi|refaktor|miksi)/i, 'planning or analysis'],
]

/** "It didn't work" in its many forms, plus pasted errors. */
const FAILURE: RegExp[] = [
  /\b(still|again|keeps?)\b[^.!?\n]{0,40}\b(broken|fail\w*|wrong|errors?|crash\w*|hang\w*|not work\w*|doesn'?t work|same)\b/i,
  /\b(doesn'?t|does not|didn'?t|did not|isn'?t|is not|aren'?t|won'?t|wasn'?t|can'?t|cannot)\s+(work\w*|fix\w*|help\w*|run\w*|compil\w*|build\w*|load\w*|start\w*|render\w*|pass\w*|connect\w*)\b/i,
  /\b(same|another|new|weird|strange) (error|issue|problem|bug|crash|failure)\b/i,
  /\b(broke|broken|regress\w*|crash(es|ed|ing)?|exception|traceback|stack trace|segfault)\b/i,
  /\b[A-Z][A-Za-z]*(Error|Exception)\b/,
  /(ei toimi|ei vieläkään|ei mene läpi|virhe|rikki|kaatu)/i,
]

const END = '(?=$|[\\s.,!?:;])'
/** Agreeing to go ahead with what was discussed. */
const CONFIRM = new RegExp(
  `^(y|yes|yep|yeah|yup|ok|okay|k|sure|go|go ahead|go for it|do it|do that|continue|proceed|carry on|keep going|sounds good|looks good|lgtm|approved?|ship it|perfect|great|nice|thanks|thank you|kyllä|joo|juu|jatka|jatketaan|tee se|hyvä|selvä)${END}`,
  'i',
)
/** Words like "the plan" that appear when agreeing to a plan, not asking for one. */
const AGREED_PLAN = /\b(the|your|this|that) plan\b|\bplan (is )?(approved|looks good|ok|okay|sounds good)\b/gi

const LEAD_IN = '^(?:(?:please|pls|now|then|also|and|ok|okay|can you|could you)[\\s,]+)*'
/** Mechanical steps. */
const ROUTINE = new RegExp(
  `${LEAD_IN}(run|re-?run|commit|push|pull|merge|rebase|stash|tag|rename|format|lint|install|uninstall|bump|upgrade|remove|delete|move|copy|show|list|print|open|stop|restart|deploy|undo|revert|tidy|clean ?up)${END}`,
  'i',
)
/** Small, local edits (only when the request is short). */
const SMALL_EDIT = new RegExp(
  `${LEAD_IN}(add|update|change|replace|translate|reword|fix (the |a |this )?(typo|typos|lint|imports?|formatting|indentation|spacing|wording))${END}`,
  'i',
)

/** What kind of turn a message asks for, before considering the session's state. */
export function classifyPrompt(text: string, o: { firstTurn: boolean; permissionMode: PermissionMode; hackforgeLean: boolean }): Classified {
  // macOS turns ' into ’ as you type.
  const p = text.trim().replace(/[\u2018\u2019]/g, "'")
  const hf = /^\/hackforge:([\w-]+)/i.exec(p)
  if (hf) {
    if (HF_LIGHT.has(hf[1].toLowerCase())) return { kind: 'build', reason: 'HackForge bookkeeping' }
    return o.hackforgeLean
      ? { kind: 'build', reason: 'HackForge runs it, choosing the model for each of its agents (Opus for architects and the advisor)' }
      : { kind: 'think', reason: 'a HackForge run outside its Pro profile' }
  }
  if (p.startsWith('/')) return { kind: 'keep', reason: 'a command', passthrough: true }
  if (o.permissionMode === 'plan') return { kind: 'think', reason: 'plan mode' }
  if (FAILURE.some((r) => r.test(p))) {
    return o.firstTurn ? { kind: 'think', reason: 'debugging' } : { kind: 'think', reason: 'something isn’t working', escalation: true }
  }
  const lines = p.split('\n').filter((l) => l.trim()).length
  if (p.length >= 600 || lines >= 5) return { kind: 'think', reason: 'a detailed request' }
  const confirm = CONFIRM.test(p)
  const forThink = confirm ? p.replace(AGREED_PLAN, '') : p
  for (const [re, why] of THINK) if (re.test(forThink)) return { kind: 'think', reason: why }
  if (o.firstTurn && p.length >= 300) return { kind: 'think', reason: 'a substantial new task, so Opus sets the approach' }
  // "yes" plus a few words agrees to what was discussed; "yes, and now build X…" is a new request.
  if (confirm && p.replace(CONFIRM, '').replace(/^[\s,.!]+/, '').length <= 60) return { kind: 'build', reason: 'carrying out what was agreed' }
  if (p.length <= 140 && ROUTINE.test(p)) return { kind: 'build', reason: 'a routine step' }
  if (p.length <= 100 && SMALL_EDIT.test(p)) return { kind: 'build', reason: 'a small change' }
  if (p.length <= 60) return { kind: 'build', reason: 'a short instruction' }
  return o.firstTurn ? { kind: 'build', reason: 'a well-defined task' } : { kind: 'keep', reason: 'continuing the current task' }
}

/**
 * The model for the next turn. Quality comes first: moving up to Opus is never held back. Moving down
 * to Sonnet waits while the conversation is long, because the switch would re-read all of it once
 * (compacting first makes the switch cheap).
 */
export function routeTurn(i: RouteInput): RouteDecision {
  const c = classifyPrompt(i.prompt, i)
  if (c.passthrough) return { model: i.current ?? 'sonnet', kind: i.current === 'opus' ? 'think' : 'build', reason: c.reason, passthrough: true }
  const kind: TurnKind = c.kind === 'keep' ? (i.current === 'opus' ? 'think' : 'build') : c.kind
  const out: RouteDecision = { model: kind === 'think' ? 'opus' : 'sonnet', kind, reason: c.reason, ...(c.escalation ? { escalation: true } : {}) }
  if (out.model === 'opus' && !i.opusAvailable) return { ...out, model: 'sonnet', reason: `${c.reason} (Opus isn’t available on this account)` }
  if (out.model === 'sonnet' && i.current === 'opus' && i.contextTokens >= compactThreshold(i.contextWindow)) return { ...out, model: 'opus', held: true }
  return out
}

/** One line for the transcript and the status chip. */
export function routeText(d: RouteDecision, contextTokens: number): string {
  if (d.held) {
    return `Staying on Opus for ${d.reason}: switching now would re-read the whole ${formatK(contextTokens)}-token conversation. Sonnet takes over after the next compaction.`
  }
  return d.model === 'opus' ? `Opus for this turn: ${d.reason}.` : `Sonnet for this turn: ${d.reason}. Opus steps in for planning, debugging and anything that doesn’t work.`
}

const formatK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

// ---------------------------------------------------------------------------------------------
// Generated files
// ---------------------------------------------------------------------------------------------

export type GeneratedKind = 'lockfile' | 'minified file' | 'source map' | 'build output'

/** Smaller files are cheap enough to read whole. */
export const GUARD_MIN_BYTES = 64 * 1024

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|go\.sum|Podfile\.lock|flake\.lock)$/
const MINIFIED = /\.min\.(js|mjs|cjs|css)$/i
const SOURCE_MAP = /\.(js|mjs|cjs|css)\.map$/i
const BUILD_DIR = /(^|\/)(dist|build|out|\.next|\.nuxt|\.output|\.svelte-kit|\.turbo|\.parcel-cache|\.vite|coverage|storybook-static)\//

/**
 * Whether a file is generated. `path` is relative to the project (forward slashes); for files outside
 * the project pass just the file name, so a folder named "build" above the project doesn't count.
 */
export function generatedKind(path: string): GeneratedKind | null {
  const p = path.replace(/\\/g, '/')
  if (LOCKFILE.test(p)) return 'lockfile'
  if (MINIFIED.test(p)) return 'minified file'
  if (SOURCE_MAP.test(p)) return 'source map'
  if (BUILD_DIR.test(p)) return 'build output'
  return null
}

/** Tokens a text file of this size costs to read, roughly. */
export const approxTokens = (bytes: number) => Math.round(bytes / 4)

/** What Claude is told when a whole-file read is refused. */
export function skipReason(name: string, what: GeneratedKind, bytes: number): string {
  return (
    `Usage saver (Harness): ${name} is a ${what} of ${Math.round(bytes / 1024)} KB (about ${formatK(approxTokens(bytes))} tokens), ` +
    'so it isn’t read whole. Search it with Grep (or grep in Bash), or Read a line range with offset and limit.'
  )
}
