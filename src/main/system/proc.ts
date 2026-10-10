import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'

export const isWindows = process.platform === 'win32'

/** cmd.exe quoting: plain tokens stay bare, anything else is double-quoted with inner quotes doubled. */
export function quoteWin(arg: string): string {
  return /^[\w./:=@+,\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '""')}"`
}

/**
 * Spawns a command-line tool the same way on every OS. On Windows, npm/npx/pnpm and every
 * node_modules/.bin entry are `.cmd` shims, which Node only runs through a shell (and refuses
 * to spawn directly), and `detached` would open a console window, so neither is used there.
 * `group: true` puts the tool in its own process group on macOS/Linux so killTree() stops its children.
 */
export function spawnTool(cmd: string, args: string[], opts: SpawnOptions & { group?: boolean } = {}): ChildProcess {
  const { group, ...rest } = opts
  if (!isWindows) return spawn(cmd, args, { ...rest, detached: group ?? rest.detached })
  let exe = cmd
  if (!/\.(exe|cmd|bat|com)$/i.test(exe) && existsSync(`${exe}.cmd`)) exe = `${exe}.cmd`
  return spawn([exe, ...args].map(quoteWin).join(' '), { ...rest, shell: true, windowsHide: true, detached: false })
}

/** Stops a tool and everything it started (npm → node → the dev server). */
export function killTree(proc: ChildProcess) {
  if (!proc.pid || proc.exitCode !== null) return
  if (isWindows) {
    spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true }).on('error', () => proc.kill())
    return
  }
  try {
    process.kill(-proc.pid, 'SIGTERM')
  } catch {
    proc.kill('SIGTERM')
  }
}

/** The interactive shell for terminal tabs, and how to run one command in it. */
export function terminalShell(command?: string): { file: string; args: string[] } {
  if (isWindows) {
    // PowerShell is on every Windows install; pwsh (PowerShell 7) is nicer when present.
    const file = process.env.HARNESS_SHELL || 'powershell.exe'
    return { file, args: command ? ['-NoLogo', '-NoExit', '-Command', command] : ['-NoLogo'] }
  }
  const file = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  // A login shell so PATH, aliases and nvm etc. behave as in Terminal.app.
  return { file, args: command ? ['-l', '-c', command] : ['-l'] }
}

/** The shell to use when the configured one (HARNESS_SHELL / SHELL) can't be started. */
export function fallbackShell(command?: string): { file: string; args: string[] } {
  if (isWindows) return { file: 'powershell.exe', args: command ? ['-NoLogo', '-NoExit', '-Command', command] : ['-NoLogo'] }
  const file = process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh'
  return { file, args: command ? ['-l', '-c', command] : ['-l'] }
}
