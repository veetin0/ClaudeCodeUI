import { execFile } from 'node:child_process'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { MAX_CHANGED_FILES, type ChangeScan, type FileChangeInfo } from '@shared/team'
import { generatedKind } from '@shared/usageSaver'

const run = promisify(execFile)
const git = (dir: string, args: string[]) =>
  run('git', args, { cwd: dir, timeout: 8000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } }).then((r) => r.stdout)
const tryGit = (dir: string, args: string[]) => git(dir, args).catch(() => '')

/** "github.com/team/app" from any form of a remote URL; undefined without one. */
export function repoId(remoteUrl: string): string | undefined {
  const u = remoteUrl.trim()
  if (!u) return undefined
  const scp = /^[\w.-]+@([^:]+):(.+)$/.exec(u)
  const path = scp ? `${scp[1]}/${scp[2]}` : u.replace(/^[a-z+]+:\/\/([^@/]*@)?/i, '')
  return path.replace(/\.git$/, '').replace(/\/+$/, '').toLowerCase()
}

/** The repository's identity, for comparing teammates' changes (same remote = same project). */
export async function repoIdentity(dir: string): Promise<string> {
  return repoId(await tryGit(dir, ['remote', 'get-url', 'origin'])) ?? `local/${basename(dir).toLowerCase()}`
}

/**
 * Parses `git diff -U0` into changed line ranges per file, in the base version's line numbers
 * (so two teammates measured from the same commit can be compared).
 */
export function parseDiffRanges(diff: string): Map<string, [number, number][] | undefined> {
  const out = new Map<string, [number, number][] | undefined>()
  let current: string | null = null
  let oldPath: string | null = null
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      oldPath = null
      continue
    }
    if (line.startsWith('--- ')) {
      oldPath = line === '--- /dev/null' ? null : line.slice(4).replace(/^a\//, '')
      continue
    }
    if (line.startsWith('+++ ')) {
      const newPath = line === '+++ /dev/null' ? null : line.slice(4).replace(/^b\//, '')
      current = newPath ?? oldPath
      if (!current) continue
      // New file: no base lines to compare. Deleted file: all of it.
      out.set(current, oldPath === null ? undefined : newPath === null ? [[1, 1e9]] : [])
      continue
    }
    const binary = /^Binary files (?:a\/(.+?)|\/dev\/null) and (?:b\/(.+?)|\/dev\/null) differ$/.exec(line)
    if (binary) {
      out.set(binary[2] ?? binary[1], undefined)
      continue
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(line)
    if (hunk && current) {
      const start = Number(hunk[1])
      const count = hunk[2] === undefined ? 1 : Number(hunk[2])
      // A pure insertion sits between `start` and the next line.
      const range: [number, number] = count === 0 ? [Math.max(1, start), start + 1] : [start, start + count - 1]
      const list = out.get(current)
      // A deleted file already counts as a whole.
      if (list && list.length < 24 && list[0]?.[1] !== 1e9) list.push(range)
    }
  }
  return out
}

/** Paths from `git status --porcelain -z`, with whether each is untracked. */
export function parseStatus(z: string): { path: string; untracked: boolean }[] {
  const out: { path: string; untracked: boolean }[] = []
  const parts = z.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.length < 4) continue
    const code = p.slice(0, 2)
    out.push({ path: p.slice(3), untracked: code === '??' })
    // Renames and copies are followed by the old path.
    if (code[0] === 'R' || code[0] === 'C') i++
  }
  return out
}

/** The commit this branch left the team's main branch at (origin's default), or HEAD without one. */
async function branchPoint(dir: string): Promise<string | undefined> {
  const head = (await tryGit(dir, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'])).trim()
  const candidates = [head, 'refs/remotes/origin/main', 'refs/remotes/origin/master'].filter(Boolean)
  for (const ref of candidates) {
    const base = (await tryGit(dir, ['merge-base', 'HEAD', ref])).trim()
    if (base) return base
  }
  return (await tryGit(dir, ['rev-parse', 'HEAD'])).trim() || undefined
}

/**
 * Every file this laptop changed in the project: committed on this branch since it left main, or
 * not committed yet (untracked files too). Lockfiles and build output are left out: they're
 * regenerated, not merged by hand.
 */
export async function scanChanges(dir: string): Promise<(ChangeScan & { root: string }) | undefined> {
  const root = (await tryGit(dir, ['rev-parse', '--show-toplevel'])).trim()
  if (!root) return undefined
  const [repo, base, statusZ] = await Promise.all([repoIdentity(dir), branchPoint(dir), tryGit(dir, ['status', '--porcelain=v1', '-z', '-uall'])])
  const diff = base ? await tryGit(dir, ['-c', 'core.quotePath=false', 'diff', '-U0', '--no-color', '--no-ext-diff', '--find-renames', base]) : ''
  const ranges = parseDiffRanges(diff)
  const status = parseStatus(statusZ)
  const uncommitted = new Set(status.map((s) => s.path))
  const files = new Map<string, FileChangeInfo>()
  for (const [path, r] of ranges) files.set(path, { path, ranges: r, uncommitted: uncommitted.has(path) })
  for (const s of status) if (!files.has(s.path)) files.set(s.path, { path: s.path, ranges: undefined, uncommitted: true })
  const list = [...files.values()].filter((f) => !generatedKind(f.path) && !f.path.endsWith('/')).slice(0, MAX_CHANGED_FILES)
  return { repo, base: base?.slice(0, 12), files: list, root }
}
