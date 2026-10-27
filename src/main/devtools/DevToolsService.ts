import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import {
  BROWSER_SERVER,
  DOCS_SERVER,
  REA_SERVER,
  REA_VERSION,
  devToolsGuide,
  nodeRunsRea,
  reaRunsWithoutAsking,
  type BrowserInfo,
  type DevToolsSettings,
  type DevToolsState,
  type ReaInfo,
  type ReaTool,
} from '@shared/devtools'
import type { ResolvedPartnerMcp } from '@shared/partners'

export interface DevToolsDeps {
  /** Folder holding Harness's node_modules (the app path; app.asar when packaged). */
  appPath: string
  /** Where Harness keeps a downloaded Chromium and the browser's automatic output. */
  dataDir: string
  settings(): DevToolsSettings
  context7Key(): string | undefined
  /** Partner servers: for a session's folder, or all of them (with missing keys) when no folder is given. */
  partnerServers(cwd?: string): { id: string; name: string; server: ResolvedPartnerMcp | { missing: string[] } }[]
  eventProject(): string | undefined
  push(state: DevToolsState): void
  /** Runs a bundled Node script (Electron as Node). Injected for tests. */
  node?: { command: string; env: Record<string, string> }
  findBrowser?(): { path: string; via: string } | null
  runInstall?(script: string, env: Record<string, string>): Promise<{ code: number; out: string }>
  /** Where a bundled module's file is (harness-crew installs them next to itself, not under appPath). */
  resolveModule?(rel: string): string
  /** Who downloaded Chromium, for the browser's label (default Harness). */
  appName?: string
  /** The user's own Node on PATH (REA needs a newer one than Electron's): its version and path. */
  findNode?(): { version: string; path: string } | null
  /** Runs npm with these arguments (installs REA). */
  runNpm?(args: string[]): Promise<{ code: number; out: string }>
  /** Claude Code's user config (~/.claude.json), where `npx rea-agents setup` registers REA. */
  claudeConfigPath?: string
}

export const PLAYWRIGHT_MCP = join('@playwright', 'mcp', 'cli.js')
// The Playwright build @playwright/mcp pins, so a downloaded Chromium matches it.
export const PLAYWRIGHT_CLI = join('@playwright', 'mcp', 'node_modules', 'playwright-core', 'cli.js')

/** Google Chrome or Microsoft Edge where they're normally installed. */
export function systemBrowsers(platform = process.platform, env = process.env): { path: string; via: string }[] {
  const home = env.HOME ?? env.USERPROFILE ?? ''
  if (platform === 'darwin') {
    return [
      { path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', via: 'Google Chrome' },
      { path: join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'), via: 'Google Chrome' },
      { path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', via: 'Microsoft Edge' },
    ]
  }
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter((r): r is string => !!r)
    return [
      ...roots.map((r) => ({ path: join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'), via: 'Google Chrome' })),
      ...roots.map((r) => ({ path: join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), via: 'Microsoft Edge' })),
    ]
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'].map(
    (path) => ({
      path,
      via: path.includes('edge') ? 'Microsoft Edge' : path.includes('chromium') ? 'Chromium' : 'Google Chrome',
    }),
  )
}

/** The Chromium executable inside a Playwright browsers folder (chromium-<rev>/…), newest first. */
export function downloadedChromium(browsersDir: string): string | undefined {
  if (!existsSync(browsersDir)) return undefined
  const revs = readdirSync(browsersDir)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  const names = new Set(['Chromium', 'Google Chrome for Testing', 'chrome', 'chrome.exe'])
  const find = (dir: string, depth: number): string | undefined => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isFile() && names.has(e.name)) return p
      if (e.isDirectory() && depth > 0) {
        const hit = find(p, depth - 1)
        if (hit) return hit
      }
    }
    return undefined
  }
  for (const rev of revs) {
    const hit = find(join(browsersDir, rev), 5)
    if (hit) return hit
  }
  return undefined
}

/** The user's Node: `node` on PATH (Harness fixes PATH from the login shell at startup). */
function defaultFindNode(): { version: string; path: string } | null {
  try {
    const out = execFileSync('node', ['-p', 'process.version + " " + process.execPath'], { encoding: 'utf8', timeout: 10_000, windowsHide: true }).trim()
    const at = out.indexOf(' ')
    return at > 0 ? { version: out.slice(0, at), path: out.slice(at + 1) } : null
  } catch {
    return null
  }
}

function defaultRunNpm(args: string[]) {
  return new Promise<{ code: number; out: string }>((resolve) => {
    // npm is npm.cmd on Windows, which Node only spawns through a shell.
    const win = process.platform === 'win32'
    const child = spawn(win ? 'npm.cmd' : 'npm', args, { shell: win, windowsHide: true })
    let out = ''
    child.stdout?.on('data', (d) => (out = (out + d).slice(-4000)))
    child.stderr?.on('data', (d) => (out = (out + d).slice(-4000)))
    const timer = setTimeout(() => child.kill(), 15 * 60_000)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, out: err.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, out })
    })
  })
}

