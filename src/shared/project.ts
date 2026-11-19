/**
 * Projects: one idea in, a built and polished product out. Harness creates the folder, gives it ECC's
 * rules, and starts a session that runs ECC's pipeline (PRD → plan → MVP with builder and evaluator
 * agents → review → polish). This file is the model: stages, what Harness reads back from the files
 * ECC writes, and the prompts.
 */

export const PROJECT_STAGES = ['idea', 'prd', 'plan', 'build', 'review', 'polish', 'done'] as const
export type ProjectStage = (typeof PROJECT_STAGES)[number]

export const STAGE_LABEL: Record<ProjectStage, string> = {
  idea: 'Idea',
  prd: 'PRD',
  plan: 'Plan',
  build: 'Build',
  review: 'Review',
  polish: 'Polish',
  done: 'Done',
}

export const STAGE_HINT: Record<ProjectStage, string> = {
  idea: 'The idea, as you wrote it',
  prd: 'A lean product spec: who it is for, what it must do, what is out of scope',
  plan: 'The stack and a step-by-step implementation plan',
  build: 'Thin end-to-end slices, built and scored by ECC’s builder and evaluator agents',
  review: 'Code review, security review and a full verification',
  polish: 'A last design pass and the README',
  done: 'Built, checked and documented',
}

/** Harness's own record in the project (kept in git, so it travels with the project). */
export const PROJECT_FILE = '.harness/project.json'
/** ECC's rule packs go here, one folder per pack, as ECC's own install does. */
export const RULES_DIR = '.claude/rules/ecc'
export const PRDS_DIR = '.claude/prds'
export const PLANS_DIR = '.claude/plans'
export const GAN_DIR = 'gan-harness'

export interface StageEntry {
  stage: ProjectStage
  note?: string
  /** The evaluator's score for a build round, out of 10. */
  score?: number
  at: number
}

export interface ProjectRecord {
  name: string
  idea: string
  createdAt: number
  /** Which "Your Claude" setup started it (LEAD_SETUPS id). */
  setup?: string
  /** The session running the build. */
  sessionId?: string
  history: StageEntry[]
  /** ECC rule packs copied into the project. */
  rules: string[]
  /** MCP servers from ECC's catalog added to the project (Project › Keys). */
  mcp: string[]
}

export const SCORE_CRITERIA = ['design', 'originality', 'craft', 'functionality'] as const
export type ScoreCriterion = (typeof SCORE_CRITERIA)[number]
export const CRITERION_LABEL: Record<ScoreCriterion, string> = { design: 'Design', originality: 'Originality', craft: 'Craft', functionality: 'Functionality' }

/** One round of ECC's evaluator (gan-harness/feedback/feedback-NNN.md). */
export interface FeedbackScore {
  iteration: number
  /** Weighted total out of 10. */
  total: number
  scores: Partial<Record<ScoreCriterion, number>>
  verdict?: 'PASS' | 'FAIL'
  file: string
  mtime: number
}

export interface ProjectArtifacts {
  /** Absolute paths, newest first. */
  prds: string[]
  plans: string[]
  spec?: string
  rubric?: string
  report?: string
  readme?: string
  /** Oldest round first. */
  feedback: FeedbackScore[]
}

export interface ProjectCommit {
  hash: string
  subject: string
}

export interface ProjectState {
  dir: string
  name: string
  /** Null for a folder Harness didn't create (a project you picked): it still works, with less to show. */
  record: ProjectRecord | null
  stage: ProjectStage
  note?: string
  artifacts: ProjectArtifacts
  commits: number
  recent: ProjectCommit[]
  /** Rule packs the project's files call for (typescript, react, python…). */
  stacks: string[]
}

export const emptyArtifacts = (): ProjectArtifacts => ({ prds: [], plans: [], feedback: [] })

export function isStage(v: unknown): v is ProjectStage {
  return typeof v === 'string' && (PROJECT_STAGES as readonly string[]).includes(v)
}

const stageIndex = (s: ProjectStage) => PROJECT_STAGES.indexOf(s)
export const laterStage = (a: ProjectStage, b: ProjectStage) => (stageIndex(a) >= stageIndex(b) ? a : b)

const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((r): r is string => typeof r === 'string' && /^[a-z0-9-]+$/.test(r)))] : [])

