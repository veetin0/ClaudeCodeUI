import { execFile } from 'node:child_process'
import { watch, type FSWatcher } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MAX_FILES = 5000

/** Directories never worth showing or watching. */
export const IGNORED_DIRS = new Set(['.git', 'node_modules', 'out', 'dist', 'build', '.next', '.cache', '__pycache__', '.venv', 'venv', '.turbo', 'coverage', '.DS_Store'])

const ignored = (rel: string) => rel.split('/').some((seg) => IGNORED_DIRS.has(seg))

/** Project files as relative paths: git's view when it's a repo (respects .gitignore), else a capped walk. */
export async function listFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await run('git', ['ls-files', '-co', '--exclude-standard'], { cwd, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' })
    return stdout.split('\n').filter((f) => f && !ignored(f)).slice(0, MAX_FILES)
  } catch {
    const out: string[] = []
    const walk = async (dir: string, rel: string) => {
      if (out.length >= MAX_FILES) return
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        if (out.length >= MAX_FILES) return
        if (IGNORED_DIRS.has(e.name)) continue
        const r = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) await walk(join(dir, e.name), r)
        else if (e.isFile()) out.push(r)
      }
    }
    await walk(cwd, '')
    return out
  }
}

/**
 * Watches a project recursively (native on macOS) and reports changed files, debounced per path.
 * The caller decides created/modified/deleted by checking the disk.
 */
export function watchProject(cwd: string, onChange: (rel: string) => void): FSWatcher | null {
  const pending = new Map<string, NodeJS.Timeout>()
  try {
    const w = watch(cwd, { recursive: true }, (_event, file) => {
      if (!file) return
      // Windows reports `src\a.ts`; everything downstream uses forward slashes.
      const rel = file.toString().replace(/\\/g, '/')
      if (ignored(rel)) return
      clearTimeout(pending.get(rel))
      pending.set(
        rel,
        setTimeout(() => {
          pending.delete(rel)
          onChange(rel)
        }, 150),
      )
    })
    w.on('error', () => w.close())
    return w
  } catch {
    return null
  }
}
