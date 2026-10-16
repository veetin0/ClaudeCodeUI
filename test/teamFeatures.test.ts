import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { buildHandoffNote, takeOverPrompt } from '@shared/handoff'
import { findConflicts, handoffBranch, listHandoffs, makeJoinCode, type Conflict, type MemberStatus, type OpenHandoff, type TeamConfig } from '@shared/team'
import { parseDiffRanges, parseStatus, repoId, scanChanges } from '../src/main/team/changes'
import { checkoutHandoff, planHandoff, pushSnapshot } from '../src/main/team/handoff'
import { openSecrets, sealSecrets } from '../src/main/team/secrets'
import { TeamService, type TeamDeps, type TeamKeys } from '../src/main/team/TeamService'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim()
const root = mkdtempSync(join(tmpdir(), 'harness-team-'))

/** A bare "GitHub" repo with one commit on main, and a clone per teammate. */
function teamRepo(name: string) {
  const dir = join(root, name)
  mkdirSync(dir)
  const origin = join(dir, 'origin.git')
  git(dir, 'init', '--bare', '-q', '-b', 'main', origin)
  const seed = join(dir, 'seed')
  git(dir, 'init', '-q', '-b', 'main', seed)
  git(seed, 'config', 'user.email', 'seed@test')
  git(seed, 'config', 'user.name', 'Seed')
  writeFileSync(join(seed, 'app.ts'), Array.from({ length: 40 }, (_, i) => `export const line${i + 1} = ${i + 1}`).join('\n') + '\n')
  writeFileSync(join(seed, 'README.md'), '# app\n')
  git(seed, 'add', '-A')
  git(seed, 'commit', '-q', '-m', 'init')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'push', '-q', 'origin', 'main')
  const clone = (who: string) => {
    const c = join(dir, who)
    git(dir, 'clone', '-q', origin, c)
    git(c, 'config', 'user.email', `${who}@test`)
    git(c, 'config', 'user.name', who)
    return c
  }
  return { origin, clone }
}

const editLines = (file: string, from: number, to: number, tag: string) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = from - 1; i < to; i++) lines[i] = `${lines[i]} // ${tag}`
  writeFileSync(file, lines.join('\n'))
}

afterAll(() => {
  // Temp folders are left for the OS to clean; git worktrees reference each other.
})

describe('conflict radar: reading changes', () => {
  it('parses changed line ranges in base coordinates', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,3 +10,4 @@ fn',
      '@@ -40,0 +41,2 @@',
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,5 @@',
      'diff --git a/gone.ts b/gone.ts',
      '--- a/gone.ts',
      '+++ /dev/null',
      '@@ -1,9 +0,0 @@',
      'diff --git a/logo.png b/logo.png',
      'Binary files a/logo.png and b/logo.png differ',
    ].join('\n')
    const r = parseDiffRanges(diff)
    expect(r.get('src/a.ts')).toEqual([
      [10, 12],
      [40, 41],
    ])
    expect(r.get('new.ts')).toBeUndefined()
    expect(r.has('new.ts')).toBe(true)
    expect(r.get('gone.ts')).toEqual([[1, 1e9]])
    expect(r.has('logo.png')).toBe(true)
  })

  it('reads porcelain status, renames included', () => {
    expect(parseStatus(' M src/a.ts\0R  new.ts\0old.ts\0?? notes.md\0')).toEqual([
      { path: 'src/a.ts', untracked: false },
      { path: 'new.ts', untracked: false },
      { path: 'notes.md', untracked: true },
    ])
  })

  it('identifies a repository by its remote, whatever the URL form', () => {
    expect(repoId('git@github.com:Team/App.git')).toBe('github.com/team/app')
    expect(repoId('https://github.com/team/app.git')).toBe('github.com/team/app')
    expect(repoId('ssh://git@github.com/team/app')).toBe('github.com/team/app')
    expect(repoId('https://user:tok@github.com/team/app/')).toBe('github.com/team/app')
  })

  it('scans a real clone: committed-on-branch, uncommitted and untracked files', async () => {
    const { clone } = teamRepo('scan')
    const ada = clone('ada')
    git(ada, 'switch', '-q', '-c', 'feature')
    editLines(join(ada, 'app.ts'), 5, 6, 'ada')
    git(ada, 'commit', '-qam', 'wip')
    writeFileSync(join(ada, 'README.md'), '# app\nmore\n')
    writeFileSync(join(ada, 'todo.md'), 'x')
    writeFileSync(join(ada, 'package-lock.json'), '{}')
    const scan = (await scanChanges(ada))!
    expect(scan.repo).toMatch(/origin$/)
    const byPath = Object.fromEntries(scan.files.map((f) => [f.path, f]))
    expect(byPath['app.ts']).toMatchObject({ ranges: [[5, 6]], uncommitted: false })
    expect(byPath['README.md']).toMatchObject({ uncommitted: true })
    expect(byPath['todo.md']).toMatchObject({ uncommitted: true, ranges: undefined })
    // Lockfiles are regenerated, not merged by hand.
    expect(byPath['package-lock.json']).toBeUndefined()
  })
})