/** A project record read defensively (a hand-edited or older file never breaks the Project place). */
export function parseRecord(raw: unknown): ProjectRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const str = (v: unknown, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const history = Array.isArray(o.history)
    ? o.history.flatMap((h): StageEntry[] => {
        if (!h || typeof h !== 'object') return []
        const e = h as Record<string, unknown>
        if (!isStage(e.stage)) return []
        const score = typeof e.score === 'number' && Number.isFinite(e.score) ? Math.max(0, Math.min(10, e.score)) : undefined
        return [{ stage: e.stage, ...(str(e.note, 300) ? { note: str(e.note, 300) } : {}), ...(score !== undefined ? { score } : {}), at: typeof e.at === 'number' ? e.at : 0 }]
      })
    : []
  return {
    name: str(o.name, 120) ?? 'Project',
    idea: str(o.idea) ?? '',
    createdAt: typeof o.createdAt === 'number' ? o.createdAt : 0,
    ...(str(o.setup, 40) ? { setup: str(o.setup, 40) } : {}),
    ...(str(o.sessionId, 100) ? { sessionId: str(o.sessionId, 100) } : {}),
    history,
    rules: ids(o.rules),
    mcp: ids(o.mcp),
  }
}

// ---------- names ----------

const STOP = new Set(
  'a an the and or of for to in on with that which who where when app apps application tool website site web page i we you my our me want would like build make create something new simple small cool nice using use it is be can so let lets please'.split(
    ' ',
  ),
)

/** A folder name: lowercase words joined by dashes, nothing a file system or shell trips over. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '')
}

/** A short name from the idea's first meaningful words: "A habit tracker that nudges you" → "habit-tracker". */
export function suggestName(idea: string): string {
  const words = slugify(idea)
    .split('-')
    .filter((w) => w && !STOP.has(w) && !/^\d+$/.test(w))
  return words.slice(0, 2).join('-') || 'my-project'
}

// ---------- what ECC writes ----------

const num = (s: string | undefined) => (s === undefined ? undefined : Number.parseFloat(s))

/** Reads the evaluator's scores from a feedback file; null when it has no total yet. */
export function parseFeedback(md: string): Pick<FeedbackScore, 'total' | 'scores' | 'verdict'> | null {
  const total = num(/\*\*\s*TOTAL\s*\*\*[^\n]*?(\d+(?:\.\d+)?)\s*\/\s*10/i.exec(md)?.[1] ?? /\bTOTAL\b[^\n|]*\|[^\n]*?(\d+(?:\.\d+)?)\s*\/\s*10/i.exec(md)?.[1])
  if (total === undefined || !Number.isFinite(total)) return null
  const row = (label: string) => num(new RegExp(`\\|\\s*${label}[^|]*\\|\\s*(\\d+(?:\\.\\d+)?)\\s*/\\s*10`, 'i').exec(md)?.[1])
  const scores: FeedbackScore['scores'] = {}
  const found: [ScoreCriterion, number | undefined][] = [
    ['design', row('Design')],
    ['originality', row('Originality')],
    ['craft', row('Craft')],
    ['functionality', row('Functionality')],
  ]
  for (const [k, v] of found) if (v !== undefined && Number.isFinite(v)) scores[k] = Math.min(10, v)
  const verdict = /Verdict:\s*\**\s*(PASS|FAIL)/i.exec(md)?.[1]?.toUpperCase() as 'PASS' | 'FAIL' | undefined
  return { total: Math.min(10, total), scores, ...(verdict ? { verdict } : {}) }
}

export function feedbackIteration(file: string): number | undefined {
  const m = /feedback-(\d+)\.md$/i.exec(file)
  return m ? Number(m[1]) : undefined
}

/** Where the files say the build is: a PRD means planning is next, feedback means it's building, a report means review. */
export function inferStage(a: ProjectArtifacts): ProjectStage {
  if (a.report) return 'review'
  if (a.feedback.length || a.spec) return 'build'
  if (a.plans.length) return 'plan'
  if (a.prds.length) return 'prd'
  return 'idea'
}

/** The stage to show: the later of what Claude reported and what the files say. */
export function currentStage(record: ProjectRecord | null, a: ProjectArtifacts): { stage: ProjectStage; note?: string } {
  const last = record?.history.at(-1)
  const inferred = inferStage(a)
  if (!last) return { stage: inferred }
  const stage = laterStage(last.stage, inferred)
  return { stage, ...(stage === last.stage && last.note ? { note: last.note } : {}) }
}

// ---------- which ECC rule packs fit ----------

