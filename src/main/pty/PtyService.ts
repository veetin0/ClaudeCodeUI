import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import { terminalShell } from '../system/proc'
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
    const { file, args } = terminalShell(opts.command)
    const pty = spawn(file, args, {
      name: 'xterm-256color',
      cols: Math.max(2, opts.cols),
      rows: Math.max(2, opts.rows),
      cwd: opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir(),
      env: { ...agentEnv(), TERM: 'xterm-256color', COLORTERM: 'truecolor', TERM_PROGRAM: 'Harness' } as Record<string, string>,
    })
    const entry = { pty, owner, buffer: '', timer: null as NodeJS.Timeout | null }
    this.ptys.set(id, entry)

    // Coalesce output into ~60fps frames; a busy build can emit thousands of tiny chunks.
    const cwd = opts.cwd && existsSync(opts.cwd) ? opts.cwd : homedir()
    pty.onData((data) => {
      this.onOutput?.(cwd, data)
      entry.buffer += data
      entry.timer ??= setTimeout(() => {
        entry.timer = null
        if (!owner.isDestroyed()) owner.send(IPC.ptyData, id, entry.buffer)
        entry.buffer = ''
      }, FLUSH_MS)
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