function defaultInstall(command: string, baseEnv: Record<string, string>) {
  return (script: string, env: Record<string, string>) =>
    new Promise<{ code: number; out: string }>((resolve) => {
      const child = spawn(command, [script, 'install', 'chromium'], { env: { ...process.env, ...baseEnv, ...env }, windowsHide: true })
      let out = ''
      child.stdout?.on('data', (d) => (out = (out + d).slice(-4000)))
      child.stderr?.on('data', (d) => (out = (out + d).slice(-4000)))
      const timer = setTimeout(() => child.kill(), 15 * 60_000)
      child.on('error', (err) => {
        clearTimeout(timer)
        resolve({ code: -1, out: err.message })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code: code ?? -1, out })
      })
    })
}

/**
 * The dev tools sessions get: Playwright's browser tools (bundled), Context7's library docs (hosted),
 * partners' own MCP servers and REA's reverse engineering (installed on demand). Bundled servers run
 * with Electron as Node, so nothing is downloaded at the event; only the browser itself is, once,
 * when there's no Chrome or Edge. REA runs on the user's own Node: Electron's is older than it needs.
 */
export class DevToolsService {
  private installing = false
  private installError?: string
  private reaInstalling = false
  private reaError?: string
  private nodeSeen?: { at: number; node: { version: string; path: string } | null }
  private reaTools?: { mtime: number; names: string[] }

  constructor(private readonly deps: DevToolsDeps) {}

