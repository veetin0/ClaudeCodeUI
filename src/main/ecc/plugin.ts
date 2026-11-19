import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EccInfo } from '@shared/ecc'
import type { BundledPluginInfo } from '@shared/plugins'
import { bundledPlugin, choosePlugin, installedNamed } from '../plugins/bundled'

/** The ECC copy built into Harness (complete only with its hooks and the packages they require). */
export function builtinEcc(appPath: string): { path: string; version: string } | null {
  return bundledPlugin(join(appPath, 'resources', 'ecc'), 'ecc', join('hooks', 'hooks.json'))
}

/** Which ECC sessions get: the built-in copy, or `ecc@ecc` installed in Claude Code when it's newer. */
export function chooseEcc(appPath: string, claudeDir: string): BundledPluginInfo {
  return choosePlugin(builtinEcc(appPath), installedNamed(claudeDir, 'ecc'))
}

const list = (dir: string, keep: (name: string, isDir: boolean) => boolean) => {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => keep(e.name, e.isDirectory())).map((e) => e.name)
  } catch {
    return []
  }
}

/** What's in a copy, for Settings › Tools. */
export function eccInfo(plugin: BundledPluginInfo, root?: string): EccInfo {
  const dir = root ?? plugin.path
  let commit: string | undefined
  if (dir) {
    try {
      commit = (JSON.parse(readFileSync(join(dir, 'HARNESS_SOURCE.json'), 'utf8')) as { commit?: string }).commit || undefined
    } catch {
      // an installed copy has no record of its commit
    }
  }
  const md = (n: string, isDir: boolean) => !isDir && n.endsWith('.md') && n !== 'README.md'
  return {
    plugin,
    commit,
    counts: dir
      ? {
          agents: list(join(dir, 'agents'), md).length,
          skills: list(join(dir, 'skills'), (_n, isDir) => isDir).length,
          commands: list(join(dir, 'commands'), md).length,
          rules: list(join(dir, 'rules'), (_n, isDir) => isDir),
        }
      : { agents: 0, skills: 0, commands: 0, rules: [] },
  }
}
