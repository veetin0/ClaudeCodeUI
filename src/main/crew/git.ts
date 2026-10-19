import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { httpsVariant, type CrewRepo } from '@shared/crew'
import { repoId } from '../team/changes'

export interface GitResult {
  code: number
  out: string
  err: string
}

/**
 * Runs git. `interactive` lets git ask for credentials in the terminal (the first clone in
 * harness-crew); everything else must never sit waiting for a prompt nobody sees.
 */
export function git(args: string[], opts: { cwd?: string; interactive?: boolean; timeout?: number; env?: Record<string, string> } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd: opts.cwd,
      stdio: opts.interactive ? ['inherit', 'pipe', 'inherit'] : ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: opts.interactive ? '1' : '0', ...opts.env },
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

/** Same remote, whatever the URL form (https vs SSH, .git or not). */
export const sameRepo = (a: string, b: string) => repoId(a) === repoId(b)

/** The project a driver's session works in: its origin and current branch. */
export type DriverRepo = { repo?: CrewRepo; problem?: string; ahead?: number; dirty?: boolean }

export async function driverRepo(dir: string): Promise<DriverRepo> {
  const url = (await git(['remote', 'get-url', 'origin'], { cwd: dir })).out
  if (!url)
    return {
      problem:
        'This project has no git remote (origin). Crew members clone it from there: push it to GitHub first (git remote add origin … && git push -u origin main).',
    }
  const base = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir })).out
  if (!base || base === 'HEAD') return { problem: 'This project is in a detached HEAD state; check out the branch crew should start from.' }
  const top = (await git(['rev-parse', '--show-toplevel'], { cwd: dir })).out
  const name = (repoId(url)?.split('/').pop() ?? top.split(/[\\/]/).pop() ?? 'project').replace(/[^\w.-]/g, '-')
  const upstream = await git(['rev-list', '--count', `origin/${base}..${base}`], { cwd: dir })
  const status = await git(['status', '--porcelain', '--untracked-files=no'], { cwd: dir })
  return {
    repo: { url, base, name },
    // -1: the branch isn't on origin at all.
    ahead: upstream.code === 0 ? Number(upstream.out) || 0 : -1,
    dirty: !!status.out,
  }
}

/**
 * The crew member's copy of the driver's project under `home`: an existing clone of the same
 * remote, or a fresh one (trying HTTPS when the driver's remote is SSH and that fails).
 */
export async function ensureClone(repo: CrewRepo, home: string, interactive: boolean): Promise<{ dir: string; url: string }> {
  for (let i = 0; i < 20; i++) {
    const dir = join(home, i ? `${repo.name}-${i + 1}` : repo.name)
    if (existsSync(dir)) {
      const origin = (await git(['remote', 'get-url', 'origin'], { cwd: dir })).out
      if (origin && sameRepo(origin, repo.url)) {
        await git(['fetch', 'origin', '--prune'], { cwd: dir, timeout: 120_000 })
        return { dir, url: origin }
      }
      continue
    }
    const urls = [repo.url, httpsVariant(repo.url)].filter((u): u is string => !!u)
    let error = ''
    for (const url of urls) {
      const r = await git(['clone', url, dir], { interactive, timeout: 15 * 60_000 })
      if (r.code === 0) return { dir, url }
      error = lastLines(r.err || r.out) || `exit ${r.code}`
    }
    throw new Error(`Couldn't clone ${repo.url}: ${error}`)
  }
  throw new Error(`Too many folders named ${repo.name} in ${home}`)
}

/** Whether this laptop may push to the remote (a dry-run push of a new branch: GitHub checks access). */
export async function checkPush(dir: string, probeBranch: string): Promise<string | undefined> {
  const r = await git(['push', '--dry-run', 'origin', `HEAD:refs/heads/${probeBranch}`], { cwd: dir, timeout: 60_000 })
  return r.code === 0 ? undefined : lastLines(r.err || r.out) || 'push was refused'
}

/** Gives the clone a commit identity when git has none (commits would fail otherwise). */
export async function ensureIdentity(dir: string, name: string, email: string) {
  if (!(await git(['config', 'user.name'], { cwd: dir })).out) await git(['config', 'user.name', name], { cwd: dir })
  if (!(await git(['config', 'user.email'], { cwd: dir })).out) await git(['config', 'user.email', email], { cwd: dir })
}

/**
 * Puts the clone on a fresh mission branch from origin/<from>. Leftovers from a mission that was cut
 * off (harness-crew closed mid-way) are stashed, never thrown away. Returns the starting commit.
 */
export async function startMissionBranch(dir: string, from: string, branch: string): Promise<string> {
  await must(['fetch', 'origin', '--prune'], { cwd: dir, timeout: 120_000 })
  if ((await git(['status', '--porcelain'], { cwd: dir })).out)
    await git(['stash', 'push', '-u', '-m', `harness-crew: left over before ${branch}`], { cwd: dir })
  await must(['checkout', '-B', branch, `origin/${from}`], { cwd: dir })
  return must(['rev-parse', 'HEAD'], { cwd: dir })
}

export interface MissionResult {
  commit?: string
  commits: number
  files: string[]
  pushError?: string
}

/** Commits anything left uncommitted and pushes the mission branch. */
export async function finishMissionBranch(dir: string, start: string, branch: string, message: string): Promise<MissionResult> {
  if ((await git(['status', '--porcelain'], { cwd: dir })).out) {
    await git(['add', '-A'], { cwd: dir, timeout: 120_000 })
    await git(['commit', '-m', message, '--no-verify'], { cwd: dir })
  }
  const commit = (await git(['rev-parse', 'HEAD'], { cwd: dir })).out || undefined
  const commits = Number((await git(['rev-list', '--count', `${start}..HEAD`], { cwd: dir })).out) || 0
  const files = (await git(['diff', '--name-only', `${start}..HEAD`], { cwd: dir })).out.split('\n').filter(Boolean)
  if (!commits) return { commit, commits, files }
  // The branch is this mission's alone, so a retry may overwrite an earlier push of it.
  const r = await git(['push', '--force', '-u', 'origin', `HEAD:refs/heads/${branch}`], { cwd: dir, timeout: 180_000 })
  return { commit, commits, files, pushError: r.code === 0 ? undefined : lastLines(r.err || r.out) || 'push failed' }
}
