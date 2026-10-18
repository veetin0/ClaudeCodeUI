import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DEV_TOOLS, devToolsGuide, type DevToolsSettings, type DevToolsState } from '@shared/devtools'
import { kitNote, PARTNER_KITS, resolvePartnerMcp, type PartnerKit } from '@shared/partners'
import { DevToolsService, downloadedChromium, systemBrowsers } from '../src/main/devtools/DevToolsService'
import { PartnerService } from '../src/main/event/PartnerService'

const tmp = () => mkdtempSync(join(tmpdir(), 'harness-devtools-'))
const kit = (id: string) => PARTNER_KITS.find((k) => k.id === id)!

describe('partner MCP servers', () => {
  it('fills keys into a hosted server, and Exa works without a key too', () => {
    expect(resolvePartnerMcp(kit('exa'), { EXA_API_KEY: 'exa-1' })).toEqual({
      kind: 'http',
      url: 'https://mcp.exa.ai/mcp',
      headers: { 'x-api-key': 'exa-1' },
      hosting: 'hosted',
    })
    expect(resolvePartnerMcp(kit('exa'), {})).toEqual({ kind: 'http', url: 'https://mcp.exa.ai/mcp', headers: {}, hosting: 'hosted' })
  })

  it('runs a bundled server only once every key it needs is set', () => {
    expect(resolvePartnerMcp(kit('cloudinary'), { CLOUDINARY_CLOUD_NAME: 'demo' })).toEqual({ missing: ['CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] })
    expect(resolvePartnerMcp(kit('cloudinary'), { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '1', CLOUDINARY_API_SECRET: 's' })).toEqual({
      kind: 'bundled',
      module: '@cloudinary/asset-management-mcp/bin/mcp-server.js',
      args: ['start'],
      env: { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '1', CLOUDINARY_API_SECRET: 's' },
      hosting: 'bundled',
    })
    expect(resolvePartnerMcp(kit('hostinger'), { HOSTINGER_API_TOKEN: 't' })).toMatchObject({ kind: 'bundled', env: { HOSTINGER_API_TOKEN: 't' } })
  })

  it('uses a URL the team pasted at the event, with the kit’s secret key as a Bearer token', () => {
    expect(resolvePartnerMcp(kit('cala'), {}, 'https://mcp.cala.example/mcp')).toEqual({
      kind: 'http',
      url: 'https://mcp.cala.example/mcp',
      headers: {},
      hosting: 'event-url',
    })
    expect(resolvePartnerMcp(kit('cala'), { CALA_API_KEY: 'c-1' }, 'https://mcp.cala.example/mcp')).toMatchObject({ headers: { Authorization: 'Bearer c-1' } })
    // No server and no URL: nothing to add.
    expect(resolvePartnerMcp(kit('openai'), { OPENAI_API_KEY: 'sk' })).toBeNull()
  })

  it('tells Claude about the server in the kit note', () => {
    expect(kitNote(kit('exa'), ['EXA_API_KEY'])).toMatch(
      /## MCP server\n- Harness sessions in this project get the `mcp__exa__\*` tools \(hosted by the partner\)/,
    )
    expect(kitNote(kit('cala'), [], undefined, 'https://x.example/mcp')).toMatch(/`mcp__cala__\*` tools \(the MCP URL your team added\)/)
    expect(kitNote(kit('openai'), [])).not.toMatch(/MCP server/)
  })

  it('gives servers only to sessions in the event project, and keeps event URLs', () => {
    const project = tmp()
    const svc = new PartnerService({
      file: join(tmp(), 'keys.json'),
      encrypt: (v) => v,
      decrypt: (e) => e,
      projectDir: () => project,
      extraDirs: () => [],
      push: () => {},
    })
    svc.setKey('HOSTINGER_API_TOKEN', 'tok')
    svc.setMcp('cala', 'https://mcp.cala.example/mcp')
    expect(() => svc.setMcp('cala', 'http://insecure.example')).toThrow(/https/)
    expect(svc.state().mcp).toEqual({ cala: 'https://mcp.cala.example/mcp' })
    const inProject = svc.mcpServers(join(project, 'web'))
    expect(inProject.map((s) => s.id).sort()).toEqual(['cala', 'exa', 'hostinger'])
    expect(svc.mcpServers(tmp())).toEqual([])
    // Settings sees every kit with a server, including those still missing keys.
    expect(
      svc
        .mcpServers()
        .filter((s) => 'missing' in s.server)
        .map((s) => s.id),
    ).toEqual(['cloudinary'])
  })
})

describe('dev tools in sessions', () => {
  function service(opts: { settings?: Partial<DevToolsSettings>; browser?: { path: string; via: string } | null; key?: string; dataDir?: string } = {}) {
    const pushed: DevToolsState[] = []
    const installs: { script: string; env: Record<string, string> }[] = []
    const dataDir = opts.dataDir ?? tmp()
    const svc = new DevToolsService({
      appPath: '/app',
      dataDir,
      settings: () => ({ ...DEFAULT_DEV_TOOLS, ...opts.settings }),
      context7Key: () => opts.key,
      partnerServers: (cwd) =>
        cwd === undefined || cwd.startsWith('/event')
          ? [
              { id: 'exa', name: 'Exa', server: { kind: 'http', url: 'https://mcp.exa.ai/mcp', headers: { 'x-api-key': 'k' }, hosting: 'hosted' } },
              {
                id: 'hostinger',
                name: 'Hostinger',
                server: { kind: 'bundled', module: 'hostinger-api-mcp/src/servers/all.js', args: [], env: { HOSTINGER_API_TOKEN: 't' }, hosting: 'bundled' },
              },
              ...(cwd === undefined ? [{ id: 'cloudinary', name: 'Cloudinary', server: { missing: ['CLOUDINARY_API_KEY'] } }] : []),
            ]
          : [],
      eventProject: () => '/event',
      push: (s) => pushed.push(s),
      node: { command: '/Harness', env: { ELECTRON_RUN_AS_NODE: '1' } },
      findBrowser: () => (opts.browser === undefined ? { path: '/Chrome', via: 'Google Chrome' } : opts.browser),
      runInstall: async (script, env) => {
        installs.push({ script, env })
        const dir = join(env.PLAYWRIGHT_BROWSERS_PATH, 'chromium-1247', 'chrome-linux64')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'chrome'), '')
        return { code: 0, out: 'done' }
      },
    })
    return { svc, pushed, installs, dataDir }
  }

  it('gives a session the bundled browser, Context7 and the partners’ servers', () => {
    const { svc, dataDir } = service({ key: 'c7' })
    const servers = svc.mcpServers('/event/app')
    expect(servers.browser).toEqual({
      type: 'stdio',
      command: '/Harness',
      args: [
        join('/app', 'node_modules', '@playwright', 'mcp', 'cli.js'),
        '--executable-path',
        '/Chrome',
        '--isolated',
        '--headless',
        '--output-dir',
        expect.stringContaining(join(dataDir, 'browser-output')),
      ],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    })
    expect(servers.context7).toEqual({ type: 'http', url: 'https://mcp.context7.com/mcp', headers: { Authorization: 'Bearer c7' } })
    expect(servers.exa).toEqual({ type: 'http', url: 'https://mcp.exa.ai/mcp', headers: { 'x-api-key': 'k' } })
    expect(servers.hostinger).toEqual({
      type: 'stdio',
      command: '/Harness',
      args: [join('/app', 'node_modules', 'hostinger-api-mcp/src/servers/all.js')],
      env: { ELECTRON_RUN_AS_NODE: '1', HOSTINGER_API_TOKEN: 't' },
    })
    // Browser and docs run without prompts; partner servers still ask.
    expect(svc.allowedTools()).toEqual(['mcp__browser', 'mcp__context7'])
  })

  it('leaves out what is switched off, and partner servers outside the event project', () => {
    expect(Object.keys(service().svc.mcpServers('/elsewhere'))).toEqual(['browser', 'context7'])
    expect(service().svc.mcpServers('/elsewhere').context7).toEqual({ type: 'http', url: 'https://mcp.context7.com/mcp' })
    expect(service({ settings: { showBrowser: true } }).svc.mcpServers('/x').browser).not.toMatchObject({ args: expect.arrayContaining(['--headless']) })
    const off = service({ settings: { browser: false, docs: false, partnerServers: false } }).svc
    expect(off.mcpServers('/event/app')).toEqual({})
    expect(off.allowedTools()).toEqual([])
    expect(off.guide('/event/app')).toBeUndefined()
  })

  it('downloads Chromium when there is no Chrome or Edge, then uses it', async () => {
    const { svc, pushed, installs, dataDir } = service({ browser: null })
    expect(svc.state().browser).toEqual({ status: 'missing' })
    expect(svc.mcpServers('/x').browser).toBeUndefined()
    const s = await svc.installBrowser()
    expect(installs[0].script).toBe(join('/app', 'node_modules', '@playwright', 'mcp', 'node_modules', 'playwright-core', 'cli.js'))
    expect(installs[0].env.PLAYWRIGHT_BROWSERS_PATH).toBe(join(dataDir, 'ms-playwright'))
    expect(pushed.map((p) => p.browser.status)).toEqual(['installing', 'ready'])
    expect(s.browser).toMatchObject({ status: 'ready', via: 'Chromium (downloaded by Harness)' })
    expect(svc.mcpServers('/x').browser).toMatchObject({
      args: expect.arrayContaining([join(dataDir, 'ms-playwright', 'chromium-1247', 'chrome-linux64', 'chrome')]),
    })
  })

  it('lists partner servers and their readiness for Settings', () => {
    expect(service().svc.state().partners).toEqual([
      { id: 'exa', name: 'Exa', status: 'ready', hosting: 'hosted' },
      { id: 'hostinger', name: 'Hostinger', status: 'ready', hosting: 'bundled' },
      { id: 'cloudinary', name: 'Cloudinary', status: 'needs-key', hosting: 'hosted' },
    ])
  })

  it('tells Claude when to use each tool, only for the tools it has', () => {
    const g = service().svc.guide('/event/app')!
    expect(g).toMatch(/Browser \(mcp__browser__\*\): check UI work in a real browser/)
    expect(g).toMatch(/explicit filename under \.hackforge\/evidence\//)
    expect(g).toMatch(/Library docs \(mcp__context7__\*\): before writing code against a library or SDK/)
    expect(g).toMatch(/mcp__exa__\* for Exa, mcp__hostinger__\* for Hostinger/)
    expect(g).toMatch(/ask before anything that changes the partner account/)
    expect(service().svc.guide('/elsewhere')).not.toMatch(/Partner servers/)
    expect(devToolsGuide({ browser: false, docs: false, partners: [] })).toBeUndefined()
  })

  it('finds Chrome or Edge where they are normally installed', () => {
    expect(systemBrowsers('darwin', { HOME: '/Users/v' }).map((b) => b.path)).toContain('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    const win = systemBrowsers('win32', { PROGRAMFILES: 'C:\\Program Files', LOCALAPPDATA: 'C:\\Users\\v\\AppData\\Local' })
    expect(win.some((b) => b.path.endsWith('chrome.exe') && b.via === 'Google Chrome')).toBe(true)
    expect(win.some((b) => b.path.endsWith('msedge.exe') && b.via === 'Microsoft Edge')).toBe(true)
    const dir = tmp()
    expect(downloadedChromium(join(dir, 'none'))).toBeUndefined()
    mkdirSync(join(dir, 'chromium_headless_shell-1247', 'chrome-linux'), { recursive: true })
    writeFileSync(join(dir, 'chromium_headless_shell-1247', 'chrome-linux', 'chrome'), '')
    expect(downloadedChromium(dir)).toBeUndefined()
    mkdirSync(join(dir, 'chromium-1200', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(join(dir, 'chromium-1200', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'), '')
    expect(downloadedChromium(dir)).toBe(join(dir, 'chromium-1200', 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
  })
})

// Keeps the kit list honest: every built-in server spec points at a package Harness bundles.
it('bundles every partner server Harness runs', () => {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const bundled = PARTNER_KITS.flatMap((k: PartnerKit) => (k.mcp?.kind === 'bundled' ? [k.mcp.module] : []))
  expect(bundled.length).toBeGreaterThan(0)
  for (const m of bundled) {
    const name = m.startsWith('@') ? m.split('/').slice(0, 2).join('/') : m.split('/')[0]
    expect(pkg.dependencies[name], m).toBeDefined()
    expect(existsSync(join(__dirname, '..', 'node_modules', m)), m).toBe(true)
  }
  expect(pkg.dependencies['@playwright/mcp']).toBeDefined()
})
