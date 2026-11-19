import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ECC, eccEnv, parseEccSettings } from '@shared/ecc'
import { builtinEcc, chooseEcc, eccInfo } from '../src/main/ecc/plugin'

const ROOT = join(import.meta.dirname, '..')
const ECC = join(ROOT, 'resources', 'ecc')

/** A Claude config folder where ecc@ecc is installed at `version`. */
function claudeDirWith(version?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'ecc-claude-'))
  if (version) {
    mkdirSync(join(dir, 'plugins'), { recursive: true })
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ enabledPlugins: { 'ecc@ecc': true } }))
    writeFileSync(join(dir, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: { 'ecc@ecc': [{ version, installPath: '/somewhere/ecc' }] } }))
  }
  return dir
}

describe('ECC built into Harness', () => {
  it('ships a complete plugin: manifest, hooks, the packages its hooks require, and where it came from', () => {
    expect(builtinEcc(ROOT)).toEqual({ path: ECC, version: expect.stringMatching(/^\d+\.\d+\.\d+$/) })
    for (const f of ['hooks/hooks.json', 'scripts/hooks/pre-bash-dispatcher.js', 'node_modules/js-yaml/package.json', 'node_modules/ajv/dist/ajv.js', 'node_modules/@iarna/toml/package.json', 'LICENSE'])
      expect(existsSync(join(ECC, f)), f).toBe(true)
    const source = JSON.parse(readFileSync(join(ECC, 'HARNESS_SOURCE.json'), 'utf8'))
    expect(source).toMatchObject({ repository: 'https://github.com/affaan-m/ECC', license: 'MIT', commit: expect.stringMatching(/^[0-9a-f]{40}$/) })
    // Docs and images stay out of the app.
    expect(existsSync(join(ECC, 'docs'))).toBe(false)
    expect(existsSync(join(ECC, 'assets'))).toBe(false)
  })

  it('counts what it brings, for Settings › Tools', () => {
    const info = eccInfo(chooseEcc(ROOT, claudeDirWith()))
    expect(info.plugin.source).toBe('builtin')
    expect(info.counts.agents).toBeGreaterThan(50)
    expect(info.counts.skills).toBeGreaterThan(250)
    expect(info.counts.commands).toBeGreaterThan(80)
    expect(info.counts.rules).toEqual(expect.arrayContaining(['common', 'typescript', 'python']))
    expect(info.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('uses an installed ecc@ecc only when it is newer, so it never loads twice', () => {
    const builtin = builtinEcc(ROOT)!.version
    expect(chooseEcc(ROOT, claudeDirWith('1.0.0'))).toMatchObject({ source: 'builtin', path: ECC })
    expect(chooseEcc(ROOT, claudeDirWith(builtin))).toMatchObject({ source: 'builtin' })
    expect(chooseEcc(ROOT, claudeDirWith('99.0.0'))).toEqual({ source: 'installed', version: '99.0.0', builtinVersion: builtin, installedVersion: '99.0.0' })
  })

  it('passes the hook profile to sessions, and nothing when ECC is off', () => {
    expect(eccEnv(DEFAULT_ECC)).toEqual({ ECC_HOOK_PROFILE: 'standard' })
    expect(eccEnv({ enabled: true, hookProfile: 'strict' })).toEqual({ ECC_HOOK_PROFILE: 'strict' })
    expect(eccEnv({ enabled: false, hookProfile: 'strict' })).toEqual({})
    expect(parseEccSettings({ hookProfile: 'paranoid', enabled: 'yes' })).toEqual(DEFAULT_ECC)
    expect(parseEccSettings({ enabled: false, hookProfile: 'minimal' })).toEqual({ enabled: false, hookProfile: 'minimal' })
  })
})
