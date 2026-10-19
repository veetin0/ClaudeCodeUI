import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { BROWSER_SERVER, DOCS_SERVER, devToolsGuide, type BrowserInfo, type DevToolsSettings, type DevToolsState } from '@shared/devtools'
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
 * The dev tools sessions get: Playwright's browser tools (bundled), Context7's library docs (hosted)
 * and partners' own MCP servers. Bundled servers run with Electron as Node, so nothing is downloaded
 * at the event; only the browser itself is, once, when there's no Chrome or Edge.
 */
export class DevToolsService {
  private installing = false
  private installError?: string

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

  state(): DevToolsState {
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
    return out
  }

  /** Tools sessions may use without a permission prompt: docs lookups and the isolated browser (partner servers still ask). */
  allowedTools(): string[] {
    const s = this.deps.settings()
    return [...(s.browser ? [`mcp__${BROWSER_SERVER}`] : []), ...(s.docs ? [`mcp__${DOCS_SERVER}`] : [])]
  }

  /** The system-prompt guide for a session in this folder (only the tools it actually gets). */
  guide(cwd: string): string | undefined {
    const servers = this.mcpServers(cwd)
    const partners = this.deps.partnerServers(cwd).filter((p) => !('missing' in p.server) && servers[p.id])
    return devToolsGuide({ browser: Boolean(servers[BROWSER_SERVER]), docs: Boolean(servers[DOCS_SERVER]), partners })
  }
}