  private get node() {
    return this.deps.node ?? { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } }
  }

  private get browsersDir() {
    return join(this.deps.dataDir, 'ms-playwright')
  }

  private module(rel: string) {
    return this.deps.resolveModule?.(rel) ?? join(this.deps.appPath, 'node_modules', rel)
  }

  browser(): BrowserInfo {
    if (!this.deps.settings().browser) return { status: 'off' }
    if (this.installing) return { status: 'installing' }
    const sys = this.deps.findBrowser ? this.deps.findBrowser() : (systemBrowsers().find((b) => existsSync(b.path)) ?? null)
    if (sys) return { status: 'ready', via: sys.via, path: sys.path }
    const own = downloadedChromium(this.browsersDir)
    if (own) return { status: 'ready', via: `Chromium (downloaded by ${this.deps.appName ?? 'Harness'})`, path: own }
    return this.installError ? { status: 'failed', error: this.installError } : { status: 'missing' }
  }

  private get reaDir() {
    return join(this.deps.dataDir, 'rea')
  }

  private get reaPackage() {
    return join(this.reaDir, 'node_modules', 'rea-agents')
  }

  /** The user's Node, looked up at most once a minute (it runs a process). */
  private userNode(fresh = false) {
    if (fresh || !this.nodeSeen || Date.now() - this.nodeSeen.at > 60_000) {
      this.nodeSeen = { at: Date.now(), node: (this.deps.findNode ?? defaultFindNode)() }
    }
    return this.nodeSeen.node
  }

  /** The REA version installed in Harness's data folder, if any. */
  private reaInstalled(): string | undefined {
    try {
      if (!existsSync(join(this.reaPackage, 'scripts', 'rea.mjs'))) return undefined
      return JSON.parse(readFileSync(join(this.reaPackage, 'package.json'), 'utf8')).version
    } catch {
      return undefined
    }
  }

  /** REA registered in the user's Claude Code config (user scope, this folder's local scope, or .mcp.json). */
  private reaExternal(cwd?: string): boolean {
    const has = (o: unknown) => !!o && typeof o === 'object' && REA_SERVER in (o as Record<string, unknown>)
    const read = (path: string) => {
      try {
        return JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        return undefined
      }
    }
    const configDir = process.env.CLAUDE_CONFIG_DIR
    const cfg = read(this.deps.claudeConfigPath ?? (configDir ? join(configDir, '.claude.json') : join(homedir(), '.claude.json')))
    if (has(cfg?.mcpServers)) return true
    if (cwd && has(cfg?.projects?.[cwd]?.mcpServers)) return true
    return cwd ? has(read(join(cwd, '.mcp.json'))?.mcpServers) : false
  }

  rea(cwd?: string, fresh = false): ReaInfo {
    if (!this.deps.settings().rea) return { status: 'off' }
    if (this.reaExternal(cwd)) return { status: 'external' }
    if (this.reaInstalling) return { status: 'installing', version: REA_VERSION }
    const node = this.userNode(fresh)
    if (!node || !nodeRunsRea(node.version)) return { status: 'needs-node', ...(node ? { node: node.version } : {}) }
    if (this.reaInstalled() === REA_VERSION) return { status: 'ready', version: REA_VERSION, node: node.version }
    if (this.reaError) return { status: 'failed', error: this.reaError, node: node.version }
    return { status: 'not-installed', version: REA_VERSION, node: node.version }
  }

  /** Installs REA (pinned) into Harness's data folder with the user's npm. */
  async installRea(): Promise<DevToolsState> {
    if (this.reaInstalling) return this.state()
    this.reaInstalling = true
    this.reaError = undefined
    this.publish()
    const run = this.deps.runNpm ?? defaultRunNpm
    const { code, out } = await run(['install', '--prefix', this.reaDir, '--no-audit', '--no-fund', '--loglevel=error', `rea-agents@${REA_VERSION}`])
    this.reaInstalling = false
    if (code !== 0 || this.reaInstalled() !== REA_VERSION) {
      this.reaError = out.trim().split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300) || `exit ${code}`
    }
    this.userNode(true)
    return this.publish()
  }

  /** REA's tools that may run without a prompt, from the installed release's own catalog. */
  private reaQuietTools(): string[] {
    const file = join(this.reaPackage, 'dist', 'mcp-catalog.json')
    try {
      const mtime = statSync(file).mtimeMs
      if (this.reaTools?.mtime !== mtime) {
        const tools: ReaTool[] = JSON.parse(readFileSync(file, 'utf8')).tools ?? []
        this.reaTools = { mtime, names: tools.filter(reaRunsWithoutAsking).map((t) => t.name) }
      }
      return this.reaTools.names
    } catch {
      return []
    }
  }

  /** fresh: look for the user's Node again (Settings opening: they may have just installed it). */
  state(fresh = false): DevToolsState {
    const s = this.deps.settings()
    return {
      browser: this.browser(),
      docs: { status: s.docs ? 'ready' : 'off', keyed: Boolean(this.deps.context7Key()) },
      partners: s.partnerServers
        ? this.deps
            .partnerServers()
            .map((p) => ({
              id: p.id,
              name: p.name,
              status: 'missing' in p.server ? 'needs-key' : 'ready',
              hosting: 'missing' in p.server ? 'hosted' : p.server.hosting,
            }))
        : [],
      rea: this.rea(undefined, fresh),
      eventProject: this.deps.eventProject(),
    }
  }

  publish(): DevToolsState {
    const s = this.state()
    this.deps.push(s)
    return s
  }

  /** Downloads Playwright's Chromium (about 150 MB, once) for a computer with no Chrome or Edge. */
  async installBrowser(): Promise<DevToolsState> {
    if (this.installing) return this.state()
    this.installing = true
    this.installError = undefined
    this.publish()
    const run = this.deps.runInstall ?? defaultInstall(this.node.command, this.node.env)
    const { code, out } = await run(this.module(PLAYWRIGHT_CLI), { PLAYWRIGHT_BROWSERS_PATH: this.browsersDir })
    this.installing = false
    if (code !== 0 || !downloadedChromium(this.browsersDir)) {
      this.installError = out.trim().split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300) || `exit ${code}`
    }
    return this.publish()
  }

  /** MCP servers for a session in this folder. */
  mcpServers(cwd: string): Record<string, McpServerConfig> {
    const s = this.deps.settings()
    const out: Record<string, McpServerConfig> = {}
    const b = this.browser()
    if (b.status === 'ready' && b.path) {
      const project = createHash('sha256').update(cwd).digest('hex').slice(0, 12)
      out[BROWSER_SERVER] = {
        type: 'stdio',
        command: this.node.command,
        args: [
          this.module(PLAYWRIGHT_MCP),
          '--executable-path',
          b.path,
          // A fresh profile per session: no lock clashes between parallel sessions, no stale logins.
          '--isolated',
          ...(s.showBrowser ? [] : ['--headless']),
          // Unnamed screenshots go here; named ones resolve against the project folder.
          '--output-dir',
          join(this.deps.dataDir, 'browser-output', project),
        ],
        env: this.node.env,
      }
    }
    if (s.docs) {
      const key = this.deps.context7Key()
      out[DOCS_SERVER] = { type: 'http', url: 'https://mcp.context7.com/mcp', ...(key ? { headers: { Authorization: `Bearer ${key}` } } : {}) }
    }
    if (s.partnerServers) {
      for (const { id, server } of this.deps.partnerServers(cwd)) {
        if ('missing' in server || id === BROWSER_SERVER || id === DOCS_SERVER) continue
        out[id] =
          server.kind === 'http'
            ? { type: 'http', url: server.url, ...(Object.keys(server.headers).length ? { headers: server.headers } : {}) }
            : { type: 'stdio', command: this.node.command, args: [this.module(server.module), ...server.args], env: { ...this.node.env, ...server.env } }
      }
    }
    const node = this.rea(cwd).status === 'ready' ? this.userNode() : null
    if (node) {
      out[REA_SERVER] = {
        type: 'stdio',
        command: node.path,
        args: [join(this.reaPackage, 'scripts', 'rea.mjs'), 'mcp'],
        // REA still validates every result against its contract; the list just leaves the output schemas out.
        env: { REA_MCP_OUTPUT_SCHEMA_PROFILE: 'off' },
      }
    }
    return out
  }

  /**
   * Tools sessions may use without a permission prompt: docs lookups, the isolated browser and REA's
   * read-only analysis (partner servers, and REA running a target or touching a device, still ask).
   */
  allowedTools(cwd?: string): string[] {
    const s = this.deps.settings()
    const rea = cwd && this.rea(cwd).status === 'ready' ? this.reaQuietTools().map((t) => `mcp__${REA_SERVER}__${t}`) : []
    return [...(s.browser ? [`mcp__${BROWSER_SERVER}`] : []), ...(s.docs ? [`mcp__${DOCS_SERVER}`] : []), ...rea]
  }

  /** The system-prompt guide for a session in this folder (only the tools it actually gets). */
  guide(cwd: string): string | undefined {
    const servers = this.mcpServers(cwd)
    const partners = this.deps.partnerServers(cwd).filter((p) => !('missing' in p.server) && servers[p.id])
    const rea = Boolean(servers[REA_SERVER]) || this.rea(cwd).status === 'external'
    return devToolsGuide({ browser: Boolean(servers[BROWSER_SERVER]), docs: Boolean(servers[DOCS_SERVER]), partners, rea })
  }
}
