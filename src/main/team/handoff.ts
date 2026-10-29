import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { HandoffPlan } from '@shared/handoff'
import { handoffBranch } from '@shared/team'
import { repoIdentity } from './changes'

const run = promisify(execFile)

function git(dir: string, args: string[], extraEnv: Record<string, string> = {}, timeout = 15_000) {
  return run('git', args, {
    cwd: dir,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    // Never sit waiting for a password prompt nobody can see.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  }).then((r) => r.stdout.trim())
}
const tryGit = (dir: string, args: string[]) => git(dir, args).catch(() => '')

export async function planHandoff(dir: string, memberName: string, now = new Date()): Promise<HandoffPlan> {
  const branch = handoffBranch(memberName, now)
  const root = await tryGit(dir, ['rev-parse', '--show-toplevel'])
  if (!root) return { git: false, branch, dirty: 0, problem: 'This folder isn’t a git repository, so teammates get the note but not the files.' }
  const remote = await tryGit(root, ['remote', 'get-url', 'origin'])
  const status = await tryGit(root, ['status', '--porcelain=v1', '-uall'])
  const dirty = status ? status.split('\n').filter(Boolean).length : 0
  return {
    git: true,
    remote: remote || undefined,
    repo: await repoIdentity(root),
    branch,
    dirty,
    problem: remote ? undefined : 'No git remote (origin), so teammates can’t fetch the work. Push the project to GitHub first, or hand off the note only.',
  }
}

/**
 * Pushes a snapshot of the folder (committed work plus every uncommitted and untracked change,
 * minus .gitignore'd files) to origin as `branch`, without touching your branch, index or files:
 * the commit is built in a temporary index.
 */
export async function pushSnapshot(dir: string, branch: string, message: string, author: string): Promise<void> {
  const root = await git(dir, ['rev-parse', '--show-toplevel'])
  const index = join(tmpdir(), `harness-handoff-${randomUUID()}.index`)
  const env = { GIT_INDEX_FILE: index }
  try {
    const hasHead = !!(await tryGit(root, ['rev-parse', '--verify', '--quiet', 'HEAD']))
    await git(root, hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], env)
    await git(root, ['add', '-A'], env, 60_000)
    const tree = await git(root, ['write-tree'], env)
    // commit-tree needs an identity; fall back to the teammate's name if git has none.
    const identity: Record<string, string> = {}
    if (!(await tryGit(root, ['config', 'user.name']))) Object.assign(identity, { GIT_AUTHOR_NAME: author, GIT_COMMITTER_NAME: author })
    if (!(await tryGit(root, ['config', 'user.email']))) Object.assign(identity, { GIT_AUTHOR_EMAIL: 'harness@localhost', GIT_COMMITTER_EMAIL: 'harness@localhost' })
    const commit = await git(root, ['commit-tree', tree, ...(hasHead ? ['-p', 'HEAD'] : []), '-m', message], identity)
    await git(root, ['push', 'origin', `${commit}:refs/heads/${branch}`], {}, 120_000).catch((err: Error & { stderr?: string }) => {
      throw new Error(`git push failed: ${(err.stderr || err.message).trim().split('\n').slice(-3).join(' ')}`)
    })
  } finally {
    rmSync(index, { force: true })
  }
}

/**
 * Checks out a handoff branch next to the project as its own git worktree (your own folder and
 * branch stay untouched) and copies .env (partner keys) over. Returns the folder.
 */
export async function checkoutHandoff(projectDir: string, branch: string, repo?: string): Promise<string> {
  const root = await tryGit(projectDir, ['rev-parse', '--show-toplevel'])
  if (!root) throw new Error('Your event project isn’t a git repository. Clone the team’s repo and link it first (Hackathon › ⋯ › Use a different project).')
  if (repo && (await repoIdentity(root)) !== repo) throw new Error(`This handoff is for ${repo}, but your event project is a different repository. Link the team’s project first (Hackathon › ⋯ › Use a different project).`)
  await git(root, ['fetch', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], {}, 120_000).catch((err: Error & { stderr?: string }) => {
    throw new Error(`git fetch failed: ${(err.stderr || err.message).trim().split('\n').slice(-2).join(' ')}`)
  })
  // Already checked out (taken before)? Use that folder.
  const list = await tryGit(root, ['worktree', 'list', '--porcelain'])
  const existing = list.split('\n\n').find((b) => b.includes(`branch refs/heads/${branch}`))
  const existingDir = existing && /^worktree (.+)$/m.exec(existing)?.[1]
  if (existingDir && existsSync(existingDir)) return existingDir
  const name = `${basename(root)}-${branch.replace(/^handoff\//, '')}`
  let dir = join(dirname(root), name)
  for (let i = 2; existsSync(dir); i++) dir = join(dirname(root), `${name}-${i}`)
  await git(root, ['worktree', 'add', '-B', branch, dir, `origin/${branch}`], {}, 60_000)
  const env = join(root, '.env')
  if (existsSync(env)) copyFileSync(env, join(dir, '.env'))
  return dir
}
