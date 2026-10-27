import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { Runner } from '../kit3d/Kit3dService'
import { spawnTool } from '../system/proc'

/** The MCP for Blender release Harness sets up (server and add-on together). */
export const BLENDER_MCP_VERSION = '2.2.4'
/** Where the add-on's socket server listens inside Blender. */
export const BLENDER_PORT = 9876
/** How sessions start the server: pinned, on uv's own Python 3.11 (the package's advice), no telemetry. */
export const blenderMcpArgs = ['--python', '3.11', `mcp-for-blender@${BLENDER_MCP_VERSION}`]
export const BLENDER_MCP_ENV = { UV_PYTHON_PREFERENCE: 'only-managed', DISABLE_TELEMETRY: 'true', BLENDERMCP_NO_UPDATE_CHECK: '1' }

/** Runs inside Blender: enables the add-on unless it's already enabled under some name, and saves the preferences. */
const ENABLE_SCRIPT = String.raw`
import json, sys
import addon_utils, bpy
module = sys.argv[sys.argv.index("--") + 1]
names = {"MCP for Blender", "Blender MCP"}
result = {"already": False, "enabled": False, "error": None}
try:
    enabled = {a.module for a in bpy.context.preferences.addons}
    for mod in addon_utils.modules(refresh=True):
        if mod.__name__ in enabled and addon_utils.module_bl_info(mod).get("name") in names:
            result["already"] = True
    if not result["already"]:
        failed = []
        result["enabled"] = addon_utils.enable(module, default_set=True, handle_error=lambda e: failed.append(f"{type(e).__name__}: {e}")) is not None
        if result["enabled"]:
            bpy.ops.wm.save_userpref()
        else:
            result["error"] = "Blender couldn't load the add-on" + (f" ({failed[-1]})" if failed else "")
except Exception as e:
    result["error"] = str(e)
print("HARNESS_RESULT " + json.dumps(result))
`

/** Runs inside Blender: where this Blender keeps the user's add-ons and settings. */
const PATHS_SCRIPT = String.raw`
import bpy, json
print("HARNESS_PATHS " + json.dumps({"addons": bpy.utils.user_resource('SCRIPTS', path='addons', create=True), "user": bpy.utils.resource_path('USER')}))
`

/** Imports a model when Blender opens (Open in Blender from the 3D viewer). */
const IMPORT_SCRIPT = String.raw`
import bpy, sys
path = sys.argv[sys.argv.index("--") + 1]
if path.lower().endswith((".glb", ".gltf")):
    bpy.ops.import_scene.gltf(filepath=path)
`

export interface BlenderDeps {
  /** Where Harness records that it set the add-on up. */
  dataDir: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  home?: string
  exists?(path: string): boolean
  /** Runs a command to completion: its stdout, or undefined if it failed. */
  probe?(cmd: string, args: string[], env?: Record<string, string>): string | undefined
  run?: Runner
  /** Whether something listens on localhost:port. */
  listening?(port: number): Promise<boolean>
  launch?(cmd: string, args: string[]): void
}

const defaultProbe = (cmd: string, args: string[], env?: Record<string, string>) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 180_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
  } catch {
    return undefined
  }
}

const defaultListening = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = createConnection({ host: '127.0.0.1', port })
    const done = (v: boolean) => {
      s.destroy()
      resolve(v)
    }
    s.setTimeout(400, () => done(false))
    s.once('connect', () => done(true))
    s.once('error', () => done(false))
  })