export interface StackProbe {
  exists(rel: string): boolean
  read(rel: string): string | undefined
  /** File names in the project's root. */
  rootFiles: string[]
}

/** ECC rule packs for the project's stack, from its manifest files. */
export function detectStacks(p: StackProbe): string[] {
  const out = new Set<string>()
  const pkgText = p.read('package.json')
  if (pkgText !== undefined) {
    let deps: Record<string, unknown> = {}
    try {
      const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> }
      deps = { ...pkg.dependencies, ...pkg.devDependencies }
    } catch {
      // A half-written package.json: the file itself still says it's a JS project.
    }
    const has = (n: string) => n in deps
    out.add('typescript') // ECC's typescript pack covers JavaScript too.
    if (has('react-native') || has('expo')) out.add('react-native')
    else if (has('react') || has('next')) out.add('react')
    if (has('nuxt')) out.add('nuxt')
    else if (has('vue')) out.add('vue')
    if (has('@angular/core')) out.add('angular')
    if (has('react') || has('next') || has('vue') || has('nuxt') || has('@angular/core') || has('svelte') || has('vite') || has('astro')) out.add('web')
  } else if (p.exists('tsconfig.json')) out.add('typescript')
  if (p.exists('index.html') && !out.has('react-native')) out.add('web')
  if (p.exists('pyproject.toml') || p.exists('requirements.txt') || p.exists('setup.py')) out.add('python')
  if (p.exists('go.mod')) out.add('golang')
  if (p.exists('Cargo.toml')) out.add('rust')
  if (p.exists('build.gradle.kts') || p.exists('settings.gradle.kts')) out.add('kotlin')
  else if (p.exists('pom.xml') || p.exists('build.gradle')) out.add('java')
  if (p.exists('Gemfile')) out.add('ruby')
  if (p.exists('composer.json')) out.add('php')
  if (p.exists('Package.swift')) out.add('swift')
  if (p.exists('pubspec.yaml')) out.add('dart')
  if (p.rootFiles.some((f) => /\.(csproj|sln)$/i.test(f))) out.add('csharp')
  if (p.rootFiles.some((f) => /\.fsproj$/i.test(f))) out.add('fsharp')
  if (p.exists('CMakeLists.txt')) out.add('cpp')
  return [...out]
}

// ---------- prompts ----------

/** Shared by every prompt that starts work in a project. */
const GROUND_RULES = `Rules for the whole build:
- Only claim what really works: run the app and its tests yourself, and look at the UI in the browser (mcp__playwright__*).
- Secrets stay in .env, which git ignores. The API keys I add in Harness are written there; .harness/services/ says what each service is and how to use it.
- If something needs a key, an account or a paid service I haven't added, put a mock behind a clean interface, note it in the README, and keep going.
- Stop and ask me only for a question that truly blocks the product, or before anything risky: deleting data, spending money, publishing, or force-pushing.`

/** The one message Build it sends: ECC's whole pipeline, with progress reported to Harness. */
export function autopilotPrompt(o: { name: string; idea: string; advisor?: boolean }): string {
  return `Build this project from my idea, start to finish, with ECC's pipeline. You lead: make the product decisions, let ECC's agents build, test and score it, and keep improving it until it is something I'd be proud to show.

The idea: ${o.idea.trim()}
Project: ${o.name} (this folder; git is set up, ECC's rules are in ${RULES_DIR}/)

Work through these stages in order. At the start of each, call mcp__harness__project_stage with the stage and a one-line note, so Harness shows where the build is. In the build, call it again after every evaluator round with the round's score.

1. prd: run /ecc:plan-prd with the idea. Don't wait on its framing, evidence and scope questions: answer them yourself from the idea, as a sharp product lead would, and mark each answer as an assumption in the PRD. If something truly decides what the product is, ask me once, at most 3 short questions, with AskUserQuestion, then go on.
2. plan: run /ecc:plan on the PRD. Pick a modern, well-supported stack that fits the idea (for a web app: TypeScript, a current framework and a real design system), say why in the plan, and continue without waiting for my confirmation.
3. build: run /ecc:orch-build-mvp on the PRD. At Gate 1, approve the slice plan yourself if it builds one thin end-to-end path first; at Gate 2, commit each slice as its own feat: commit once its review passes. Let the generator → evaluator loop run (aim for 8/10 or more, at most 10 rounds a slice). Make it look and feel professional: a clear visual direction, real empty, loading and error states, responsive layouts, and copy written for the user.
4. review: run /ecc:code-review on the whole project and the ecc:security-review skill, fix what they find, then run the ecc:verification-loop skill until it reports PASS.
5. polish: if the product has a UI, use the ecc:frontend-design-direction skill for a last design pass. Then write the README: what it is and who it's for, a screenshot (take it with the browser into docs/screenshots/), how to run it, and how it's built.
6. done: call project_stage with done and a two-line summary, then tell me how to run it and the three best next improvements.
${o.advisor ? '\nAsk your advisor before you lock the plan, and whenever a build round\'s score stops improving.\n' : ''}
${GROUND_RULES}`
}

