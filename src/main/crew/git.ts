import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join } from 'node:path'

export interface GitResult {
  code: number
  out: string
  err: string
}

/** Runs git, never waiting for a prompt nobody would see. */
export function git(args: string[], opts: { cwd?: string; timeout?: number; env?: Record<string, string> } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env },
      windowsHide: true,
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out = (out + d).slice(-2_000_000)))
    child.stderr?.on('data', (d) => (err = (err + d).slice(-20_000)))
    const timer = setTimeout(() => child.kill(), opts.timeout ?? 60_000)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, out, err: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out: out.trim(), err: err.trim() })
    })
  })
}

const must = async (args: string[], opts: Parameters<typeof git>[1]) => {
  const r = await git(args, opts)
  if (r.code !== 0) throw new Error(lastLines(r.err || r.out) || `git ${args[0]} failed`)
  return r.out
}

/** The last two lines of git's output, for a one-line error. */
export const lastLines = (s: string) =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('hint:'))
    .slice(-2)
    .join(' ')
    .slice(0, 300)

// ---------- the lead's side ----------

export interface DriverRepo {
  repo?: { base: string; name: string; head: string; url?: string }
  /** Changes to all branches: a new value means crew needs a new copy. */
  fingerprint?: string
  problem?: string
  /** Uncommitted changes to tracked files (crew only gets what's committed). */
  dirty?: boolean
}

/**
 * The project the lead shares with the crew: its current branch (missions start from it), the
 * folder name, and a fingerprint of every branch head. No remote needed: the project travels to
 * crew members through the team server as a git bundle.
 */
export async function driverRepo(dir: string): Promise<DriverRepo> {
  const top = (await git(['rev-parse', '--show-toplevel'], { cwd: dir })).out
  if (!top) return { problem: 'This folder isn’t a git repository yet.' }
  const head = (await git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: dir })).out
  if (!head) return { problem: 'The project has no commits yet.' }
  const base = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir })).out
  if (!base || base === 'HEAD') return { problem: 'The project is in a detached HEAD state; check out the branch the crew should start from.' }
  const refs = (await git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads'], { cwd: dir })).out
  const url = (await git(['remote', 'get-url', 'origin'], { cwd: dir })).out || undefined
  const status = await git(['status', '--porcelain', '--untracked-files=no'], { cwd: dir })
  return {
    repo: { base, name: basename(top).replace(/[^\w.-]/g, '-') || 'project', head, url },
    fingerprint: createHash('sha1').update(refs).digest('hex').slice(0, 16),
    dirty: !!status.out,
  }
}

/** A git bundle of every branch of the project, for crew members to clone or update from. */
export async function makeProjectBundle(dir: string, file: string): Promise<void> {
  await must(['bundle', 'create', file, '--branches'], { cwd: dir, timeout: 300_000 })
}

/** Brings a crew member's finished mission in as a local branch of the same name. */
export async function importResultBundle(dir: string, file: string, branch: string): Promise<void> {
  await must(['fetch', '--no-tags', '--force', file, `+refs/heads/${branch}:refs/heads/${branch}`], { cwd: dir, timeout: 300_000 })
}

/** The commit a branch points at, or undefined. */
export async function branchHead(dir: string, branch: string): Promise<string | undefined> {
  return (await git(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: dir })).out || undefined
}

// ---------- the crew member's side ----------

/**
 * Brings the lead's branches in as origin/<branch> from a project bundle, creating the folder (and
 * a checkout of the base branch) the first time.
 */
export async function syncFromBundle(dir: string, file: string, base: string): Promise<void> {
  const fresh = !existsSync(join(dir, '.git'))
  if (fresh) {
    mkdirSync(dir, { recursive: true })
    await must(['init', '-q'], { cwd: dir })
  }
  await must(['fetch', '--no-tags', '--force', file, '+refs/heads/*:refs/remotes/origin/*'], { cwd: dir, timeout: 300_000 })
  if (fresh) await must(['checkout', '-q', '-B', base, `origin/${base}`], { cwd: dir })
}

/** Whether a commit is in this clone. */
export async function hasCommit(dir: string, sha: string): Promise<boolean> {
  return (await git(['cat-file', '-e', `${sha}^{commit}`], { cwd: dir })).code === 0
}

/** Gives the clone a commit identity when git has none (commits would fail otherwise). */
export async function ensureIdentity(dir: string, name: string, email: string) {
  if (!(await git(['config', 'user.name'], { cwd: dir })).out) await git(['config', 'user.name', name], { cwd: dir })
  if (!(await git(['config', 'user.email'], { cwd: dir })).out) await git(['config', 'user.email', email], { cwd: dir })
}

/**
 * Puts the clone on a fresh mission branch from the lead's <from>. Leftovers from a mission that was
 * cut off (harness-crew closed mid-way) are stashed, never thrown away. Returns the starting commit.
 */
export async function startMissionBranch(dir: string, from: string, branch: string): Promise<string> {
  if ((await git(['status', '--porcelain'], { cwd: dir })).out)
    await git(['stash', 'push', '-u', '-m', `harness-crew: left over before ${branch}`], { cwd: dir })
  await must(['checkout', '-q', '-B', branch, `origin/${from}`], { cwd: dir })
  return must(['rev-parse', 'HEAD'], { cwd: dir })
}

export interface MissionResult {
  commit?: string
  commits: number
  files: string[]
  /** A bundle of the mission's commits (from the starting commit), when there are any. */
  bundle?: string
  error?: string
}

/** Commits anything left uncommitted and bundles the mission's commits for the lead. */
export async function finishMissionBranch(dir: string, start: string, branch: string, message: string, bundleFile: string): Promise<MissionResult> {
  if ((await git(['status', '--porcelain'], { cwd: dir })).out) {
    await git(['add', '-A'], { cwd: dir, timeout: 120_000 })
    await git(['commit', '-q', '-m', message, '--no-verify'], { cwd: dir })
  }
  const commit = (await git(['rev-parse', 'HEAD'], { cwd: dir })).out || undefined
  const commits = Number((await git(['rev-list', '--count', `${start}..HEAD`], { cwd: dir })).out) || 0
  const files = (await git(['diff', '--name-only', `${start}..HEAD`], { cwd: dir })).out.split('\n').filter(Boolean)
  if (!commits) return { commit, commits, files }
  const r = await git(['bundle', 'create', bundleFile, `refs/heads/${branch}`, `^${start}`], { cwd: dir, timeout: 300_000 })
  return r.code === 0 ? { commit, commits, files, bundle: bundleFile } : { commit, commits, files, error: lastLines(r.err || r.out) || 'git bundle failed' }
}
