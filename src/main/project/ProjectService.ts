import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { tool, type McpServerConfig, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import { parseCatalog, resolveCatalogServer, type CatalogEntry, type CatalogServer } from '@shared/mcpCatalog'
import { z } from 'zod'
import { normPath, relTo } from '@shared/paths'
import {
  currentStage,
  detectStacks,
  emptyArtifacts,
  feedbackIteration,
  GAN_DIR,
  parseFeedback,
  parseRecord,
  PLANS_DIR,
  PRDS_DIR,
  PROJECT_FILE,
  PROJECT_STAGE_TOOL,
  PROJECT_STAGES,
  RULES_DIR,
  slugify,
  type CreateProject,
  type FeedbackScore,
  type ProjectArtifacts,
  type ProjectCommit,
  type ProjectRecord,
  type ProjectStage,
  type ProjectState,
} from '@shared/project'

export type GitRunner = (args: string[], cwd: string) => Promise<{ code: number; out: string }>

export interface ProjectDeps {
  /** The current project (Settings). */
  projectDir(): string | null
  /** ECC's rules folder in the plugin Harness uses, if there is one. */
  eccRules(): string | undefined
  /** ECC's MCP catalog (mcp-configs/mcp-servers.json). */
  eccCatalog?(): string | undefined
  /** The project's API keys (Project › Keys), for the catalog servers' variables. */
  keyValues?(): Record<string, string>
  push(state: ProjectState | null): void
  git?: GitRunner
  now?(): number
  /** How often to look for changes (ms); 0 turns the poll off (tests). */
  pollMs?: number
}

const runGit: GitRunner = (args, cwd) =>
  new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 15_000, windowsHide: true }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : 1) : 0
      resolve({ code, out: `${stdout}${stderr}`.trim() })
    })
  })

/** What a new project ignores from the start: dependencies, build output, secrets, the evaluator's screenshots. */
export const PROJECT_GITIGNORE = `# Dependencies and build output
node_modules/
dist/
build/
out/
coverage/
.next/
__pycache__/
.venv/

# Secrets: API keys live here (Harness writes them; never commit them)
.env
.env.*
!.env.example

# The evaluator's screenshots (its scores and feedback are kept)
gan-harness/screenshots/

.DS_Store
`

