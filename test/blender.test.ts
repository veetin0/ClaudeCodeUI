import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BLENDER_READ_TOOLS, DEFAULT_DEV_TOOLS, devToolsGuide, type DevToolsSettings } from '@shared/devtools'
import { BLENDER_MCP_ENV, BLENDER_MCP_VERSION, BlenderService, blenderMcpArgs } from '../src/main/devtools/blender'
import { DevToolsService } from '../src/main/devtools/DevToolsService'
import type { Runner } from '../src/main/kit3d/Kit3dService'

const tmp = () => mkdtempSync(join(tmpdir(), 'harness-blender-'))

/** A Blender config folder: <base>/<version>/ with or without saved preferences, plus other versions. */
function blenderHome(opts: { prefs?: boolean; others?: string[] } = {}) {
  const base = tmp()
  const user = join(base, '4.2')
  mkdirSync(join(user, 'config'), { recursive: true })
  if (opts.prefs !== false) writeFileSync(join(user, 'config', 'userpref.blend'), '')
  for (const o of opts.others ?? []) mkdirSync(join(base, o))
  return { base, user, addons: join(user, 'scripts', 'addons') }
}

function blender(opts: { blender?: boolean; uvx?: boolean; live?: boolean; home?: ReturnType<typeof blenderHome>; enable?: object | null; installCode?: number } = {}) {
  const dataDir = tmp()
  const home = opts.home ?? blenderHome()
  const calls: { cmd: string; args: string[]; env?: Record<string, string> }[] = []
  const launched: { cmd: string; args: string[] }[] = []
  const run: Runner = async (cmd, args, o, onLine) => {
    calls.push({ cmd, args, env: o.env })
    onLine('Installed MCP for Blender addon')
    return opts.installCode ?? 0
  }
  const svc = new BlenderService({
    dataDir,
    platform: 'linux',
    home: '/home/v',
    exists: (p) => (p === '/usr/bin/blender' ? opts.blender !== false : p === '/home/v/.local/bin/uvx' ? opts.uvx !== false : existsSync(p)),
    probe: (cmd, args) => {
      calls.push({ cmd, args })
      if (cmd === 'which') return args[0] === 'blender' && opts.blender !== false ? '/usr/bin/blender\n' : undefined
      if (cmd === '/usr/bin/blender' && args[0] === '--version') return 'Blender 4.2.3 LTS\n\tbuild date: 2026-09-01\n'
      if (cmd === '/usr/bin/blender' && args.includes('--python-expr') && args[2].includes('HARNESS_PATHS')) return `Blender 4.2.3\nHARNESS_PATHS ${JSON.stringify({ addons: home.addons, user: home.user + '/' })}\n`
      if (cmd === '/usr/bin/blender' && args.includes('--python-expr') && args[2].includes('HARNESS_RESULT'))
        return opts.enable === null ? 'Blender quit\n' : `HARNESS_RESULT ${JSON.stringify(opts.enable ?? { already: false, enabled: true, error: null })}\n`
      return undefined
    },
    run,
    listening: async () => !!opts.live,
    launch: (cmd, args) => launched.push({ cmd, args }),
  })
  return { svc, calls, launched, dataDir, home }
}

