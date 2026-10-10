/**
 * HackForge integration: types and parsers for the plugin's project memory (`.hackforge/`) and
 * config (`challenge/hackforge.yaml`), matching the formats its skills and templates write
 * (kickoff/templates/*.md, verify/SKILL.md, perfect/SKILL.md, scripts/hf-loop-gate.py).
 * Parsers stay forgiving: a missing or half-filled file yields partial data, never an error.
 */

/** STATE.md phases, as numbered in kickoff/templates/STATE.md. */
export const HACKFORGE_PHASES = ['config', 'understand', 'widen', 'design', 'decide', 'build', 'pitch', 'verify', 'loop', 'submit'] as const
export type HackforgePhase = (typeof HACKFORGE_PHASES)[number]
export const HACKFORGE_PROFILES = ['auto', 'sprint', 'standard', 'deep', 'max'] as const

export interface HackforgeConfig {
  challenge?: string
  deadline?: string
  hours?: number
  team?: number
  profile?: string
  targetScore?: number
  maxIterations?: number
  maxHours?: number
  reserveMinutes?: number
  plateau?: number
  loopEnabled?: boolean
  checkpoints?: string[]
}

export interface RuleItem {
  /** R1 (hard rule), D1 (deliverable), J1 (judging criterion). */
  id: string
  kind: 'rule' | 'deliverable' | 'criterion'
  text: string
  /** Judging weight as a fraction (0–1). */
  weight?: number
  /** Source quote (rules) or the detail column (format, what a top score looks like). */
  detail?: string
}

export type MilestoneStatus = 'todo' | 'doing' | 'done'

export interface Milestone {
  id: string
  goal: string
  covers?: string
  status: MilestoneStatus
}

export interface VerifyResult {
  compliance?: 'PASS' | 'FAIL'
  mockScore?: number
  gate?: 'PASS' | 'FAIL'
  /** Per R/D id from the Compliance table. */
  checks: { id: string; ok: boolean; note?: string }[]
  /** Per J id from the mock-score table. */
  criterionScores: { id: string; score: number }[]
  /** "Fix order" list, top first. */
  fixOrder: string[]
  mtime: number
}

export interface LoopEntry {
  iteration: number
  change: string
  gate?: string
  compliance?: string
  score?: number
  kept?: boolean
}

export interface LoopStatus {
  active: boolean
  iteration: number
  maxIterations: number
  targetScore: number
  bestScore?: number
  noGainStreak: number
  plateauLimit: number
  startedAt?: string
  endedReason?: string
  endedAt?: string
  deadline?: string
  reserveMinutes?: number
  maxHours?: number
  entries: LoopEntry[]
}

export interface StateInfo {
  phase?: HackforgePhase
  phaseIndex?: number
  profile?: string
  deadline?: string
  timeLeft?: string
  milestone?: string
  next?: string
  latestMockScore?: number
  risks?: string
}

export interface HackforgeSnapshot {
  cwd: string
  /** challenge/ or .hackforge/ exists. */
  present: boolean
  /** .hackforge/ exists (kickoff has run). */
  initialized: boolean
  config: HackforgeConfig
  state: StateInfo
  rules: RuleItem[]
  directives: string[]
  decision?: { title?: string; text: string }
  milestones: Milestone[]
  verify?: VerifyResult
  /** VERIFY.md is older than the newest code change (the loop gate rejects it then). */
  verifyStale: boolean
  loop?: LoopStatus
  stopRequested: boolean
  /** The hackforge plugin is enabled in Claude Code settings (user or project). */
  pluginInstalled: boolean
  /** Memory files present, e.g. ['BRIEF.md', 'RULES.md', …]. */
  files: string[]
  updatedAt: number
}

/** Off; on in projects with challenge/ or .hackforge/; or every session. */
export type HackforgeMode = 'off' | 'projects' | 'always'

const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v !== 'string' || !v.trim()) return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

const clean = (s: string) =>
  s
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/^\s*\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Template placeholders ("…", "", "(why)") aren't values. */
const filled = (s: string | undefined) => (s && s.replace(/[….\s()-]/g, '') ? s.trim() : undefined)

function tableRows(md: string): string[][] {
  return md
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\|?\s*:?-{2,}/.test(l.trim().replace(/^\|/, '')))
    .map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
}

