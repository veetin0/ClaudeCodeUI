import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseCatalog, resolveCatalogServer } from '@shared/mcpCatalog'
import {
  autopilotPrompt,
  buildTitle,
  currentStage,
  detectStacks,
  emptyArtifacts,
  improvePrompt,
  inferStage,
  parseFeedback,
  parseRecord,
  PROJECT_FILE,
  RULES_DIR,
  slugify,
  suggestName,
  type ProjectState,
} from '@shared/project'
import { ProjectService, type GitRunner } from '../src/main/project/ProjectService'

const ROOT = join(import.meta.dirname, '..')
const RULES = join(ROOT, 'resources', 'ecc', 'rules')
const CATALOG = join(ROOT, 'resources', 'ecc', 'mcp-configs', 'mcp-servers.json')
const tmp = () => mkdtempSync(join(tmpdir(), 'harness-project-'))

// Real git for the service tests, with an identity of its own (never the machine's).
const GIT_ENV = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' }
const saved: Record<string, string | undefined> = {}
beforeAll(() => {
  for (const [k, v] of Object.entries(GIT_ENV)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
})
afterAll(() => {
  for (const k of Object.keys(GIT_ENV)) if (saved[k] === undefined) delete process.env[k]
  else process.env[k] = saved[k]
})

const FEEDBACK = (n: number, total: string, verdict = 'FAIL') => `# Evaluation — Iteration ${String(n).padStart(3, '0')}

## Scores

## Evaluation Mode

**Achieved:** \`playwright\`

| Criterion | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Design Quality | 6/10 | 0.3 | 1.8 |
| Originality | 7/10 | 0.2 | 1.4 |
| Craft | 5.5/10 | 0.3 | 1.65 |
| Functionality | 8/10 | 0.2 | 1.6 |
| **TOTAL** | | | **${total}/10** |

## Verdict: ${verdict} (threshold: 7.0)
`

describe('project model', () => {
  it('names a project from its idea, and makes safe folder names', () => {
    expect(suggestName('A habit tracker that nudges you at the right moment')).toBe('habit-tracker')
    expect(suggestName('I want to build an app for my bakery orders')).toBe('bakery-orders')
    expect(suggestName('!!!')).toBe('my-project')
    expect(slugify('  Café Ordering — v2!  ')).toBe('cafe-ordering-v2')
    expect(slugify('../../etc')).toBe('etc')
    expect(slugify('x'.repeat(80))).toHaveLength(48)
    expect(buildTitle('/home/me/Projects/habit-tracker/')).toBe('Build habit-tracker')
    expect(buildTitle('C:\\Users\\me\\orbit')).toBe('Build orbit')
  })

  it('reads the evaluator’s scores from its feedback files', () => {
    expect(parseFeedback(FEEDBACK(1, '6.45'))).toEqual({ total: 6.45, scores: { design: 6, originality: 7, craft: 5.5, functionality: 8 }, verdict: 'FAIL' })
    expect(parseFeedback(FEEDBACK(2, '7.6', 'PASS'))?.verdict).toBe('PASS')
    expect(parseFeedback('# Evaluation\n\nStill writing…')).toBeNull()
    // Code-only mode has its own criteria; the total is what matters.
    expect(parseFeedback('| **TOTAL** | | | **8.2/10** |')).toEqual({ total: 8.2, scores: {} })
  })

  it('works out the stage from what ECC wrote, and never goes back from what Claude reported', () => {
    const a = emptyArtifacts()
    expect(inferStage(a)).toBe('idea')
    expect(inferStage({ ...a, prds: ['/p/x.prd.md'] })).toBe('prd')
    expect(inferStage({ ...a, prds: ['p'], plans: ['q'] })).toBe('plan')
    expect(inferStage({ ...a, spec: '/s' })).toBe('build')
    expect(inferStage({ ...a, report: '/r' })).toBe('review')
    const record = parseRecord({ name: 'x', history: [{ stage: 'polish', note: 'Last design pass', at: 1 }] })
    expect(currentStage(record, { ...a, prds: ['p'] })).toEqual({ stage: 'polish', note: 'Last design pass' })
    // The files are ahead of the last report: the note belongs to an earlier stage.
    expect(currentStage(parseRecord({ name: 'x', history: [{ stage: 'prd', note: 'Writing the PRD', at: 1 }] }), { ...a, spec: '/s' })).toEqual({ stage: 'build' })
  })

  it('reads a hand-edited record without breaking', () => {
    expect(parseRecord('nope')).toBeNull()
    expect(parseRecord({ history: [{ stage: 'launch' }, { stage: 'build', score: 42, at: 5 }], rules: ['common', '../x'], mcp: ['github', 'github', 7] })).toEqual({
      name: 'Project',
      idea: '',
      createdAt: 0,
      history: [{ stage: 'build', score: 10, at: 5 }],
      rules: ['common'],
      mcp: ['github'],
    })
  })

  it('picks ECC rule packs from the project’s manifest files', () => {
    const probe = (files: Record<string, string>) => ({ exists: (f: string) => f in files, read: (f: string) => files[f], rootFiles: Object.keys(files) })
    expect(detectStacks(probe({ 'package.json': JSON.stringify({ dependencies: { next: '15', react: '19' } }) }))).toEqual(['typescript', 'react', 'web'])
    expect(detectStacks(probe({ 'package.json': JSON.stringify({ dependencies: { 'react-native': '1', expo: '1' } }) }))).toEqual(['typescript', 'react-native'])
    expect(detectStacks(probe({ 'package.json': '{ half', 'pyproject.toml': '' }))).toEqual(['typescript', 'python'])
    expect(detectStacks(probe({ 'go.mod': '', 'App.csproj': '' }))).toEqual(['golang', 'csharp'])
    expect(detectStacks(probe({}))).toEqual([])
  })

  it('briefs the autopilot through ECC’s whole pipeline, reporting each stage', () => {
    const p = autopilotPrompt({ name: 'habit-tracker', idea: 'A habit tracker', advisor: true })
    for (const step of ['/ecc:plan-prd', '/ecc:plan ', '/ecc:orch-build-mvp', '/ecc:code-review', 'ecc:security-review', 'ecc:verification-loop', 'ecc:frontend-design-direction'])
      expect(p).toContain(step)
    expect(p.indexOf('/ecc:plan-prd')).toBeLessThan(p.indexOf('/ecc:orch-build-mvp'))
    expect(p).toMatch(/mcp__harness__project_stage/)
    expect(p).toMatch(/at most 3 short questions, with AskUserQuestion/)
    expect(p).toMatch(/Ask your advisor/)
    expect(autopilotPrompt({ name: 'x', idea: 'y' })).not.toMatch(/advisor/)
    expect(p).toMatch(/Secrets stay in \.env/)
  })

  it('sends “make it better” to the matching ECC flow', () => {
    expect(improvePrompt('feature', 'Share a streak', { hasSpec: true })).toMatch(/^Add this feature with \/ecc:orch-add-feature[\s\S]*Share a streak/)
    expect(improvePrompt('bug', 'Duplicates on save', { hasSpec: true })).toMatch(/^Fix this bug with \/ecc:orch-fix-defect/)
    const better = improvePrompt('better', 'Make the "dashboard" feel premium', { hasSpec: true })
    expect(better).toMatch(/\/ecc:gan-build "Make the 'dashboard' feel premium" --skip-planner/)
    expect(better).toMatch(/gan-harness\/spec\.md/)
    expect(improvePrompt('better', 'x', { hasSpec: false })).not.toMatch(/--skip-planner/)
  })
})

function service(projectDir: () => string | null, opts: { git?: GitRunner; keys?: Record<string, string> } = {}) {
  const pushed: (ProjectState | null)[] = []
  const svc = new ProjectService({
    projectDir,
    eccRules: () => RULES,
    eccCatalog: () => CATALOG,
    keyValues: () => opts.keys ?? {},
    push: (s) => pushed.push(s),
    pollMs: 0,
    ...(opts.git ? { git: opts.git } : {}),
  })
  return { svc, pushed }
}

describe('ProjectService', () => {
  it('creates a project: folder, git with a first commit, .gitignore, ECC’s common rules and Harness’s record', async () => {
    const parent = tmp()
    const { svc } = service(() => null)
    const dir = await svc.create({ parent, name: 'Habit Tracker', idea: 'A habit tracker that nudges you', setup: 'opus-fable' })
    expect(dir).toBe(join(parent, 'habit-tracker'))
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toMatch(/^\.env$/m)
    expect(existsSync(join(dir, RULES_DIR, 'common', 'coding-style.md'))).toBe(true)
    const record = parseRecord(JSON.parse(readFileSync(join(dir, PROJECT_FILE), 'utf8')))
    expect(record).toMatchObject({ name: 'Habit Tracker', idea: 'A habit tracker that nudges you', setup: 'opus-fable', rules: ['common'], mcp: [], history: [{ stage: 'idea' }] })
    expect(execFileSync('git', ['log', '--format=%s'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('Start Habit Tracker')
    expect(execFileSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8' }).trim()).toBe('main')
    // A second project with the same name doesn't touch the first.
    await expect(svc.create({ parent, name: 'habit tracker', idea: 'again' })).rejects.toThrow(/already has files/)
    await expect(svc.create({ parent, name: '!!!', idea: 'x' })).rejects.toThrow(/name/)
    await expect(svc.create({ parent, name: 'ok', idea: '  ' })).rejects.toThrow(/idea/)
    rmSync(parent, { recursive: true, force: true })
  })

  it('still creates the project when git has no identity to commit with', async () => {
    const calls: string[] = []
    const git: GitRunner = async (args) => {
      calls.push(args[0])
      return { code: args[0] === 'commit' ? 128 : 0, out: '' }
    }
    const { svc } = service(() => null, { git })
    const dir = await svc.create({ parent: tmp(), name: 'x', idea: 'y' })
    expect(calls).toEqual(['init', 'add', 'commit'])
    expect(existsSync(join(dir, PROJECT_FILE))).toBe(true)
  })

  it('reads where the build is: PRD, plan, scores per round, commits, and the stages Claude reported', async () => {
    const parent = tmp()
    let current: string | null = null
    const { svc, pushed } = service(() => current)
    const dir = await svc.create({ parent, name: 'Orbit', idea: 'Track satellites' })
    current = dir
    let s = (await svc.refresh(true))!
    expect(s).toMatchObject({ name: 'Orbit', stage: 'idea', commits: 1, recent: [{ subject: 'Start Orbit' }] })

    mkdirSync(join(dir, '.claude', 'prds'), { recursive: true })
    writeFileSync(join(dir, '.claude', 'prds', 'orbit.prd.md'), '# Orbit')
    mkdirSync(join(dir, 'gan-harness', 'feedback'), { recursive: true })
    writeFileSync(join(dir, 'gan-harness', 'spec.md'), '# Spec')
    // Two slices: the second loop starts again at 001, so rounds are ordered by when they were written.
    const write = (name: string, total: string, t: number) => {
      const f = join(dir, 'gan-harness', 'feedback', name)
      writeFileSync(f, FEEDBACK(1, total))
      utimesSync(f, t, t)
    }
    write('feedback-001.md', '5.2', 1000)
    write('feedback-002.md', '6.8', 2000)
    write('feedback-001b.md', '9.9', 2500) // not a feedback file name
    s = (await svc.refresh())!
    expect(s.stage).toBe('build')
    expect(s.artifacts.prds).toEqual([join(dir, '.claude', 'prds', 'orbit.prd.md')])
    expect(s.artifacts.feedback.map((f) => f.total)).toEqual([5.2, 6.8])

    const tools = svc.tools({ id: 'sess-1', cwd: join(dir, 'web') })
    expect(tools.map((t) => t.name)).toEqual(['project_stage'])
    expect(svc.tools({ id: 'x', cwd: parent })).toEqual([])
    await tools[0].handler({ stage: 'review', note: 'Code review of slice 1', score: 7.4 }, {})
    s = pushed.at(-1)!
    expect(s).toMatchObject({ stage: 'review', note: 'Code review of slice 1' })
    expect(s.record).toMatchObject({ sessionId: 'sess-1' })
    expect(s.record!.history.at(-1)).toMatchObject({ stage: 'review', score: 7.4 })
    rmSync(parent, { recursive: true, force: true })
  })

  it('adds ECC’s rule packs once the stack shows up, and leaves a deleted pack deleted', async () => {
    const parent = tmp()
    let current: string | null = null
    const { svc } = service(() => current)
    const dir = await svc.create({ parent, name: 'web', idea: 'A web app' })
    current = dir
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { react: '19', vite: '7' } }))
    let s = (await svc.refresh(true))!
    expect(s.record!.rules).toEqual(['common', 'typescript', 'react', 'web'])
    for (const p of ['typescript', 'react', 'web']) expect(existsSync(join(dir, RULES_DIR, p))).toBe(true)
    rmSync(join(dir, RULES_DIR, 'react'), { recursive: true })
    writeFileSync(join(dir, 'README.md'), '# web')
    s = (await svc.refresh())!
    expect(existsSync(join(dir, RULES_DIR, 'react'))).toBe(false)
    expect(s.record!.rules).toContain('react')
    rmSync(parent, { recursive: true, force: true })
  })

  it('leaves a folder you picked alone until Claude reports on it', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'package.json'), '{}')
    const { svc } = service(() => dir)
    const s = (await svc.refresh(true))!
    expect(s).toMatchObject({ record: null, stage: 'idea', commits: 0 })
    expect(existsSync(join(dir, '.harness'))).toBe(false)
    expect(existsSync(join(dir, RULES_DIR))).toBe(false)
    await svc.record('build', 'Making it better')
    expect(parseRecord(JSON.parse(readFileSync(join(dir, PROJECT_FILE), 'utf8')))).toMatchObject({ history: [{ stage: 'build' }], rules: [] })
  })
})