describe('Blender', () => {
  it('finds Blender where it is normally installed, and uv', () => {
    const { svc } = blender()
    expect(svc.detect()).toMatchObject({ blender: { path: '/usr/bin/blender', version: '4.2.3' }, uvx: '/home/v/.local/bin/uvx' })
    expect(blender({ blender: false, uvx: false }).svc.detect()).toMatchObject({ blender: null, uvx: null })
    const win = new BlenderService({ dataDir: tmp(), platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)' } })
    expect(win.candidates()).toContain(join('C:\\Program Files (x86)', 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe'))
  })

  it('installs the pinned add-on into this Blender, enables it, and remembers', async () => {
    const { svc, calls, home } = blender()
    expect(svc.addonVersion()).toBeUndefined()
    expect(await svc.setupAddon()).toMatch(/installed and enabled/)
    const install = calls.find((c) => c.cmd === '/home/v/.local/bin/uvx')!
    expect(install.args).toEqual([...blenderMcpArgs, 'install-addon', '--addons-dir', home.addons])
    expect(install.args).toContain(`mcp-for-blender@${BLENDER_MCP_VERSION}`)
    expect(install.env).toMatchObject({ DISABLE_TELEMETRY: 'true', UV_PYTHON_PREFERENCE: 'only-managed' })
    const enable = calls.find((c) => c.args[2]?.includes('HARNESS_RESULT'))!
    expect(enable.args.slice(-2)).toEqual(['--', 'blender_mcp'])
    expect(svc.addonVersion()).toBe(BLENDER_MCP_VERSION)
    expect(await blender({ enable: { already: true, enabled: false, error: null } }).svc.setupAddon()).toMatch(/already enabled/)
  })

  it('stops with the reason: no Blender, no uv, Blender open, a version never opened, enabling failed', async () => {
    await expect(blender({ blender: false }).svc.setupAddon()).rejects.toThrow(/blender\.org/)
    await expect(blender({ uvx: false }).svc.setupAddon()).rejects.toThrow(/uv wasn’t found/)
    await expect(blender({ live: true }).svc.setupAddon()).rejects.toThrow(/Blender is open\. Quit it first/)
    // A new version that still offers to import the old one's settings: don't save preferences over that.
    await expect(blender({ home: blenderHome({ prefs: false, others: ['4.1'] }) }).svc.setupAddon()).rejects.toThrow(/hasn’t been opened yet/)
    // A first-ever install (no other versions) is fine without saved preferences.
    expect(await blender({ home: blenderHome({ prefs: false }) }).svc.setupAddon()).toMatch(/installed and enabled/)
    await expect(blender({ installCode: 1 }).svc.setupAddon()).rejects.toThrow(/Installing the add-on failed/)
    const failed = blender({ enable: { already: false, enabled: false, error: "Blender couldn't load the add-on" } })
    await expect(failed.svc.setupAddon()).rejects.toThrow(/couldn't load the add-on.*Preferences → Add-ons/)
    expect(failed.svc.addonVersion()).toBeUndefined()
    await expect(blender({ enable: null }).svc.setupAddon()).rejects.toThrow(/exited without enabling/)
    await expect(blender({ enable: { already: false, enabled: false, error: "Blender couldn't load the add-on (ModuleNotFoundError: No module named 'requests')" } }).svc.setupAddon()).rejects.toThrow(/No module named 'requests'.*official build from blender\.org/)
  })

  it('opens Blender, importing a model when given one', () => {
    const { svc, launched } = blender()
    svc.open()
    svc.open('/p/assets/sensor.glb')
    expect(launched[0]).toEqual({ cmd: '/usr/bin/blender', args: [] })
    expect(launched[1].args[0]).toBe('--python-expr')
    expect(launched[1].args[1]).toMatch(/import_scene\.gltf/)
    expect(launched[1].args.slice(-2)).toEqual(['--', '/p/assets/sensor.glb'])
  })
})

describe('Blender in sessions', () => {
  function devtools(b: ReturnType<typeof blender>, settings: Partial<DevToolsSettings> = {}, claudeConfig?: object) {
    const configPath = join(tmp(), '.claude.json')
    if (claudeConfig) writeFileSync(configPath, JSON.stringify(claudeConfig))
    return new DevToolsService({
      appPath: '/app',
      dataDir: b.dataDir,
      settings: () => ({ ...DEFAULT_DEV_TOOLS, browser: false, docs: false, partnerServers: false, blender: true, ...settings }),
      context7Key: () => undefined,
      partnerServers: () => [],
      eventProject: () => undefined,
      push: () => {},
      claudeConfigPath: configPath,
      blender: b.svc,
    })
  }

  it('is off by default and only looks for Blender when asked', () => {
    expect(DEFAULT_DEV_TOOLS.blender).toBe(false)
    const b = blender()
    const d = devtools(b, { blender: false })
    expect(d.state().blender).toEqual({ status: 'off' })
    expect(b.calls).toEqual([]) // no `blender --version` on every session start
    expect(d.state(true).blender).toMatchObject({ status: 'off', blender: { version: '4.2.3' } })
    expect(d.mcpServers('/x').blender).toBeUndefined()
  })

  it('walks through what is missing, then gives sessions the server with only the read-only tools quiet', async () => {
    expect(devtools(blender({ blender: false })).state().blender.status).toBe('needs-blender')
    expect(devtools(blender({ uvx: false })).state().blender.status).toBe('needs-uv')
    const b = blender()
    const d = devtools(b)
    expect(d.state().blender.status).toBe('needs-addon')
    const s = await d.setupBlender()
    expect(s.blender).toMatchObject({ status: 'ready', live: false })
    expect(d.mcpServers('/x').blender).toEqual({ type: 'stdio', command: '/home/v/.local/bin/uvx', args: blenderMcpArgs, env: BLENDER_MCP_ENV })
    expect(d.allowedTools('/x')).toEqual(BLENDER_READ_TOOLS.map((t) => `mcp__blender__${t}`))
    expect(d.allowedTools('/x')).not.toContain('mcp__blender__execute_blender_code')
    expect(d.guide('/x')).toMatch(/Blender \(mcp__blender__\*, MCP for Blender\): build and adjust 3D objects/)
    expect(d.guide('/x')).toMatch(/export it as \.glb into assets\//)
  })

  it('keeps a failed setup visible', async () => {
    const d = devtools(blender({ live: true }))
    expect((await d.setupBlender()).blender).toMatchObject({ status: 'failed', error: expect.stringContaining('Blender is open') })
  })

  it('uses MCP for Blender already in the user’s Claude Code config instead of adding a second one', () => {
    const d = devtools(blender(), {}, { mcpServers: { blender: { command: 'uvx', args: ['mcp-for-blender'] } } })
    expect(d.state().blender.status).toBe('external')
    expect(d.mcpServers('/x').blender).toBeUndefined()
    expect(d.guide('/x')).toMatch(/mcp__blender__\*/)
    expect(devToolsGuide({ browser: false, docs: false, partners: [] })).toBeUndefined()
  })
})
