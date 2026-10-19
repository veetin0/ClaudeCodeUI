import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Apps launched from Finder get a minimal PATH, so git, node, brew tools etc. would be
 * invisible to the agent's Bash tool. Borrow the PATH from the user's login shell once.
 */
export function loadLoginShellPath() {
  if (process.platform !== 'darwin') return
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const out = execFileSync(shell, ['-ilc', 'printf "__PATH__%s" "$PATH"'], { encoding: 'utf8', timeout: 5000 })
    const path = out.split('__PATH__')[1]?.trim()
    if (path) process.env.PATH = path
  } catch {
    process.env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH].filter(Boolean).join(':')
  }
}

/**
 * The SDK ships the Claude Code binary in a per-platform npm package. Inside a packaged app it
 * lives in app.asar.unpacked (see asarUnpack in electron-builder.yml), which the SDK cannot find
 * on its own. In dev we let the SDK resolve it.
 */
export function resolveClaudeExecutable(): string | undefined {
  if (!app.isPackaged) return undefined
  try {
    const require = createRequire(import.meta.url)
    const pkg = require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)
    const name = process.platform === 'win32' ? 'claude.exe' : 'claude'
    // Either separator: Windows paths use backslashes.
    const bin = join(dirname(pkg), name).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
    return existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

// Shared with harness-crew, which runs without Electron.
export { agentEnv } from './agentEnv'