describe('conflict radar: comparing teammates', () => {
  const m = (id: string, files: MemberStatus['changes'], name = id): MemberStatus => ({ id, name, sessions: [], usage: { source: 'plan' }, updatedAt: 1, changes: files })
  const scan = (files: { path: string; ranges?: [number, number][]; uncommitted?: boolean }[], base = 'abc', repo = 'github.com/t/app') => ({
    repo,
    base,
    files: files.map((f) => ({ uncommitted: true, ...f })),
  })

  it('tells same lines from same file, and ignores other repositories', () => {
    const team = [
      m('me', scan([{ path: 'a.ts', ranges: [[10, 20]] }, { path: 'b.ts', ranges: [[1, 3]] }, { path: 'new.ts' }])),
      m('bo', scan([{ path: 'a.ts', ranges: [[18, 30]] }, { path: 'b.ts', ranges: [[50, 60]] }, { path: 'new.ts' }])),
      m('cy', scan([{ path: 'a.ts', ranges: [[1, 2]] }], 'abc', 'github.com/other/repo')),
    ]
    const c = findConflicts(team, 'me')
    expect(c.map((x) => [x.path, x.overlap, x.members.map((y) => y.id)])).toEqual([
      ['a.ts', 'lines', ['me', 'bo']],
      ['new.ts', 'lines', ['me', 'bo']],
      ['b.ts', 'file', ['me', 'bo']],
    ])
  })

  it('only compares line numbers measured from the same commit', () => {
    const c = findConflicts([m('me', scan([{ path: 'a.ts', ranges: [[1, 5]] }], 'aaa')), m('bo', scan([{ path: 'a.ts', ranges: [[1, 5]] }], 'bbb'))], 'me')
    expect(c[0].overlap).toBe('file')
  })
})

