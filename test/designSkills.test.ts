import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DESIGN_SKILLS, designGuide, type DesignSkillsSettings, type DesignState } from '@shared/design'
import { DesignService } from '../src/main/design/DesignService'

const repo = resolve(__dirname, '..')

function claudeDir(installed: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'design-claude-'))
  mkdirSync(join(dir, 'plugins'), { recursive: true })
  const keys = Object.keys(installed).map((name) => `${name}@market`)
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ enabledPlugins: Object.fromEntries(keys.map((k) => [k, true])) }))
  writeFileSync(
    join(dir, 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      plugins: Object.fromEntries(Object.entries(installed).map(([name, version]) => [`${name}@market`, [{ version, installPath: `/plugins/${name}` }]])),
    }),
  )
  return dir
}

function service(
  opts: {
    settings?: Partial<DesignSkillsSettings>
    installed?: Record<string, string>
    appPath?: string
    run?: (launcher: string, arg: string) => Promise<{ code: number; out: string }>
  } = {},
) {
  const pushed: DesignState[] = []
  const calls: string[][] = []
  const svc = new DesignService({
    appPath: opts.appPath ?? repo,
    claudeDir: claudeDir(opts.installed),
    settings: () => ({ ...DEFAULT_DESIGN_SKILLS, ...opts.settings }),
    push: (s) => pushed.push(s),
    runLauncher: async (launcher, arg) => {
      calls.push([launcher, arg])
      return opts.run ? opts.run(launcher, arg) : { code: 0, out: 'impeccable-engine 0.1.15\n' }
    },
  })
  return { svc, pushed, calls }
}

describe('design skills: which copies sessions get', () => {
  it('loads both bundled plugins by default', () => {
    const { svc } = service()
    expect(svc.plugins()).toMatchObject([
      { key: 'impeccable', source: 'builtin', version: '4.6.0', path: join(repo, 'resources', 'design', 'impeccable') },
      { key: 'uiUxProMax', source: 'builtin', version: '2.15.0', path: join(repo, 'resources', 'design', 'ui-ux-pro-max') },
    ])
    expect(svc.sdkPlugins()).toEqual([
      { type: 'local', path: join(repo, 'resources', 'design', 'impeccable') },
      { type: 'local', path: join(repo, 'resources', 'design', 'ui-ux-pro-max') },
    ])
  })

  it('leaves out a plugin that is switched off', () => {
    const { svc } = service({ settings: { uiUxProMax: false } })
    expect(svc.plugins().map((p) => p.source)).toEqual(['builtin', 'off'])
    expect(svc.sdkPlugins()).toHaveLength(1)
  })

  it('uses your own install when it is newer, and Harness’s copy when yours is older', () => {
    const { svc } = service({ installed: { impeccable: '9.0.0', 'ui-ux-pro-max': '1.0.0' } })
    expect(svc.plugins()).toMatchObject([
      { key: 'impeccable', source: 'installed', version: '9.0.0' },
      { key: 'uiUxProMax', source: 'builtin', version: '2.15.0' },
    ])
    expect(svc.sdkPlugins()).toEqual([{ type: 'local', path: join(repo, 'resources', 'design', 'ui-ux-pro-max') }])
  })

  it('reports a missing copy instead of loading nothing silently', () => {
    const { svc } = service({ appPath: mkdtempSync(join(tmpdir(), 'design-app-')) })
    expect(svc.plugins().map((p) => p.source)).toEqual(['missing', 'missing'])
    expect(svc.sdkPlugins()).toEqual([])
  })

  it('tells sessions where impeccable’s launcher is, and turns on quiet mode only with impeccable on', () => {
    const launcher = join(repo, 'resources', 'design', 'impeccable', 'skills', 'impeccable', 'scripts', 'impeccable')
    expect(service().svc.env()).toEqual({ HARNESS_IMPECCABLE: launcher, IMPECCABLE_HOOK_QUIET: '1' })
    expect(service({ settings: { quietDetector: false } }).svc.env()).toEqual({ HARNESS_IMPECCABLE: launcher })
    expect(service({ settings: { impeccable: false } }).svc.env()).toEqual({})
    // Your own install: its launcher, from Claude Code's install record.
    expect(service({ installed: { impeccable: '9.0.0' } }).svc.env().HARNESS_IMPECCABLE).toBe(
      join('/plugins/impeccable', 'skills', 'impeccable', 'scripts', 'impeccable'),
    )
  })

  it('ships the launcher as an executable, plus both licences', () => {
    const launcher = join(repo, 'resources', 'design', 'impeccable', 'skills', 'impeccable', 'scripts', 'impeccable')
    if (process.platform !== 'win32') expect(statSync(launcher).mode & 0o111).not.toBe(0)
    expect(statSync(`${launcher}.cmd`).isFile()).toBe(true)
    expect(statSync(join(repo, 'resources', 'design', 'impeccable', 'LICENSE')).isFile()).toBe(true)
    expect(statSync(join(repo, 'resources', 'design', 'ui-ux-pro-max', 'LICENSE')).isFile()).toBe(true)
    expect(statSync(join(repo, 'resources', 'design', 'ui-ux-pro-max', '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md')).isFile()).toBe(true)
  })
})

