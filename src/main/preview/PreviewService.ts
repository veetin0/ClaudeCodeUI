import type { ChildProcess } from 'node:child_process'
import { killTree, spawnTool } from '../system/proc'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { isAbsolute, join } from 'node:path'
import {
  devScripts,
  findLocalUrls,
  parseCompositions,
  parseRenderProgress,
  stripAnsi,
  type Composition,
  type DetectedUrl,
  type PreviewServer,
  type PreviewState,
  type ProjectInfo,
  type RenderJob,
} from '@shared/preview'
import { agentEnv } from '../system/environment'

const LOG_LINES = 200
const MAX_DETECTED = 12
const MODEL_RE = /\.(glb|gltf)$/i
/** Not looked in for models: installs, builds, caches. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'out', '.next', '.venv', 'venv', '__pycache__', '.cache', 'coverage', 'target'])

/** 3D models in a project: a bounded walk (depth, count), in name order. */
export async function findModels(root: string, maxDepth = 6, max = 200): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > maxDepth || found.length >= max) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (found.length >= max) return
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(join(dir, e.name), depth + 1)
      } else if (e.isFile() && MODEL_RE.test(e.name)) found.push(join(dir, e.name))
    }
  }
  await walk(root, 0)
  return found
}

const canListen = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const srv = createServer()
    srv.once('error', (e: NodeJS.ErrnoException) => resolve(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT'))
    srv.listen(port, host, () => srv.close(() => resolve(true)))
  })

/**
 * A free localhost port, so several Studios/servers can run side by side. A dev server may listen
 * on 127.0.0.1, ::1 or every interface; binding only 127.0.0.1 succeeds next to a server on `::`
 * or 0.0.0.0 (macOS and Windows allow it), so check them all. A missing IPv6 stack doesn't count.
 */
export async function freePort(preferred: number): Promise<number> {
  const free = async (p: number) => {
    for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::']) if (!(await canListen(p, host))) return false
    return true
  }
  for (let p = preferred; p < preferred + 50; p++) if (await free(p)) return p
  // All 50 taken: let the OS pick one.
  return new Promise((resolve) => {
    const srv = createServer()
    srv.once('error', () => resolve(preferred))
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })
}

function packageManager(cwd: string): string {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(cwd, 'bun.lockb')) || existsSync(join(cwd, 'bun.lock'))) return 'bun'
  return 'npm'
}

/** The project's own Remotion CLI when installed (fast), else npx. */
function remotionCommand(cwd: string): [string, string[]] {
  const local = join(cwd, 'node_modules', '.bin', 'remotion')
  return existsSync(local) ? [local, []] : ['npx', ['--yes', 'remotion']]
}

/**
 * Runs Remotion Studio, npm dev servers and Remotion renders for the Preview view, and spots local
 * URLs in command/terminal output. Pushes the whole state to the renderer on every change.
 */