const mtime = (p: string) => {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}
const list = (dir: string) => {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

/**
 * Projects Harness builds: creates them (folder, git, ECC's rules, Harness's record), reads back
 * where the build is from what ECC writes (PRD, plan, the evaluator's scores, commits), records the
 * stages Claude reports through the `project_stage` tool, and adds ECC's rule packs for the stack
 * once the project's manifest files show it.
 */
export class ProjectService {
  private timer?: NodeJS.Timeout
  private signature = ''
  private last: ProjectState | null = null
  private readonly git: GitRunner
  private readonly now: () => number
  /** Serialises writes to the record, so two stage reports in a row both land. */
  private writing: Promise<unknown> = Promise.resolve()
  private catalogCache?: CatalogServer[]

  constructor(private readonly deps: ProjectDeps) {
    this.git = deps.git ?? runGit
    this.now = deps.now ?? Date.now
  }

  start() {
    const ms = this.deps.pollMs ?? 2500
    if (ms > 0) this.timer = setInterval(() => void this.refresh(), ms)
    void this.refresh(true)
  }

  dispose() {
    clearInterval(this.timer)
  }

  /** Creates a project folder ready for the build; returns its path. */
  async create(o: CreateProject): Promise<string> {
    const slug = slugify(o.name)
    if (!slug) throw new Error('Give the project a name with at least one letter or digit.')
    if (!o.idea.trim()) throw new Error('Describe the idea first.')
    if (!existsSync(o.parent)) throw new Error(`${o.parent} doesn't exist.`)
    const dir = join(o.parent, slug)
    if (existsSync(dir) && list(dir).some((f) => f !== '.DS_Store')) throw new Error(`${dir} already has files in it. Pick another name or place.`)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, '.gitignore'), PROJECT_GITIGNORE)
    const record: ProjectRecord = {
      name: o.name.trim(),
      idea: o.idea.trim(),
      createdAt: this.now(),
      ...(o.setup ? { setup: o.setup } : {}),
      history: [{ stage: 'idea', note: 'Started from an idea', at: this.now() }],
      rules: [],
      mcp: [],
    }
    record.rules = await this.copyRules(dir, ['common'], [])
    await this.writeRecord(dir, record)
    // git: a main branch from the start; older gits don't know -b.
    if ((await this.git(['init', '-b', 'main'], dir)).code !== 0) await this.git(['init'], dir)
    await this.git(['add', '-A'], dir)
    // Uses your git identity; without one the files simply stay uncommitted and Claude commits later.
    await this.git(['commit', '-m', `Start ${record.name}`], dir)
    return dir
  }

  /** The current project's state (null without one). */
  async state(): Promise<ProjectState | null> {
    const dir = this.deps.projectDir()
    if (!dir || !existsSync(dir)) return null
    const record = await this.readRecord(dir)
    const artifacts = await this.artifacts(dir)
    const { commits, recent } = await this.history(dir)
    const stacks = detectStacks(this.probe(dir))
    return { dir, name: record?.name ?? basename(dir), record, ...currentStage(record, artifacts), artifacts, commits, recent, stacks }
  }

  /** Looks for changes; pushes the state when something changed (or always with `force`). */
  async refresh(force = false): Promise<ProjectState | null> {
    const dir = this.deps.projectDir()
    const sig = dir ? this.signatureOf(dir) : ''
    if (!force && sig === this.signature) return this.last
    this.signature = sig
    if (dir && existsSync(join(dir, PROJECT_FILE))) await this.syncRules(dir).catch(() => {})
    this.last = await this.state()
    this.deps.push(this.last)
    return this.last
  }

  /** Claude reported a stage (the project_stage tool). */
  async record(stage: ProjectStage, note?: string, score?: number, sessionId?: string): Promise<ProjectState | null> {
    const dir = this.deps.projectDir()
    if (!dir) return null
    await this.update(dir, (r) => {
      const entry = { stage, ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}), ...(score !== undefined ? { score: Math.max(0, Math.min(10, score)) } : {}), at: this.now() }
      r.history = [...r.history, entry].slice(-200)
      if (sessionId) r.sessionId = sessionId
    })
    return this.refresh(true)
  }

  /** The session that builds the current project. */
  async link(sessionId: string): Promise<void> {
    const dir = this.deps.projectDir()
    if (!dir) return
    await this.update(dir, (r) => {
      r.sessionId = sessionId
    })
    await this.refresh(true)
  }

  /** Whether a session's folder is the current project (or inside it). */
  inProject(cwd: string): boolean {
    const d = this.deps.projectDir()
    if (!d) return false
    const c = normPath(cwd)
    return normPath(d) === c || relTo(c, d) !== null
  }

  /** The `project_stage` tool for a session in the current project; none elsewhere. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools(session: { id: string; cwd: string }): SdkMcpToolDefinition<any>[] {
    if (!this.inProject(session.cwd)) return []
    return [
      tool(
        'project_stage',
        PROJECT_STAGE_TOOL,
        {
          stage: z.enum(PROJECT_STAGES),
          note: z.string().max(300).describe('One line: what you are doing in this stage'),
          score: z.number().min(0).max(10).optional().describe('The evaluator round’s weighted score, out of 10'),
        },
        async (args) => {
          await this.record(args.stage, args.note, args.score, session.id)
          return { content: [{ type: 'text' as const, text: `Harness shows the project at: ${args.stage}.` }] }
        },
        { alwaysLoad: true },
      ),
    ]
  }

  // ---------- ECC's MCP catalog ----------

  private servers(): CatalogServer[] {
    if (this.catalogCache) return this.catalogCache
    const file = this.deps.eccCatalog?.()
    try {
      this.catalogCache = file ? parseCatalog(JSON.parse(readFileSync(file, 'utf8'))) : []
    } catch {
      this.catalogCache = []
    }
    return this.catalogCache
  }

  private recordSync(dir: string): ProjectRecord | null {
    try {
      return parseRecord(JSON.parse(readFileSync(join(dir, PROJECT_FILE), 'utf8')))
    } catch {
      return null
    }
  }

  /** The catalog for Project › Keys: which servers the project has, and which keys each still needs. */
  catalog(): CatalogEntry[] {
    const dir = this.deps.projectDir()
    const added = new Set(dir ? (this.recordSync(dir)?.mcp ?? []) : [])
    const values = this.deps.keyValues?.() ?? {}
    return this.servers().map((s) => ({ ...s, added: added.has(s.id), missing: s.needs.filter((n) => !values[n]) }))
  }

  async setMcp(id: string, on: boolean): Promise<CatalogEntry[]> {
    const dir = this.deps.projectDir()
    if (!dir) throw new Error('Pick or create a project first.')
    if (!this.servers().some((s) => s.id === id)) throw new Error(`${id} isn't in ECC's catalog.`)
    await this.update(dir, (r) => {
      r.mcp = on ? [...new Set([...r.mcp, id])] : r.mcp.filter((x) => x !== id)
    })
    return this.catalog()
  }

  /** The catalog servers a session in the project gets: the ones added, with all their keys set. */
  mcpServers(cwd: string): Record<string, McpServerConfig> {
    const dir = this.deps.projectDir()
    if (!dir || !this.inProject(cwd)) return {}
    const added = new Set(this.recordSync(dir)?.mcp ?? [])
    if (!added.size) return {}
    const values = this.deps.keyValues?.() ?? {}
    const out: Record<string, McpServerConfig> = {}
    for (const s of this.servers()) {
      if (!added.has(s.id)) continue
      const c = resolveCatalogServer(s, values)
      if ('missing' in c) continue
      out[s.id] = c.type === 'http' ? { type: 'http', url: c.url, headers: c.headers } : { type: 'stdio', command: c.command, args: c.args, env: c.env }
    }
    return out
  }

  // ---------- reading the project ----------

  private async readRecord(dir: string): Promise<ProjectRecord | null> {
    try {
      return parseRecord(JSON.parse(await readFile(join(dir, PROJECT_FILE), 'utf8')))
    } catch {
      return null
    }
  }

  private async writeRecord(dir: string, r: ProjectRecord) {
    await mkdir(join(dir, '.harness'), { recursive: true })
    await writeFile(join(dir, PROJECT_FILE), `${JSON.stringify(r, null, 2)}\n`)
  }

  private update(dir: string, change: (r: ProjectRecord) => void): Promise<void> {
    const run = this.writing.then(async () => {
      // A folder you picked gets a record the first time Claude reports on it.
      const r = (await this.readRecord(dir)) ?? { name: basename(dir), idea: '', createdAt: this.now(), history: [], rules: [], mcp: [] }
      change(r)
      await this.writeRecord(dir, r)
    })
    this.writing = run.catch(() => {})
    return run
  }

  private async artifacts(dir: string): Promise<ProjectArtifacts> {
    const a = emptyArtifacts()
    const newest = async (sub: string, suffix: string) => {
      const d = join(dir, sub)
      const names = (await readdir(d).catch(() => [] as string[])).filter((f) => f.endsWith(suffix))
      const withTime = await Promise.all(names.map(async (f) => ({ p: join(d, f), t: (await stat(join(d, f)).catch(() => null))?.mtimeMs ?? 0 })))
      return withTime.sort((x, y) => y.t - x.t).map((x) => x.p)
    }
    a.prds = await newest(PRDS_DIR, '.md')
    a.plans = await newest(PLANS_DIR, '.md')
    const gan = join(dir, GAN_DIR)
    const at = (rel: string) => (existsSync(join(dir, rel)) ? join(dir, rel) : undefined)
    a.spec = at(`${GAN_DIR}/spec.md`)
    a.rubric = at(`${GAN_DIR}/eval-rubric.md`)
    a.report = at(`${GAN_DIR}/build-report.md`)
    a.readme = at('README.md')
    const feedbackDir = join(gan, 'feedback')
    const rounds: FeedbackScore[] = []
    for (const f of await readdir(feedbackDir).catch(() => [] as string[])) {
      const iteration = feedbackIteration(f)
      if (iteration === undefined) continue
      const file = join(feedbackDir, f)
      const parsed = parseFeedback(await readFile(file, 'utf8').catch(() => ''))
      if (parsed) rounds.push({ iteration, ...parsed, file, mtime: mtime(file) })
    }
    // A new slice's loop starts again at 001: order by when each round was written.
    a.feedback = rounds.sort((x, y) => x.mtime - y.mtime || x.iteration - y.iteration)
    return a
  }

  private async history(dir: string): Promise<{ commits: number; recent: ProjectCommit[] }> {
    if (!existsSync(join(dir, '.git'))) return { commits: 0, recent: [] }
    const count = await this.git(['rev-list', '--count', 'HEAD'], dir)
    const log = await this.git(['log', '-8', '--format=%h%x09%s'], dir)
    return {
      commits: count.code === 0 ? Number.parseInt(count.out, 10) || 0 : 0,
      recent:
        log.code === 0
          ? log.out
              .split('\n')
              .filter(Boolean)
              .map((l) => {
                const [hash, ...rest] = l.split('\t')
                return { hash, subject: rest.join('\t') }
              })
          : [],
    }
  }

  private probe(dir: string) {
    return {
      exists: (rel: string) => existsSync(join(dir, rel)),
      read: (rel: string) => {
        try {
          return readFileSync(join(dir, rel), 'utf8')
        } catch {
          return undefined
        }
      },
      rootFiles: list(dir),
    }
  }

  /** Cheap change detection: modification times of the files the state is read from. */
  private signatureOf(dir: string): string {
    const parts = [PROJECT_FILE, 'README.md', 'package.json', '.git/logs/HEAD', `${GAN_DIR}/spec.md`, `${GAN_DIR}/build-report.md`].map((f) => `${f}:${mtime(join(dir, f))}`)
    for (const sub of [PRDS_DIR, PLANS_DIR, `${GAN_DIR}/feedback`]) parts.push(`${sub}:${list(join(dir, sub)).map((f) => `${f}@${mtime(join(dir, sub, f))}`).join(',')}`)
    parts.push(`root:${list(dir).join(',')}`)
    return `${dir}|${parts.join('|')}`
  }

  // ---------- ECC's rules ----------

  /**
   * Adds the rule packs the stack calls for, once each (a pack you deleted stays deleted). Only in
   * projects Harness created (they start with the common pack): a folder you picked keeps its own rules.
   */
  private async syncRules(dir: string) {
    const record = await this.readRecord(dir)
    if (!record?.rules.includes('common')) return
    const want = detectStacks(this.probe(dir)).filter((p) => !record.rules.includes(p))
    if (!want.length) return
    const added = await this.copyRules(dir, want, record.rules)
    if (added.length === record.rules.length) return
    await this.update(dir, (r) => {
      r.rules = [...new Set([...r.rules, ...added])]
    })
  }

  /** Copies ECC rule packs into the project; returns the packs it now has (only packs ECC ships). */
  private async copyRules(dir: string, packs: string[], have: string[]): Promise<string[]> {
    const src = this.deps.eccRules()
    const out = [...have]
    if (!src) return out
    for (const p of packs) {
      if (out.includes(p) || !existsSync(join(src, p))) continue
      const dest = join(dir, RULES_DIR, p)
      if (!existsSync(dest)) await cp(join(src, p), dest, { recursive: true })
      out.push(p)
    }
    return out
  }
}