/** `~25 %`, `25%`, `0.25`, `weight 3/10` → 0.25 */
export function parseWeight(text: string): number | undefined {
  const pct = /(\d+(?:[.,]\d+)?)\s*%/.exec(text)
  if (pct) return toNum(pct[1])! / 100
  const frac = /\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/.exec(text)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const dec = /^\s*~?\s*(0?\.\d+|1(?:\.0+)?)\s*$/.exec(text)
  return dec ? Number(dec[1]) : undefined
}

/** RULES.md: the R / D / J tables (rows with an empty description are template stubs). */
export function parseRules(md: string): RuleItem[] {
  const kinds = { R: 'rule', D: 'deliverable', J: 'criterion' } as const
  const out = new Map<string, RuleItem>()
  for (const cells of tableRows(md)) {
    const id = clean(cells[0] ?? '')
    if (!/^[RDJ]\d+$/.test(id) || out.has(id)) continue
    const text = clean(cells[1] ?? '')
    if (!text) continue
    const kind = kinds[id[0] as 'R' | 'D' | 'J']
    const rest = cells.slice(2).map(clean).filter(Boolean)
    if (kind === 'criterion') {
      const weightCell = rest.find((c) => parseWeight(c) !== undefined)
      out.set(id, { id, kind, text, weight: weightCell ? parseWeight(weightCell) : undefined, detail: rest.filter((c) => c !== weightCell).join(' · ') || undefined })
    } else {
      out.set(id, { id, kind, text, detail: rest.join(' · ') || undefined })
    }
  }
  // Bullet/heading style ("- **R1** …") for hand-written files.
  for (const line of md.split('\n')) {
    const m = /^\s*(?:#+\s*|[-*+]\s*)(?:\*\*)?([RDJ]\d+)(?:\*\*)?\s*[:.—–-]\s*(.+)$/.exec(line)
    if (!m || out.has(m[1])) continue
    const kind = kinds[m[1][0] as 'R' | 'D' | 'J']
    out.set(m[1], { id: m[1], kind, text: clean(m[2]), weight: kind === 'criterion' ? parseWeight(m[2]) : undefined })
  }
  const rank = (r: RuleItem) => 'RDJ'.indexOf(r.id[0]) * 1000 + Number(r.id.slice(1))
  return [...out.values()].sort((a, b) => rank(a) - rank(b))
}

function statusOf(s: string): MilestoneStatus {
  if (/✅|☑|\[x\]|\bdone\b|\bcomplete/i.test(s)) return 'done'
  if (/🔄|🟡|🟨|⏳|🚧|\bin[ -]?progress\b|\bdoing\b|\bwip\b|\bactive\b/i.test(s)) return 'doing'
  return 'todo'
}

/** PLAN.md milestones table: | M | Goal | Covers | Acceptance | Time-box | Status |. */
export function parseMilestones(md: string): Milestone[] {
  const out = new Map<string, Milestone>()
  // Only the milestones table, not "Tasks per milestone" (which also starts rows with M1).
  const section = /##\s*Milestones[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i.exec(md)?.[1] ?? md
  for (const cells of tableRows(section)) {
    const id = clean(cells[0] ?? '')
    if (!/^M\d+$/.test(id) || out.has(id)) continue
    const goal = clean(cells[1] ?? '')
    if (!goal) continue
    out.set(id, { id, goal, covers: filled(clean(cells[2] ?? '')), status: statusOf(cells.at(-1) ?? '') })
  }
  for (const line of section.split('\n')) {
    const m = /^\s*[-*+]\s*(?:\[([ xX])\]\s*)?(?:\*\*)?(M\d+)(?:\*\*)?\s*[:.—–-]\s*(.+)$/.exec(line)
    if (!m || out.has(m[2])) continue
    out.set(m[2], { id: m[2], goal: clean(m[3].replace(/✅|⬜/g, '')), status: m[1] ? (m[1].toLowerCase() === 'x' ? 'done' : 'todo') : statusOf(m[3]) })
  }
  return [...out.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
}

/** VERIFY.md as verify/SKILL.md writes it. */
export function parseVerify(md: string, mtime: number): VerifyResult {
  const line = (key: string) => new RegExp(`^[ \\t]*\\**${key}\\**[ \\t]*:[ \\t]*\\**[ \\t]*([^\\s*]+)`, 'mi').exec(md)?.[1]
  const comp = line('COMPLIANCE')?.toUpperCase()
  const gateRaw = line('GATE')?.toUpperCase()
  const checks: VerifyResult['checks'] = []
  const criterionScores: VerifyResult['criterionScores'] = []
  for (const cells of tableRows(md)) {
    const id = clean(cells[0] ?? '')
    if (/^[RD]\d+$/.test(id)) {
      const status = cells.slice(1).join(' ')
      if (/✅|❌|\bpass\b|\bfail\b|\bok\b/i.test(status)) {
        checks.push({ id, ok: /✅|\bpass\b|\bok\b/i.test(status) && !/❌|\bfail\b/i.test(status), note: filled(clean(cells[2] ?? '')) })
      }
    } else if (/^J\d+$/.test(id)) {
      const score = cells.slice(1).map((c) => toNum(clean(c).replace(/\s*\/\s*10$/, ''))).find((n) => n !== undefined && n <= 10)
      if (score !== undefined) criterionScores.push({ id, score })
    }
  }
  const fixSection = /##\s*Fix order[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i.exec(md)?.[1] ?? ''
  const fixOrder = fixSection
    .split('\n')
    .filter((l) => /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(l))
    .map(clean)
    .slice(0, 12)
  return {
    compliance: comp === 'PASS' || comp === 'FAIL' ? comp : undefined,
    mockScore: toNum(line('MOCK_SCORE')),
    gate: gateRaw ? (/PASS|OK|^0$/.test(gateRaw) ? 'PASS' : 'FAIL') : undefined,
    checks,
    criterionScores,
    fixOrder,
    mtime,
  }
}

/** LOOP.md lines: `#N | change | gate | compliance | score | kept/reverted`. */
export function parseLoopLog(md: string): LoopEntry[] {
  const out: LoopEntry[] = []
  for (const raw of md.split('\n')) {
    const cells = raw.trim().replace(/^[-*]\s*/, '').replace(/^\||\|$/g, '').split('|').map((c) => clean(c))
    const n = /^#?\s*(\d+)$/.exec(cells[0] ?? '')
    if (!n || cells.length < 3) continue
    const scoreCell = cells[4] ?? cells.find((c, i) => i > 1 && /^\d+(?:\.\d+)?(\s*\/\s*10)?$/.test(c)) ?? ''
    const verdict = cells[5] ?? cells.at(-1) ?? ''
    out.push({
      iteration: Number(n[1]),
      change: cells[1] ?? '',
      gate: filled(cells[2]),
      compliance: filled(cells[3]),
      score: toNum(/(\d+(?:\.\d+)?)/.exec(scoreCell)?.[1]),
      kept: /kept|keep|commit|✓|✅/i.test(verdict) ? true : /revert|✗|❌/i.test(verdict) ? false : undefined,
    })
  }
  return out.sort((a, b) => a.iteration - b.iteration)
}

/** LOOP.json as hf-loop-gate.py reads and writes it. */
export function parseLoop(json: unknown, md: string | undefined): LoopStatus {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>
  const str = (k: string) => (typeof o[k] === 'string' && o[k] ? (o[k] as string) : undefined)
  return {
    active: o.active === true,
    iteration: toNum(o.iteration) ?? 0,
    maxIterations: toNum(o.max_iterations) ?? 30,
    targetScore: toNum(o.target_score) ?? 9,
    bestScore: toNum(o.best_score),
    noGainStreak: toNum(o.no_gain_streak) ?? 0,
    plateauLimit: toNum(o.plateau_limit) ?? 3,
    startedAt: str('started_at'),
    endedReason: str('ended_reason'),
    endedAt: str('ended_at'),
    deadline: str('deadline'),
    reserveMinutes: toNum(o.reserve_minutes),
    maxHours: toNum(o.max_hours),
    entries: md ? parseLoopLog(md) : [],
  }
}

/** STATE.md bullets (kickoff/templates/STATE.md). The unfilled template is ignored. */
export function parseState(md: string): StateInfo {
  const field = (label: string) => {
    const m = new RegExp(`^[ \\t]*[-*]?[ \\t]*\\**${label}\\**[ \\t]*:[ \\t]*(.*)$`, 'mi').exec(md)
    return m ? filled(clean(m[1])) : undefined
  }
  const info: StateInfo = {}
  const phase = field('Phase')
  // "5 build" or "build"; the template lists every phase separated by "|", which is not a value.
  if (phase && !phase.includes('|')) {
    const m = /(\d+)?\s*([a-z]+)?/i.exec(phase)
    const byName = m?.[2] ? HACKFORGE_PHASES.indexOf(m[2].toLowerCase() as HackforgePhase) : -1
    const idx = byName >= 0 ? byName : m?.[1] !== undefined ? Number(m[1]) : -1
    if (idx >= 0 && idx < HACKFORGE_PHASES.length) {
      info.phaseIndex = idx
      info.phase = HACKFORGE_PHASES[idx]
    }
  }
  const profileLine = field('Profile')
  info.profile = profileLine ? filled(profileLine.split(/[\s(·]/)[0]) : undefined
  const deadlineLine = field('Deadline')
  if (deadlineLine) {
    const [dl, ...rest] = deadlineLine.split('·')
    info.deadline = filled(dl)
    const left = /left\s*:\s*(.+)$/i.exec(rest.join('·'))?.[1]
    info.timeLeft = filled(left?.split('/').at(-1))
  }
  info.milestone = field('Current milestone(?: / wave)?')
  info.next = field('Next')
  const best = field('Best metric[^:]*')
  info.latestMockScore = toNum(/Latest mock score\s*:\s*(\d+(?:[.,]\d+)?)/i.exec(md)?.[1]) ?? toNum(/mock score\s*:\s*(\d+(?:[.,]\d+)?)/i.exec(best ?? '')?.[1])
  info.risks = field('Risks[^:]*')
  return info
}

/** DIRECTIVES.md: numbered or bulleted team directives. */
export function parseDirectives(md: string): string[] {
  return md
    .split('\n')
    .filter((l) => /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(l))
    .map(clean)
    .filter((l) => l && l !== '…')
    .slice(0, 40)
}

/** hackforge.yaml (init/skeleton/hackforge.yaml) after YAML parsing. Empty strings mean "unset". */
export function pickConfig(y: unknown): HackforgeConfig {
  const o = (y && typeof y === 'object' ? y : {}) as Record<string, unknown>
  const loop = (o.loop && typeof o.loop === 'object' ? o.loop : {}) as Record<string, unknown>
  const s = (v: unknown) => (v instanceof Date ? v.toISOString() : typeof v === 'string' && v.trim() ? v.trim() : undefined)
  return {
    challenge: s(o.challenge),
    deadline: s(o.deadline),
    hours: toNum(o.hours),
    team: toNum(o.team) ?? (Array.isArray(o.team) ? o.team.length : undefined),
    profile: s(o.profile),
    targetScore: toNum(loop.target_score),
    maxIterations: toNum(loop.max_iterations),
    maxHours: toNum(loop.max_hours),
    reserveMinutes: toNum(loop.reserve_minutes),
    plateau: toNum(loop.plateau),
    loopEnabled: typeof loop.enabled === 'boolean' ? loop.enabled : undefined,
    checkpoints: Array.isArray(o.checkpoints) ? o.checkpoints.map(String) : undefined,
  }
}

/** Rewrites the top-level `profile:` value, keeping its trailing comment and everything else. */
export function setYamlProfile(yaml: string, profile: string): string {
  const re = /^profile\s*:[^#\n]*?(\s*#.*)?$/m
  if (re.test(yaml)) return yaml.replace(re, (_m, comment = '') => `profile: ${profile}${comment}`)
  return `${yaml.trim() ? yaml.replace(/\s*$/, '\n') : ''}profile: ${profile}\n`
}

/** HackForge's subagents arrive as `hackforge:rules-lawyer` etc. */
export function hackforgeRole(subagentType: string | undefined): string | undefined {
  if (!subagentType?.startsWith('hackforge:')) return undefined
  return subagentType
    .slice('hackforge:'.length)
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Instructions added to every session in HackForge mode. */
export function hackforgeGuide(present: boolean): string {
  return present
    ? `This project uses HackForge (the hackforge Claude Code plugin; challenge/ and .hackforge/ are its input and memory). Work through it: for any request here, use the matching /hackforge:* skill (run, kickoff, build, verify, perfect, pitch, craft, eval, solve, focus, rules, status) and keep .hackforge/ current. Hard rules in .hackforge/RULES.md override everything; team directives in DIRECTIVES.md shape every decision. If the user gives a new instruction mid-run, record it with hackforge:focus.`
    : `HackForge (the hackforge Claude Code plugin) is the default way to work in this app. If the user is working on a hackathon or coding challenge, set it up with /hackforge:init and drive the work through the /hackforge:* skills.`
}