export class PreviewService {
  private servers = new Map<string, { info: PreviewServer; proc: ChildProcess }>()
  private renders = new Map<string, { info: RenderJob; proc: ChildProcess | null }>()
  private detected: DetectedUrl[] = []
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly publish: (state: PreviewState) => void) {}

  state(): PreviewState {
    return {
      servers: [...this.servers.values()].map((s) => s.info),
      renders: [...this.renders.values()].map((r) => r.info),
      detected: this.detected,
    }
  }

  async detect(cwd: string): Promise<ProjectInfo> {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      const remotionVersion = deps.remotion ?? deps['@remotion/cli']
      return { cwd, remotion: Boolean(remotionVersion), remotionVersion, devScripts: devScripts(pkg.scripts), models: await findModels(cwd) }
    } catch {
      return { cwd, remotion: false, devScripts: [], models: await findModels(cwd) }
    }
  }

  async startStudio(cwd: string): Promise<PreviewServer> {
    const existing = this.find(cwd, 'remotion')
    if (existing) return existing
    const port = await freePort(3000)
    const [cmd, pre] = remotionCommand(cwd)
    return this.launch(cwd, 'remotion', 'Remotion Studio', cmd, [...pre, 'studio', '--port', String(port), '--no-open'])
  }

  async startScript(cwd: string, script: string): Promise<PreviewServer> {
    const existing = [...this.servers.values()].find((s) => s.info.cwd === cwd && s.info.label === script && s.info.status !== 'exited')
    if (existing) return existing.info
    return this.launch(cwd, 'script', script, packageManager(cwd), ['run', script])
  }

  stop(id: string) {
    const s = this.servers.get(id)
    if (s) this.kill(s.proc)
    this.servers.delete(id)
    this.changed()
  }

  async compositions(cwd: string): Promise<Composition[]> {
    const [cmd, pre] = remotionCommand(cwd)
    const out = await new Promise<string>((resolve, reject) => {
      const p = spawnTool(cmd, [...pre, 'compositions', ...this.browserArgs()], { cwd, env: this.env() })
      let buf = ''
      p.stdout?.on('data', (d) => (buf += d))
      p.stderr?.on('data', (d) => (buf += d))
      p.on('error', reject)
      p.on('close', (code) => (code === 0 ? resolve(buf) : reject(new Error(stripAnsi(buf).trim().split('\n').slice(-6).join('\n') || `remotion exited with ${code}`))))
    })
    return parseCompositions(out)
  }

  async render(cwd: string, composition: string, outputRel?: string): Promise<RenderJob> {
    const output = outputRel && isAbsolute(outputRel) ? outputRel : join(cwd, outputRel ?? join('out', `${composition}.mp4`))
    await mkdir(join(output, '..'), { recursive: true })
    const [cmd, pre] = remotionCommand(cwd)
    const info: RenderJob = { id: randomUUID(), cwd, composition, output, status: 'running', startedAt: Date.now() }
    const proc = spawnTool(cmd, [...pre, 'render', composition, output, ...this.browserArgs()], { cwd, env: this.env(), group: true })
    const entry = { info, proc: proc as ChildProcess | null }
    this.renders.set(info.id, entry)
    let tail = ''
    const onData = (d: Buffer) => {
      const text = d.toString()
      tail = (tail + text).slice(-4000)
      const p = parseRenderProgress(text)
      if (p) {
        info.progress = p
        this.changed()
      }
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('error', (err) => {
      info.status = 'error'
      info.error = err.message
      info.endedAt = Date.now()
      this.changed()
    })
    proc.on('close', (code) => {
      entry.proc = null
      if (info.status === 'running') {
        info.status = code === 0 ? 'done' : 'error'
        if (code !== 0) info.error = stripAnsi(tail).trim().split('\n').slice(-8).join('\n')
      }
      info.endedAt = Date.now()
      this.changed()
    })
    this.changed()
    return info
  }

  cancelRender(id: string) {
    const r = this.renders.get(id)
    if (!r) return
    if (r.proc) {
      r.info.status = 'cancelled'
      this.kill(r.proc)
    } else {
      this.renders.delete(id)
    }
    this.changed()
  }

  /** Output from a command an agent ran, or from a terminal: remember any local server URLs. */
  noteOutput(text: string, source: DetectedUrl['source'], cwd?: string) {
    const urls = findLocalUrls(text)
    if (urls.length === 0) return
    const known = new Set([...this.servers.values()].map((s) => s.info.url))
    let changed = false
    for (const url of urls) {
      if (known.has(url)) continue
      this.detected = [{ url, cwd, source, ts: Date.now() }, ...this.detected.filter((d) => d.url !== url)].slice(0, MAX_DETECTED)
      changed = true
    }
    if (changed) this.changed()
  }

  stopAll() {
    for (const s of this.servers.values()) this.kill(s.proc)
    for (const r of this.renders.values()) if (r.proc) this.kill(r.proc)
    this.servers.clear()
  }

  private find(cwd: string, kind: PreviewServer['kind']): PreviewServer | undefined {
    return [...this.servers.values()].find((s) => s.info.cwd === cwd && s.info.kind === kind && s.info.status !== 'exited' && s.info.status !== 'error')?.info
  }

  private launch(cwd: string, kind: PreviewServer['kind'], label: string, cmd: string, args: string[]): PreviewServer {
    const info: PreviewServer = { id: randomUUID(), cwd, kind, label, status: 'starting', log: [], startedAt: Date.now() }
    // Own process group (macOS/Linux), so stopping also stops whatever npm/npx started underneath.
    const proc = spawnTool(cmd, args, { cwd, env: this.env(), group: true })
    this.servers.set(info.id, { info, proc })
    const onData = (d: Buffer) => {
      const text = stripAnsi(d.toString())
      info.log = [...info.log, ...text.split(/\r?\n/).filter((l) => l.trim())].slice(-LOG_LINES)
      if (!info.url) {
        const url = findLocalUrls(text)[0]
        if (url) {
          info.url = url
          info.status = 'ready'
          this.detected = this.detected.filter((x) => x.url !== url)
        }
      }
      this.changed()
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)
    proc.on('error', (err) => {
      info.status = 'error'
      info.log = [...info.log, err.message]
      this.changed()
    })
    proc.on('close', (code) => {
      if (info.status !== 'error') info.status = code === 0 || code === null ? 'exited' : 'error'
      info.log = [...info.log, `[exited with code ${code}]`].slice(-LOG_LINES)
      this.changed()
    })
    this.changed()
    return info
  }

  private kill(proc: ChildProcess) {
    killTree(proc)
  }

  private env(): Record<string, string | undefined> {
    return { ...agentEnv(), BROWSER: 'none', FORCE_COLOR: '0' }
  }

  /** Lets a machine without Remotion's own Chrome download use an existing headless Chrome. */
  private browserArgs(): string[] {
    const exe = process.env.HARNESS_REMOTION_BROWSER
    return exe ? [`--browser-executable=${exe}`] : []
  }

  private changed() {
    this.timer ??= setTimeout(() => {
      this.timer = null
      this.publish(this.state())
    }, 80)
  }
}
