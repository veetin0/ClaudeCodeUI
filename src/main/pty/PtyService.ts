import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute } from 'node:path'
import type { WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import { fallbackShell, terminalShell } from '../system/proc'
import { IPC, type PtyOptions } from '@shared/ipc'
import { agentEnv } from '../system/environment'

const FLUSH_MS = 16

/** Real terminals (node-pty) streamed to xterm.js in the renderer. */
export class PtyService {
  /** Sees every chunk of terminal output (used to spot dev-server URLs). */
  constructor(private readonly onOutput?: (cwd: string, data: string) => void) {}

  private ptys = new Map<string, { pty: IPty; owner: WebContents; buffer: string; timer: NodeJS.Timeout | null }>()

  create(owner: WebContents, opts: PtyOptions): string {
    const id = randomUUID()
    const start = (shell: { file: string; args: string[] }) => {
      // On macOS/Linux a missing shell doesn't throw: the terminal just exits with code 1, silently.
      if (isAbsolute(shell.file) && !existsSync(shell.file)) throw new Error('not found')
      return spawn(shell.file, shell.args, {
        name: 'xterm-256color',
        cols: Math.max(2, opts.cols),
        rows: Math.max(2, opts.rows),
        cwd: opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir(),
        env: { ...agentEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Harness' } as Record<string, string>,
      })
    }
    // node-pty throws when the shell can't be started (e.g. HARNESS_SHELL=pwsh.exe without
    // PowerShell 7): fall back to the system shell and say so in the terminal.
    const wanted = terminalShell(opts.command)
    let pty: IPty
    let notice = ''
    try {
      pty = start(wanted)
    } catch (err) {
      const fallback = fallbackShell(opts.command)
      const why = err instanceof Error ? err.message : String(err)
      if (fallback.file === wanted.file) throw new Error(`Couldn't start the terminal shell ${wanted.file}: ${why}`)
      try {
        pty = start(fallback)
      } catch (err2) {
        throw new Error(`Couldn't start the terminal shell ${wanted.file} (${why}) or ${fallback.file} (${err2 instanceof Error ? err2.message : err2}).`)
      }
      notice = `\x1b[33m[Harness] Couldn't start ${wanted.file} (${why}); using ${fallback.file}. Check HARNESS_SHELL / SHELL.\x1b[0m\r\n`
    }
    const entry = { pty, owner, buffer: notice, timer: null as NodeJS.Timeout | null }
    this.ptys.set(id, entry)

    // Coalesce output into ~60fps frames; a busy build can emit thousands of tiny chunks.
    const schedule = () =>
      (entry.timer ??= setTimeout(() => {
        entry.timer = null
        if (!owner.isDestroyed()) owner.send(IPC.ptyData, id, entry.buffer)
        entry.buffer = ''
      }, FLUSH_MS))
    if (notice) schedule()
    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()
    pty.onData((data) => {
      this.onOutput?.(cwd, data)
      entry.buffer += data
      schedule()
    })
    pty.onExit(({ exitCode }) => {
      if (entry.timer) clearTimeout(entry.timer)
      if (!owner.isDestroyed()) {
        if (entry.buffer) owner.send(IPC.ptyData, id, entry.buffer)
        owner.send(IPC.ptyExit, id, exitCode)
      }
      this.ptys.delete(id)
    })
    owner.once('destroyed', () => this.kill(id))
    return id
  }

  write(id: string, data: string) {
    this.ptys.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.ptys.get(id)?.pty.resize(Math.max(2, cols), Math.max(2, rows))
    } catch {
      // The process may have just exited.
    }
  }

  kill(id: string) {
    const e = this.ptys.get(id)
    if (!e) return
    this.ptys.delete(id)
    try {
      e.pty.kill()
    } catch {
      // already gone
    }
  }

  killAll() {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
}
