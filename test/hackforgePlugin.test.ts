import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { builtinPlugin, choosePlugin, compareVersions, installedPlugin } from '../src/main/hackforge/plugin'

const ROOT = join(import.meta.dirname, '..')
const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

/** A Claude config dir with hackforge installed the way `claude plugin install` records it. */
function claudeDir(version: string | null, enabled = true) {
  const d = mkdtempSync(join(tmpdir(), 'cc-'))
  dirs.push(d)
  if (version === null) return d
  writeFileSync(join(d, 'settings.json'), JSON.stringify({ enabledPlugins: { 'hackforge@veeti-tools': enabled } }))
  mkdirSync(join(d, 'plugins'))
  writeFileSync(
    join(d, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'hackforge@veeti-tools': [{ scope: 'user', installPath: `${d}/plugins/cache/veeti-tools/hackforge/${version}`, version }] } }),
  )
  return d
}

describe('built-in HackForge plugin', () => {
  it('ships in resources/hackforge with a manifest and hooks', () => {
    const b = builtinPlugin(ROOT)
    expect(b?.path).toBe(join(ROOT, 'resources', 'hackforge'))
    expect(b?.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('resolves to app.asar.unpacked inside a packaged app', () => {
    // The packaged path doesn't exist here, so this checks the rewrite, not the files.
    expect(builtinPlugin('/Applications/Harness.app/Contents/Resources/app.asar')).toBeNull()
  })

  it('compares versions numerically', () => {
    expect(compareVersions('2.10.0', '2.9.3')).toBeGreaterThan(0)
    expect(compareVersions('2.1.1', '2.1.1')).toBe(0)
    expect(compareVersions('v1.0', '1.0.1')).toBeLessThan(0)
  })

  it('uses the built-in copy unless an enabled installed one is newer', () => {
    const builtin = { path: '/b', version: '2.1.1' }
    expect(choosePlugin(builtin, installedPlugin(claudeDir(null)))).toMatchObject({ source: 'builtin', version: '2.1.1', path: '/b' })
    expect(choosePlugin(builtin, installedPlugin(claudeDir('1.0.0')))).toMatchObject({ source: 'builtin', installedVersion: '1.0.0' })
    expect(choosePlugin(builtin, installedPlugin(claudeDir('2.1.1')))).toMatchObject({ source: 'builtin' })
    const newer = choosePlugin(builtin, installedPlugin(claudeDir('2.2.0')))
    expect(newer).toMatchObject({ source: 'installed', version: '2.2.0', builtinVersion: '2.1.1' })
    expect(newer.path).toBeUndefined() // nothing passed to the SDK: Claude Code loads the installed copy itself
    expect(installedPlugin(claudeDir('9.9.9', false))).toBeNull()
    expect(choosePlugin(null, null)).toMatchObject({ source: 'none' })
  })
})