const defaultRun: Runner = (cmd, args, opts, onLine) =>
  new Promise((resolve) => {
    const p = spawnTool(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    const feed = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(onLine)
    p.stdout?.on('data', feed)
    p.stderr?.on('data', feed)
    p.on('error', (e) => {
      onLine(e.message)
      resolve(1)
    })
    p.on('close', (code) => resolve(code ?? 1))
  })

/**
 * Blender on this computer, and the community MCP for Blender that lets Claude work in an open
 * Blender: finding Blender and uv, installing and enabling the add-on (only that: the package's own
 * `setup` would also rewrite other apps' configs), and whether a Blender with the add-on is open.
 */
export class BlenderService {
  private found?: { at: number; blender: { path: string; version?: string } | null; uvx: string | null }
  private liveSeen = false

  constructor(private readonly deps: BlenderDeps) {}

  private get platform() {
    return this.deps.platform ?? process.platform
  }

  private exists(p: string) {
    return (this.deps.exists ?? existsSync)(p)
  }

  private probe(cmd: string, args: string[], env?: Record<string, string>) {
    return (this.deps.probe ?? defaultProbe)(cmd, args, env)
  }

  /** Where Blender is normally installed, newest-looking first; the same places MCP for Blender looks. */
  candidates(): string[] {
    const env = this.deps.env ?? process.env
    const home = this.deps.home ?? homedir()
    const list = (dir: string, re: RegExp) => {
      try {
        return readdirSync(dir)
          .filter((n) => re.test(n))
          .sort()
          .reverse()
          .map((n) => join(dir, n))
      } catch {
        return []
      }
    }
    if (this.platform === 'darwin') {
      return ['/Applications', join(home, 'Applications')].flatMap((d) => list(d, /^Blender.*\.app$/).map((a) => join(a, 'Contents', 'MacOS', 'Blender')))
    }
    if (this.platform === 'win32') {
      const roots = [env.ProgramFiles ?? 'C:\\Program Files', env['ProgramFiles(x86)']].filter((r): r is string => !!r)
      return [
        ...roots.flatMap((r) => list(join(r, 'Blender Foundation'), /^Blender/).map((d) => join(d, 'blender.exe'))),
        join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam', 'steamapps', 'common', 'Blender', 'blender.exe'),
      ]
    }
    return ['/snap/bin/blender', '/usr/bin/blender', '/usr/local/bin/blender', ...list(join(home, 'blender'), /^blender/).map((d) => join(d, 'blender'))]
  }

  private which(cmd: string): string | null {
    const out = this.probe(this.platform === 'win32' ? 'where' : 'which', [cmd])
    const first = out?.split(/\r?\n/).find(Boolean)?.trim()
    return first && this.exists(first) ? first : null
  }

  /** Blender and uvx, looked up at most once a minute (Blender takes a moment to print its version). */
  detect(fresh = false) {
    if (!fresh && this.found && Date.now() - this.found.at < 60_000) return this.found
    const home = this.deps.home ?? homedir()
    const paths = [this.which('blender'), ...this.candidates()].filter((p): p is string => !!p && this.exists(p))
    let blender: { path: string; version?: string } | null = null
    for (const path of paths) {
      const version = this.probe(path, ['--version'])?.match(/Blender\s+(\d+\.\d+(?:\.\d+)?)/)?.[1]
      if (version) {
        blender = { path, version }
        break
      }
    }
    if (!blender && paths[0]) blender = { path: paths[0] }
    const exe = this.platform === 'win32' ? 'uvx.exe' : 'uvx'
    const uvx = this.which('uvx') ?? [join(home, '.local', 'bin', exe), join(home, '.cargo', 'bin', exe)].find((p) => this.exists(p)) ?? null
    this.found = { at: Date.now(), blender, uvx }
    return this.found
  }

  private get marker() {
    return join(this.deps.dataDir, 'blender-addon.json')
  }

  /** The add-on version Harness set up, if any. */
  addonVersion(): string | undefined {
    try {
      return JSON.parse(readFileSync(this.marker, 'utf8')).version
    } catch {
      return undefined
    }
  }

  /** Whether a Blender with the add-on's server is open (checked each call; it's a local connect). */
  async live(): Promise<boolean> {
    this.liveSeen = await (this.deps.listening ?? defaultListening)(BLENDER_PORT)
    return this.liveSeen
  }

  /** The last live() answer, for the synchronous state. */
  get lastLive() {
    return this.liveSeen
  }

  /**
   * Installs the add-on into this Blender's add-ons folder and enables it. Returns what happened in a
   * sentence; throws with the reason when it can't.
   */
  async setupAddon(onLine: (line: string) => void = () => {}): Promise<string> {
    const { blender, uvx } = this.detect(true)
    if (!blender) throw new Error('Blender wasn’t found. Install it from blender.org/download, then try again.')
    if (!uvx) throw new Error('uv wasn’t found. Install it (docs.astral.sh/uv), then try again.')
    if (await this.live()) throw new Error('Blender is open. Quit it first, so it doesn’t overwrite the add-on setting when it closes, then try again.')
    const paths = this.probe(blender.path, ['--background', '--python-expr', PATHS_SCRIPT])
      ?.split(/\r?\n/)
      .find((l) => l.startsWith('HARNESS_PATHS '))
    if (!paths) throw new Error('Blender didn’t say where its add-ons go. Open it once, then try again.')
    const { addons, user } = JSON.parse(paths.slice('HARNESS_PATHS '.length)) as { addons: string; user: string }
    // A Blender version that has never been opened offers to copy the previous version's settings
    // on first launch, but only while it has no saved preferences: don't take that choice away.
    const userDir = user.replace(/[\\/]+$/, '')
    const prefs = join(userDir, 'config', 'userpref.blend')
    const base = dirname(userDir)
    const others = (() => {
      try {
        return readdirSync(base).filter((n) => /^\d+\.\d+$/.test(n) && n !== basename(userDir))
      } catch {
        return []
      }
    })()
    if (!this.exists(prefs) && others.length) throw new Error('This Blender version hasn’t been opened yet. Open it once (and choose whether to import your old settings), quit it, then try again.')

    const run = this.deps.run ?? defaultRun
    const out: string[] = []
    const code = await run(uvx, [...blenderMcpArgs, 'install-addon', '--addons-dir', addons], { cwd: this.deps.dataDir, env: BLENDER_MCP_ENV }, (l) => {
      out.push(l)
      onLine(l)
    })
    if (code !== 0) throw new Error(`Installing the add-on failed: ${out.slice(-2).join(' ') || `exit ${code}`}`)
    const result = this.probe(blender.path, ['--background', '--python-expr', ENABLE_SCRIPT, '--', 'blender_mcp'], { BLENDERMCP_NO_UPDATE_CHECK: '1' })
      ?.split(/\r?\n/)
      .find((l) => l.startsWith('HARNESS_RESULT '))
    if (!result) throw new Error('Blender exited without enabling the add-on. Enable it by hand: Edit → Preferences → Add-ons → MCP for Blender.')
    const r = JSON.parse(result.slice('HARNESS_RESULT '.length)) as { already: boolean; enabled: boolean; error: string | null }
    if (!r.already && !r.enabled) {
      // Linux distributions' Blender packages run on the system Python, which may lack what the add-on imports.
      const distro = /ModuleNotFoundError/.test(r.error ?? '') ? ' This Blender runs on a Python without that module: use the official build from blender.org (it brings its own Python), or install the module for that Python.' : ' Enable it by hand: Edit → Preferences → Add-ons → MCP for Blender.'
      throw new Error(`${r.error ?? 'Blender didn’t enable the add-on'}.${distro}`)
    }
    writeFileSync(this.marker, JSON.stringify({ version: BLENDER_MCP_VERSION, addons, blender: blender.version }) + '\n')
    return r.already ? 'The add-on was already enabled; it’s up to date now. Open Blender to connect.' : 'The add-on is installed and enabled. Open Blender to connect.'
  }

  /** Opens Blender (its add-on starts the connection by itself), with a model imported if given. */
  open(file?: string) {
    const { blender } = this.detect()
    if (!blender) throw new Error('Blender wasn’t found. Install it from blender.org/download.')
    const args = file ? ['--python-expr', IMPORT_SCRIPT, '--', file] : []
    if (this.deps.launch) return this.deps.launch(blender.path, args)
    spawn(blender.path, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  }
}
