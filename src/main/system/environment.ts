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
    const bin = join(dirname(pkg), 'claude').replace(`app.asar${'/'}`, `app.asar.unpacked/`)
    return existsSync(bin) ? bin : undefined
  } catch {
    return undefined
  }
}

/**
 * Variables that tie a process to a *parent* Claude Code session. They are present when Harness is
 * launched from a terminal inside Claude Code (e.g. `npm run dev` run by Claude), and would make our
 * sessions share the parent's task list and identity.
 */
const PARENT_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_PID',
]

export function agentEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env, ...extra }
  for (const k of PARENT_SESSION_VARS) delete env[k]
  return env
}