describe('ECC’s MCP catalog', () => {
  const catalog = parseCatalog(JSON.parse(readFileSync(CATALOG, 'utf8')))
  const byId = (id: string) => catalog.find((s) => s.id === id)

  it('offers the servers Harness can run as they are, with placeholders turned into variables', () => {
    expect(catalog.length).toBeGreaterThan(15)
    expect(byId('github')).toMatchObject({ needs: ['GITHUB_PERSONAL_ACCESS_TOKEN'], config: { type: 'stdio', command: 'npx', env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_PERSONAL_ACCESS_TOKEN}' } } })
    expect(byId('supabase')?.needs).toEqual(['SUPABASE_PROJECT_REF'])
    expect(byId('arcmira')).toMatchObject({ needs: ['ARCMIRA_API_KEY'], config: { type: 'http', headers: { Authorization: 'Bearer ${ARCMIRA_API_KEY}' } } })
    expect(byId('vercel')).toMatchObject({ needs: [], config: { type: 'http', url: 'https://mcp.vercel.com' } })
    // Harness has its own browser and docs; local programs, paths and localhost servers can't run as they are.
    for (const id of ['playwright', 'context7', 'filesystem', 'nexus', 'ito-compute', 'devfleet', 'longhand']) expect(byId(id), id).toBeUndefined()
  })

  it('fills in the keys for a session, or says which are missing', () => {
    const gh = byId('github')!
    expect(resolveCatalogServer(gh, {})).toEqual({ missing: ['GITHUB_PERSONAL_ACCESS_TOKEN'] })
    expect(resolveCatalogServer(gh, { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1' })).toMatchObject({ env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_1' } })
    expect(resolveCatalogServer(byId('supabase')!, { SUPABASE_PROJECT_REF: 'abc' })).toMatchObject({ args: expect.arrayContaining(['--project-ref=abc']) })
  })

  it('gives added servers to sessions in the project once their keys are set', async () => {
    const dir = tmp()
    const keys: Record<string, string> = {}
    const { svc } = service(() => dir, { keys })
    await svc.setMcp('github', true)
    await svc.setMcp('vercel', true)
    expect(svc.catalog().filter((s) => s.added).map((s) => [s.id, s.missing])).toEqual([
      ['github', ['GITHUB_PERSONAL_ACCESS_TOKEN']],
      ['vercel', []],
    ])
    expect(Object.keys(svc.mcpServers(dir))).toEqual(['vercel'])
    keys.GITHUB_PERSONAL_ACCESS_TOKEN = 'ghp_1'
    expect(Object.keys(svc.mcpServers(join(dir, 'app')))).toEqual(['github', 'vercel'])
    expect(svc.mcpServers(tmp())).toEqual({})
    await svc.setMcp('vercel', false)
    expect(Object.keys(svc.mcpServers(dir))).toEqual(['github'])
    await expect(svc.setMcp('nope', true)).rejects.toThrow(/catalog/)
    // The record keeps only ids: no key in the project's files.
    expect(readFileSync(join(dir, PROJECT_FILE), 'utf8')).not.toContain('ghp_1')
  })
})
