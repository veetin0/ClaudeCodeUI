import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { SdkPluginConfig } from '@anthropic-ai/claude-agent-sdk'
import { DESIGN_PLUGINS, type DesignPluginInfo, type DesignSkillsSettings, type DesignState } from '@shared/design'
import { bundledPlugin, choosePlugin, installedNamed } from '../hackforge/plugin'

export interface DesignDeps {
  appPath: string
  claudeDir: string
  settings(): DesignSkillsSettings
  push(state: DesignState): void
  /** Runs impeccable's launcher with one argument; resolves with its output. Injected for tests. */
  runLauncher?(launcher: string, arg: string): Promise<{ code: number; out: string }>
}

/** impeccable's launcher script inside a plugin copy (with an impeccable.cmd twin for Windows). */
export const impeccableLauncher = (pluginPath: string): string => join(pluginPath, 'skills', 'impeccable', 'scripts', 'impeccable')

/** Runs the launcher with sh (macOS/Linux) or its .cmd twin (Windows), never for more than two minutes. */
function defaultRun(launcher: string, arg: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const win = process.platform === 'win32'
    const child = win ? spawn('cmd.exe', ['/d', '/s', '/c', `"${launcher}.cmd" ${arg}`], { windowsHide: true }) : spawn('sh', [launcher, arg])
    let out = ''
    child.stdout?.on('data', (d) => (out += d))
    child.stderr?.on('data', (d) => (out += d))
    const timer = setTimeout(() => child.kill(), 120_000)
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
 * The design plugins sessions get (Harness's copies, unless you installed a newer one yourself),
 * and impeccable's detector engine, fetched once per computer in the background so the first
 * session doesn't wait for it (and doesn't have to download it on venue wifi).
 */
export class DesignService {
  private engine: DesignState['engine'] = { status: 'unknown' }

  constructor(private readonly deps: DesignDeps) {}

  plugins(): DesignPluginInfo[] {
    const s = this.deps.settings()
    return DESIGN_PLUGINS.map((p) => {
      if (!s[p.key]) return { key: p.key, label: p.label, source: 'off' as const }
      const bundled = bundledPlugin(join(this.deps.appPath, 'resources', 'design', p.dir), p.name)
      const installed = installedNamed(this.deps.claudeDir, p.name)
      const chosen = choosePlugin(bundled, installed)
      if (chosen.source === 'none') return { key: p.key, label: p.label, source: 'missing' as const }
      return { key: p.key, label: p.label, source: chosen.source, version: chosen.version, path: chosen.source === 'installed' ? installed?.path : chosen.path }
    })
  }

  /** What to pass to the SDK's `plugins` option: the built-in copies that are switched on. */
  sdkPlugins(): SdkPluginConfig[] {
    return this.plugins().flatMap((p) => (p.source === 'builtin' && p.path ? [{ type: 'local' as const, path: p.path }] : []))
  }

  /**
   * Environment for sessions: where impeccable's launcher is (HackForge's `tools design-scan` runs its
   * detector through it) and its quiet mode (only problems, no "clean file" notes).
   */
  env(): Record<string, string> {
    const s = this.deps.settings()
    const imp = this.plugins().find((p) => p.key === 'impeccable')
    return {
      ...(imp?.path ? { HARNESS_IMPECCABLE: impeccableLauncher(imp.path) } : {}),
      ...(s.impeccable && s.quietDetector ? { IMPECCABLE_HOOK_QUIET: '1' } : {}),
    }
  }

  state(): DesignState {
    return { plugins: this.plugins(), engine: this.deps.settings().impeccable ? this.engine : { status: 'off' } }
  }

  /** Makes sure impeccable's engine is on this computer (downloads it once); quick when it already is. */
  async prepare(): Promise<DesignState> {
    const p = this.plugins().find((x) => x.key === 'impeccable')
    if (!p?.path || p.source !== 'builtin') {
      this.engine = { status: p?.source === 'off' ? 'off' : 'unknown' }
      return this.publish()
    }
    this.engine = { status: 'checking' }
    this.publish()
    const { code, out } = await (this.deps.runLauncher ?? defaultRun)(impeccableLauncher(p.path), 'engine-probe')
    const version = /impeccable-engine\s+(\S+)/.exec(out)?.[1]
    this.engine =
      code === 0 && version
        ? { status: 'ready', version }
        : { status: 'failed', error: out.trim().split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300) || `exit ${code}` }
    return this.publish()
  }

  private publish(): DesignState {
    const s = this.state()
    this.deps.push(s)
    return s
  }
}