/** What Build it sends to main. */
export interface CreateProject {
  parent: string
  name: string
  idea: string
  /** LEAD_SETUPS id. */
  setup?: string
}

/** The title of a session Build it started (its first message is Harness's, not something you typed). */
export function buildTitle(cwd: string): string {
  const name = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || 'project'
  return `Build ${name}`
}

export type ImproveKind = 'better' | 'feature' | 'bug'

const REPORT =
  'Call mcp__harness__project_stage with build and a one-line note when you start, again after each evaluator round with its score, and with done and a short summary when it is finished.'

/** "What should be better?": the ask goes to the matching ECC flow. */
export function improvePrompt(kind: ImproveKind, ask: string, o: { hasSpec: boolean }): string {
  const text = ask.trim()
  if (kind === 'feature') return `Add this feature with /ecc:orch-add-feature (research, plan, build test-first, review, commit):\n\n${text}\n\n${REPORT}`
  if (kind === 'bug') return `Fix this bug with /ecc:orch-fix-defect (reproduce it as a failing test, fix it, review, commit):\n\n${text}\n\n${REPORT}`
  const brief = text.replace(/\s+/g, ' ').replace(/"/g, "'")
  return o.hasSpec
    ? `Make this better: ${text}

First add this ask to gan-harness/spec.md and gan-harness/eval-rubric.md (keep what's there), so the evaluator scores what I asked for. Then run /ecc:gan-build "${brief}" --skip-planner --max-iterations 5, and commit the result once it passes review.

${REPORT}`
    : `Make this better: ${text}

Run /ecc:gan-build "${brief}" --max-iterations 5 so a builder and an evaluator agent iterate on it in the real app, and commit the result once it passes review.

${REPORT}`
}

/** Quick follow-ups on the Build tab, beyond "what should be better". */
export const PROJECT_ACTIONS: { id: string; label: string; hint: string; prompt: string; stage: ProjectStage }[] = [
  {
    id: 'review',
    label: 'Review again',
    hint: 'Code review and security review of the whole project, with fixes',
    prompt:
      'Call mcp__harness__project_stage with review. Run /ecc:code-review on the whole project and the ecc:security-review skill, fix what they find, then run the ecc:verification-loop skill until it reports PASS. Finish with project_stage done and what changed.',
    stage: 'review',
  },
  {
    id: 'polish',
    label: 'Polish the UI',
    hint: 'A product-specific design direction, applied to every screen',
    prompt:
      'Call mcp__harness__project_stage with polish. Use the ecc:frontend-design-direction skill to set a design direction that fits this product, then apply it to every screen: layout, type, colour, empty, loading and error states, motion and accessibility. Check each screen in the browser. Finish with project_stage done and before/after screenshots in docs/screenshots/.',
    stage: 'polish',
  },
  {
    id: 'tests',
    label: 'Add tests',
    hint: 'Coverage gaps found and filled',
    prompt: 'Call mcp__harness__project_stage with review. Run /ecc:test-coverage with an 80% target and fill the gaps it finds. Finish with project_stage done and the coverage before and after.',
    stage: 'review',
  },
  {
    id: 'docs',
    label: 'Update the docs',
    hint: 'README and docs brought in line with the code',
    prompt: 'Run /ecc:update-docs to bring the docs in line with the code. Also check the README still says how to run the app and shows a current screenshot (take a new one with the browser if not).',
    stage: 'polish',
  },
]

/** The harness tool's description: what Claude reads about project_stage. */
export const PROJECT_STAGE_TOOL = `Report which stage of building this project you are in, so Harness shows it on the project's page. Stages: ${PROJECT_STAGES.join(', ')}. Call it at the start of each stage with a one-line note of what you're doing, and after each evaluator round with its score out of 10.`