describe('design skills: impeccable’s engine', () => {
  it('fetches it through the launcher and reports the version', async () => {
    const { svc, pushed, calls } = service()
    const s = await svc.prepare()
    expect(calls).toEqual([[join(repo, 'resources', 'design', 'impeccable', 'skills', 'impeccable', 'scripts', 'impeccable'), 'engine-probe']])
    expect(s.engine).toEqual({ status: 'ready', version: '0.1.15' })
    expect(pushed.map((p) => p.engine.status)).toEqual(['checking', 'ready'])
  })

  it('shows the last lines of a failed download', async () => {
    const { svc } = service({
      run: async () => ({ code: 127, out: 'downloading…\nimpeccable: could not download the engine\nhttps://github.com/… timed out\n' }),
    })
    expect((await svc.prepare()).engine).toEqual({ status: 'failed', error: 'impeccable: could not download the engine https://github.com/… timed out' })
    const { svc: empty } = service({ run: async () => ({ code: 1, out: '' }) })
    expect((await empty.prepare()).engine).toEqual({ status: 'failed', error: 'exit 1' })
  })

  it('does nothing when impeccable is off or comes from your own install', async () => {
    const off = service({ settings: { impeccable: false } })
    expect((await off.svc.prepare()).engine).toEqual({ status: 'off' })
    expect(off.calls).toEqual([])
    const mine = service({ installed: { impeccable: '9.0.0' } })
    expect((await mine.svc.prepare()).engine.status).toBe('unknown')
    expect(mine.calls).toEqual([])
  })
})

describe('design skills: the guide in the system prompt', () => {
  it('splits the work when both are on', () => {
    const g = designGuide({ impeccable: true, uiUxProMax: true })!
    expect(g).toMatch(/load the matching design skill with the Skill tool before you start editing/)
    expect(g).toMatch(/ui-ux-pro-max: once, at the start .* Record the choice in DESIGN\.md .*Don’t re-pick it/)
    expect(g).toMatch(/DESIGN\.md and impeccable’s anti-pattern rules win/)
    expect(g).toMatch(/"Change this element in the running app"/)
  })

  it('fits each one alone, and adds nothing with both off', () => {
    const uipro = designGuide({ impeccable: false, uiUxProMax: true })!
    expect(uipro).toMatch(/UX and accessibility checks/)
    expect(uipro).not.toMatch(/impeccable/)
    const imp = designGuide({ impeccable: true, uiUxProMax: false })!
    expect(imp).toMatch(/impeccable: for building, polishing/)
    expect(imp).not.toMatch(/ui-ux-pro-max/)
    expect(designGuide({ impeccable: false, uiUxProMax: false })).toBeUndefined()
  })
})
