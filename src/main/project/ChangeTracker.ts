import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { relative } from 'node:path'
import { normPath } from '@shared/paths'
import { promisify } from 'node:util'
import { diffLines } from 'diff'
import type { FileChange, HarnessEvent } from '@shared/events'
import type { FileDiff } from '@shared/ipc'

const run = promisify(execFile)
const MAX_BYTES = 2 * 1024 * 1024
const DEBOUNCE_MS = 300

/** Where snapshots live (SessionStore implements it). */
export interface SnapshotStore {
  getSnapshots(sessionId: string): Map<string, string | null>
  saveSnapshot(sessionId: string, path: string, original: string | null): void
  deleteSnapshot(sessionId: string, path: string): void
}

/** Reads a text file; undefined if missing, too large or binary. */
async function readText(path: string): Promise<string | null | undefined> {
  try {
    const st = await stat(path)
    if (!st.isFile()) return undefined
    if (st.size > MAX_BYTES) return undefined
    const buf = await readFile(path)
    if (buf.includes(0)) return undefined
    return buf.toString('utf8')
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'ENOENT' ? null : undefined
  }
}

/**
 * Tracks what a session changed. Before an agent edits a file (PreToolUse hook) the original is
 * snapshotted; files changed some other way (a script, a formatter) fall back to git's HEAD version.
 * The diff for every file is then "original vs. what's on disk now".
 */
export class ChangeTracker {
  private snapshots: Map<string, string | null>
  private timer: NodeJS.Timeout | null = null
  private last = ''

  constructor(
    private readonly sessionId: string,
    private readonly cwd: string,
    private readonly store: SnapshotStore,
    private readonly emit: (e: HarnessEvent) => void,
  ) {
    this.snapshots = store.getSnapshots(sessionId)
    if (this.snapshots.size) this.schedule()
  }

  /** Call before an agent writes `path`. Keeps the first snapshot only. */
  async beforeEdit(path: string) {
    path = normPath(path)
    if (this.snapshots.has(path)) return
    const original = await readText(path)
    if (original === undefined) return
    this.remember(path, original)
  }

  /** A file changed on disk without a prior snapshot: try git for a baseline. */
  async onDiskChange(path: string, change: 'created' | 'modified' | 'deleted') {
    path = normPath(path)
    // Created and deleted within the session (e.g. an atomic-write temp file): nothing to track.
    if (change === 'deleted' && this.snapshots.get(path) === null) return this.forget(path)
    if (!this.snapshots.has(path)) {
      const fromGit = await this.gitHead(path)
      if (fromGit !== undefined) this.remember(path, fromGit)
      else if (change === 'created') this.remember(path, null)
    }
    this.schedule()
  }

  /** After an edit tool finished. */
  touched() {
    this.schedule()
  }

  async diff(path: string): Promise<FileDiff> {
    path = normPath(path)
    const current = (await readText(path)) ?? null
    if (this.snapshots.has(path)) return { path, original: this.snapshots.get(path) ?? null, current, hasBaseline: true }
    const fromGit = await this.gitHead(path)
    return { path, original: fromGit ?? current, current, hasBaseline: fromGit !== undefined }
  }

  async revert(path: string) {
    path = normPath(path)
    if (!this.snapshots.has(path)) throw new Error('No saved original for this file.')
    const original = this.snapshots.get(path)
    if (original === null) {
      if (existsSync(path)) await unlink(path)
    } else if (original !== undefined) {
      await writeFile(path, original)
    }
    this.forget(path)
  }

  accept(path: string) {
    path = normPath(path)
    this.forget(path)
  }

  async summarize(): Promise<FileChange[]> {
    const out: FileChange[] = []
    for (const [path, original] of this.snapshots) {
      const current = await readText(path)
      if (current === undefined || current === original) continue
      if (original === null && current === null) continue
      let additions = 0
      let deletions = 0
      for (const part of diffLines(original ?? '', current ?? '')) {
        if (part.added) additions += part.count ?? 0
        else if (part.removed) deletions += part.count ?? 0
      }
      out.push({ path, status: original === null ? 'added' : current === null ? 'deleted' : 'modified', additions, deletions })
    }
    return out.sort((a, b) => a.path.localeCompare(b.path))
  }

  dispose() {
    if (this.timer) clearTimeout(this.timer)
  }

  private remember(path: string, original: string | null) {
    this.snapshots.set(path, original)
    this.store.saveSnapshot(this.sessionId, path, original)
  }

  private forget(path: string) {
    this.snapshots.delete(path)
    this.store.deleteSnapshot(this.sessionId, path)
    this.schedule()
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.publish(), DEBOUNCE_MS)
  }

  private async publish() {
    this.timer = null
    const files = await this.summarize()
    const key = JSON.stringify(files)
    if (key === this.last) return
    this.last = key
    this.emit({ type: 'changes.updated', files, sessionId: this.sessionId, ts: Date.now() })
  }

  /** HEAD version of a file inside a git repo; undefined if not tracked / not a repo. */
  private async gitHead(path: string): Promise<string | undefined> {
    const rel = relative(this.cwd, path)
    if (rel.startsWith('..')) return undefined
    try {
      const { stdout } = await run('git', ['show', `HEAD:./${rel.replace(/\\/g, '/')}`], { cwd: this.cwd, maxBuffer: MAX_BYTES, encoding: 'utf8' })
      return stdout.includes('\0') ? undefined : stdout
    } catch {
      return undefined
    }
  }
}
