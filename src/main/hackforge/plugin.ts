import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HackforgePluginInfo } from '@shared/hackforge'

/**
 * HackForge ships inside Harness (resources/hackforge, refreshed with `npm run hackforge:sync`) and
 * is loaded into sessions through the Agent SDK's `plugins` option, so nobody has to install it.
 * An installed copy (`claude plugin install hackforge@…`) is used instead only when it is newer:
 * the SDK replaces an installed plugin with an inline one of the same name, so it never loads twice.
 */

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/** "2.10.0" > "2.9.3"; missing parts count as 0; pre-release tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/** The built-in copy, from inside app.asar.unpacked when packaged (hooks run its scripts from disk). */
export function builtinPlugin(appPath: string): { path: string; version: string } | null {
  const path = join(appPath, 'resources', 'hackforge').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
  const manifest = readJson(join(path, '.claude-plugin', 'plugin.json')) as { name?: string; version?: string } | undefined
  return manifest?.name === 'hackforge' && existsSync(join(path, 'hooks', 'hooks.json')) ? { path, version: manifest.version ?? '0.0.0' } : null
}

/** An installed, enabled hackforge@<marketplace> from Claude Code's own records. */
export function installedPlugin(claudeDir: string): { version: string; path?: string } | null {
  const settings = readJson(join(claudeDir, 'settings.json')) as { enabledPlugins?: Record<string, unknown> } | undefined
  const enabled = Object.entries(settings?.enabledPlugins ?? {}).filter(([k, v]) => k.startsWith('hackforge@') && v !== false)
  if (!enabled.length) return null
  const records = readJson(join(claudeDir, 'plugins', 'installed_plugins.json')) as
    | { plugins?: Record<string, { version?: string; installPath?: string }[] | { version?: string; installPath?: string }> }
    | undefined
  for (const [key] of enabled) {
    const rec = records?.plugins?.[key]
    const entry = Array.isArray(rec) ? rec[0] : rec
    if (entry) return { version: entry.version ?? '0.0.0', path: entry.installPath }
  }
  // Enabled but no record (older Claude Code): it loads, version unknown.
  return { version: '0.0.0' }
}

/** Which HackForge sessions get, and what to pass to the SDK for it. */
export function choosePlugin(builtin: { path: string; version: string } | null, installed: { version: string } | null): HackforgePluginInfo {
  const base = { builtinVersion: builtin?.version, installedVersion: installed?.version === '0.0.0' ? undefined : installed?.version }
  if (builtin && (!installed || compareVersions(builtin.version, installed.version) >= 0)) return { ...base, source: 'builtin', version: builtin.version, path: builtin.path }
  if (installed) return { ...base, source: 'installed', version: base.installedVersion }
  return { ...base, source: 'none' }
}