describe('handoffs', () => {
  it('names the branch after the teammate and the time', () => {
    expect(handoffBranch('Äda Lovelace', new Date(2026, 10, 14, 23, 5))).toBe('handoff/ada-lovelace-1114-2305')
  })

  it('writes a note from the session record', () => {
    const note = buildHandoffNote({
      title: 'Build the API',
      from: 'Ada',
      project: 'junction',
      prompts: ['Build a REST API for the sensors', 'add tests'],
      todos: [
        { content: 'Endpoints', status: 'completed' },
        { content: 'Tests', status: 'in_progress' },
      ],
      changedFiles: ['src/api.ts'],
      lastReply: 'Endpoints done; tests half way.',
      reason: 'limit',
      resetsAt: '14:05',
      branch: 'handoff/ada-1114-1300',
    })
    expect(note).toMatch(/usage limit ran out \(resets 14:05\)/)
    expect(note).toMatch(/- \[x\] Endpoints/)
    expect(note).toMatch(/- \[ \] Tests \(in progress\)/)
    expect(note).toMatch(/handoff\/ada-1114-1300/)
    expect(takeOverPrompt(note)).toMatch(/^You're taking over/)
  })

  it('pushes a snapshot without touching the giver’s folder, and checks it out for the taker', async () => {
    const { clone } = teamRepo('handoff')
    const ada = clone('ada')
    const bo = clone('bo')
    editLines(join(ada, 'app.ts'), 1, 1, 'half-done')
    writeFileSync(join(ada, 'notes.md'), 'untracked work')
    writeFileSync(join(bo, '.env'), 'EXA_API_KEY="x"\n')
    const statusBefore = git(ada, 'status', '--porcelain')

    const plan = await planHandoff(ada, 'Ada', new Date(2026, 10, 14, 13, 0))
    expect(plan).toMatchObject({ git: true, branch: 'handoff/ada-1114-1300', dirty: 2 })
    expect(plan.problem).toBeUndefined()
    await pushSnapshot(ada, plan.branch, 'WIP handoff from Ada', 'Ada')

    // Ada's branch, index and files are as they were.
    expect(git(ada, 'status', '--porcelain')).toBe(statusBefore)
    expect(git(ada, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main')

    const dir = await checkoutHandoff(bo, plan.branch, plan.repo)
    expect(readFileSync(join(dir, 'app.ts'), 'utf8')).toMatch(/half-done/)
    expect(readFileSync(join(dir, 'notes.md'), 'utf8')).toBe('untracked work')
    // Partner keys came along; Bo's own folder is untouched.
    expect(existsSync(join(dir, '.env'))).toBe(true)
    expect(git(bo, 'status', '--porcelain')).toBe('?? .env')
    // Taking it again reuses the folder.
    expect(await checkoutHandoff(bo, plan.branch, plan.repo)).toBe(dir)
    await expect(checkoutHandoff(bo, plan.branch, 'github.com/someone/else')).rejects.toThrow(/different repository/)
  })

  it('says so when there is no remote to push to', async () => {
    const dir = join(root, 'noremote')
    mkdirSync(dir)
    git(dir, 'init', '-q')
    expect((await planHandoff(dir, 'Ada')).problem).toMatch(/No git remote/)
    const plain = join(root, 'plain')
    mkdirSync(plain)
    expect(await planHandoff(plain, 'Ada')).toMatchObject({ git: false })
  })
})

describe('shared partner keys', () => {
  it('only teammates can open them, and tampering is detected', () => {
    const sealed = sealSecrets('team-token-0123456789', { EXA_API_KEY: 'exa-123' })
    expect(sealed).not.toContain('exa-123')
    expect(openSecrets('team-token-0123456789', sealed)).toEqual({ EXA_API_KEY: 'exa-123' })
    expect(openSecrets('another-team-token-xyz', sealed)).toBeNull()
    expect(openSecrets('team-token-0123456789', sealed.slice(0, -4) + 'AAAA')).toBeNull()
  })
})

describe('two laptops through the relay', () => {
  const services: TeamService[] = []
  afterEach(() => services.splice(0).forEach((s) => s.dispose()))

  const laptop = (id: string, port: number, project: string, extra: Partial<TeamDeps> = {}) => {
    let config: TeamConfig | null = null
    const svc = new TeamService({
      getConfig: () => config,
      setConfig: (c) => (config = c),
      memberId: () => id,
      usesApiKey: () => false,
      planUsage: async () => undefined,
      projectDir: () => project,
      hackforge: async () => undefined,
      push: () => {},
      port,
      ...extra,
    })
    services.push(svc)
    return { svc, config: () => config }
  }

  it('spots the same file on both laptops, warns Claude, shares keys and hands work over', async () => {
    const { clone } = teamRepo('relay')
    const adaDir = clone('ada')
    const boDir = clone('bo')
    editLines(join(adaDir, 'app.ts'), 10, 12, 'ada')
    editLines(join(boDir, 'app.ts'), 11, 14, 'bo')

    const conflictsSeen: Conflict[][] = []
    const keysSeen: TeamKeys[] = []
    const handoffsSeen: OpenHandoff[] = []
    const port = 48000 + Math.floor(Math.random() * 1000)
    const ada = laptop('ada00001', port, adaDir, { sharedSecrets: () => ({ EXA_API_KEY: 'exa-secret' }) })
    const bo = laptop('bo000001', port + 1, boDir, { onConflicts: (c) => conflictsSeen.push(c), onTeamKeys: (k) => keysSeen.push(k), onHandoff: (h) => handoffsSeen.push(h) })
    await ada.svc.create({ name: 'Ada', host: true })
    await bo.svc.join(makeJoinCode(`http://127.0.0.1:${port}`, ada.config()!.token), 'Bo')
    await ada.svc.sync()
    await bo.svc.sync()

    const c = bo.svc.state().conflicts
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ path: 'app.ts', overlap: 'lines', involvesMe: true })
    expect(conflictsSeen.flat().map((x) => x.path)).toEqual(['app.ts'])
    // Claude gets a heads-up before editing it.
    expect(bo.svc.radarFor(join(boDir, 'app.ts'))?.text).toMatch(/app\.ts is also being changed by Ada \(uncommitted, lines 10–12\)/)
    expect(bo.svc.radarFor(join(boDir, 'README.md'))).toBeUndefined()
    // Ada's key reached Bo, decrypted, with who shared it.
    expect(keysSeen.at(-1)).toEqual({ EXA_API_KEY: { value: 'exa-secret', from: 'Ada' } })

    // Ada hands off; Bo is told, takes it, and Ada's board shows who took it.
    ada.svc.offerHandoff({ id: 'h1', title: 'Build the API', note: '# note', branch: 'handoff/ada-x', project: 'relay', reason: 'limit', createdAt: Date.now() })
    await ada.svc.sync()
    await bo.svc.sync()
    expect(handoffsSeen.map((h) => [h.title, h.fromName])).toEqual([['Build the API', 'Ada']])
    expect(bo.svc.findHandoff('h1')).toMatchObject({ fromName: 'Ada', branch: 'handoff/ada-x' })
    bo.svc.markTaken('h1')
    await bo.svc.sync()
    await ada.svc.sync()
    expect(listHandoffs(ada.svc.state().members, Date.now())[0]).toMatchObject({ id: 'h1', takenBy: 'Bo' })
  }, 30_000)
})
