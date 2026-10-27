import type { ChildProcess } from 'node:child_process'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  KIT3D_DIR,
  KIT3D_PITCH_DIR,
  KIT3D_QUALITY,
  type Kit3dClip,
  type Kit3dJob,
  type Kit3dQuality,
  type Kit3dRequirement,
  type Kit3dState,
} from '@shared/kit3d'
import { PITCH_DIR } from '@shared/pitch'
import { killTree, spawnTool } from '../system/proc'

/** Runs a command, feeding each output line to onLine; resolves with the exit code. */
export type Runner = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
  onLine: (line: string) => void,
  onSpawn?: (p: ChildProcess) => void,
) => Promise<number>

/** Runs a command to completion and returns its output, or undefined if it failed. */
export type Probe = (cmd: string, args: string[], cwd?: string) => string | undefined

export interface Kit3dDeps {
  projectDir(): string | undefined
  /** The kit in the HackForge in use (skills/video/kit3d). */
  templateDir(): string
  push(state: Kit3dState): void
  /** The browser the dev tools use (Chrome, Edge or a downloaded Chromium), for rendering. */
  browserPath(): string | undefined
  /** Node to run the kit's scripts with: Electron as Node in the app. */
  node: { command: string; env: Record<string, string> }
  run?: Runner
  probe?: Probe
  platform?: NodeJS.Platform
}

const MIN_PYTHON: [number, number] = [3, 10]
/** Left out when copying the kit into a project. */
const SKIP = new Set(['node_modules', 'build', 'out', '.venv', '__pycache__', 'models'])

const defaultRun: Runner = (cmd, args, opts, onLine, onSpawn) =>
  new Promise((resolve) => {
    const p = spawnTool(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    onSpawn?.(p)
    const feed = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(onLine)
    p.stdout?.on('data', feed)
    p.stderr?.on('data', feed)
    p.on('error', (e) => {
      onLine(e.message)
      resolve(1)
    })
    p.on('close', (code) => resolve(code ?? 1))
  })

const defaultProbe: Probe = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' })
  } catch {
    return undefined
  }
}

async function copyMissing(from: string, to: string) {
  await mkdir(to, { recursive: true })
  for (const e of await readdir(from, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const src = join(from, e.name)
    const dst = join(to, e.name)
    if (e.isDirectory()) await copyMissing(src, dst)
    else if (!existsSync(dst)) await copyFile(src, dst)
  }
}

const readJson = (path: string): Record<string, unknown> | undefined => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

const mtime = (path: string) => {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

class Stopped extends Error {}

/**
 * The 3D kit in the event project (video/kit3d): sets it up (npm packages and a Python venv), lists
 * the clips in its story.py, renders stills and clips with progress, and copies a finished clip into
 * the pitch. One job at a time: a render keeps every core busy.
 */
export class Kit3dService {
  private job?: Kit3dJob
  private proc?: ChildProcess
  private stopping = false
  private watcher: FSWatcher | null = null
  private watched?: string
  private timer?: NodeJS.Timeout
  private reqCache?: { at: number; reqs: Kit3dRequirement[]; python?: { version: string; exe: string } }
  private listCache?: { key: string; clips: { name: string; doc: string }[]; error?: string }

  constructor(private readonly deps: Kit3dDeps) {}

  private get win() {
    return (this.deps.platform ?? process.platform) === 'win32'
  }

  private probe(cmd: string, args: string[], cwd?: string) {
    return (this.deps.probe ?? defaultProbe)(cmd, args, cwd)
  }

  private dir(): string | undefined {
    const p = this.deps.projectDir()
    return p ? join(p, KIT3D_DIR) : undefined
  }

  private requireDir(): string {
    const d = this.dir()
    if (!d) throw new Error('Link an event project first.')
    return d
  }

  private venvPython(dir: string) {
    return this.win ? join(dir, '.venv', 'Scripts', 'python.exe') : join(dir, '.venv', 'bin', 'python3')
  }

  /** A Python 3.10+ on PATH (the venv is made from it). */
  private findPython(): { version: string; exe?: string } | undefined {
    const tries: [string, string[]][] = this.win
      ? [
          ['py', ['-3']],
          ['python', []],
          ['python3', []],
        ]
      : [
          ['python3', []],
          ['python', []],
        ]
    let best: { version: string; exe?: string } | undefined
    for (const [cmd, pre] of tries) {
      const out = this.probe(cmd, [...pre, '-c', 'import sys; print("%d.%d.%d" % sys.version_info[:3]); print(sys.executable)'])
      const [version, exe] = (out ?? '').trim().split(/\r?\n/)
      if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) continue
      const [a, b] = version.split('.').map(Number)
      if (a > MIN_PYTHON[0] || (a === MIN_PYTHON[0] && b >= MIN_PYTHON[1])) return { version, exe: exe?.trim() || cmd }
      best ??= { version }
    }
    return best
  }

  private requirements(fresh = false) {
    if (!fresh && this.reqCache && Date.now() - this.reqCache.at < 30_000) return this.reqCache
    const py = this.findPython()
    const ffmpeg = this.probe('ffmpeg', ['-version'])?.split('\n')[0]?.match(/ffmpeg version (\S+)/)?.[1]
    const npm = this.probe('npm', ['--version'])?.trim()
    const browser = this.deps.browserPath()
    const reqs: Kit3dRequirement[] = [
      { id: 'python', ok: !!py?.exe, found: py?.version, hint: 'Python 3.10 or newer: python.org/downloads, or brew install python' },
      { id: 'ffmpeg', ok: !!ffmpeg, found: ffmpeg, hint: 'ffmpeg: brew install ffmpeg, winget install ffmpeg, or apt install ffmpeg' },
      { id: 'browser', ok: !!browser, found: browser, hint: 'A Chrome to render with: Settings → Dev tools → Browser → Get Chromium' },
      { id: 'npm', ok: !!npm, found: npm, hint: 'Node.js (it comes with npm): nodejs.org' },
    ]
    this.reqCache = { at: Date.now(), reqs, python: py?.exe ? { version: py.version, exe: py.exe } : undefined }
    return this.reqCache
  }

  /** Fingerprint of requirements.txt: the Python packages are re-installed when it changes. */
  private reqHash(dir: string) {
    try {
      return createHash('sha256').update(readFileSync(join(dir, 'requirements.txt'))).digest('hex').slice(0, 16)
    } catch {
      return 'none'
    }
  }

  private ready(dir: string): boolean {
    if (!existsSync(join(dir, 'node_modules', 'three')) || !existsSync(join(dir, 'node_modules', 'playwright-core'))) return false
    try {
      return readFileSync(join(dir, '.venv', '.harness-ready'), 'utf8').trim() === this.reqHash(dir)
    } catch {
      return false
    }
  }

  /** The Python that runs the kit's scripts: its venv once set up, else the one on PATH. */
  private python(dir: string) {
    const venv = this.venvPython(dir)
    return existsSync(venv) ? venv : this.requirements().python?.exe
  }

  private listClips(dir: string): { clips: { name: string; doc: string }[]; error?: string } {
    const key = `${mtime(join(dir, 'story.py'))}:${mtime(join(dir, 'film.py'))}`
    if (this.listCache?.key === key) return this.listCache
    const py = this.python(dir)
    let result: { clips: { name: string; doc: string }[]; error?: string }
    if (!py) result = { clips: [], error: 'Python 3.10+ is needed to read the clips.' }
    else {
      const out = this.probe(py, ['story.py', '--list'], dir)
      try {
        const parsed = JSON.parse((out ?? '').trim().split(/\r?\n/).pop() ?? '')
        result = { clips: Array.isArray(parsed) ? parsed.filter((c) => typeof c?.name === 'string').map((c) => ({ name: c.name, doc: String(c.doc ?? '') })) : [] }
      } catch {
        result = { clips: [], error: "Couldn't read the clips from story.py: run `python3 story.py --list` in video/kit3d to see the error." }
      }
    }
    this.listCache = { key, ...result }
    return result
  }

  private clipInfo(dir: string, name: string, doc: string): Kit3dClip {
    const build = join(dir, 'build', name)
    const tl = readJson(join(build, 'timeline.json'))
    let stills: string[] = []
    try {
      stills = readdirSync(join(build, 'stills'))
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => join(build, 'stills', f))
    } catch {
      // none yet
    }
    const mp4 = join(dir, 'out', `${name}.mp4`)
    const vm = mtime(mp4)
    const side = readJson(join(dir, 'out', `${name}.json`))
    const video = vm
      ? { path: mp4, mtime: vm, quality: (side?.quality === 'draft' ? 'draft' : 'final') as Kit3dQuality, seconds: typeof side?.seconds === 'number' ? side.seconds : undefined }
      : undefined
    const project = this.deps.projectDir()
    const pm = project ? mtime(join(project, PITCH_DIR, 'public', KIT3D_PITCH_DIR, `${name}.mp4`)) : undefined
    return {
      name,
      doc,
      seconds: typeof tl?.duration === 'number' ? tl.duration : undefined,
      frames: typeof tl?.frames === 'number' ? tl.frames : undefined,
      uses: Array.isArray(tl?.uses) ? (tl.uses as string[]) : undefined,
      talks: Array.isArray(tl?.lines) ? tl.lines.length > 0 : undefined,
      stills,
      video,
      // addToPitch copies the render's timestamp exactly (to within float rounding).
      pitch: pm === undefined ? 'none' : vm !== undefined && Math.abs(pm - vm) < 2 ? 'current' : 'stale',
    }
  }

  /** fresh: look for Python, ffmpeg and npm again (the panel opening: they may have just been installed). */
  async state(fresh = false): Promise<Kit3dState> {
    const dir = this.dir()
    this.ensureWatch(dir)
    const { reqs } = this.requirements(fresh)
    if (!dir) return { exists: false, ready: false, requirements: reqs, clips: [], job: this.job }
    const exists = existsSync(join(dir, 'story.py'))
    if (!exists) return { dir, exists, ready: false, requirements: reqs, clips: [], job: this.job }
    const { clips, error } = this.listClips(dir)
    return {
      dir,
      exists,
      ready: this.ready(dir),
      requirements: reqs,
      clips: clips.map((c) => this.clipInfo(dir, c.name, c.doc)),
      listError: error,
      job: this.job,
    }
  }

  private async publish() {
    this.deps.push(await this.state())
  }

  /** Publishes soon, once: output lines and file changes come in bursts. */
  private soon() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.publish(), 300)
  }

  private ensureWatch(dir?: string) {
    if (dir === this.watched) return
    this.watcher?.close()
    this.watcher = null
    this.watched = dir
    if (!dir || !existsSync(dir)) {
      // Not there yet (the kit gets copied on setup): look again next time.
      this.watched = undefined
      return
    }
    try {
      // story.py changing (Claude adding a clip) refreshes the list.
      this.watcher = watch(dir, (_e, f) => f && /^(story|film)\.py$/.test(String(f)) && this.soon())
      this.watcher.on('error', () => {
        this.watcher?.close()
        this.watcher = null
      })
    } catch {
      this.watcher = null
    }
  }

  private setJob(job: Kit3dJob) {
    this.job = job
    this.soon()
  }

  /** Runs one step of a job; throws when it fails or is stopped. */
  private async step(cmd: string, args: string[], cwd: string, message: string, env: Record<string, string> = {}): Promise<string[]> {
    if (this.stopping) throw new Stopped()
    const job = this.job!
    this.setJob({ ...job, message })
    const lines: string[] = []
    const code = await (this.deps.run ?? defaultRun)(
      cmd,
      args,
      { cwd, env },
      (line) => {
        lines.push(line)
        if (lines.length > 200) lines.shift()
      },
      (p) => (this.proc = p),
    )
    this.proc = undefined
    if (this.stopping) throw new Stopped()
    if (code !== 0) {
      // The kit's own checks print "✗ clip: problem"; otherwise the last few lines say what failed.
      const said = lines.filter((l) => /✗|error|Error|Traceback|No module|not found|Run capture_ui/.test(l))
      throw new Error(`${message.replace(/…$/, '')} failed: ${(said.length ? said.slice(-3) : lines.slice(-2)).join(' ').slice(0, 400) || `exit ${code}`}`)
    }
    return lines
  }

  /** Runs a job in the background; returns at once with the state. */
  private async start(job: Kit3dJob, work: (dir: string) => Promise<string>): Promise<Kit3dState> {
    const dir = this.requireDir()
    if (this.job?.status === 'running') throw new Error('Another 3D job is still running.')
    this.stopping = false
    this.job = job
    void work(dir)
      .then((message) => this.setJob({ kind: job.kind, clip: job.clip, quality: job.quality, status: 'done', message }))
      .catch((err) =>
        this.setJob(
          err instanceof Stopped
            ? { kind: job.kind, clip: job.clip, status: 'cancelled', message: job.kind === 'render' ? 'Stopped. Rendering again picks up where it stopped.' : 'Stopped.' }
            : { kind: job.kind, clip: job.clip, status: 'error', message: err instanceof Error ? err.message : String(err) },
        ),
      )
      .finally(() => {
        this.listCache = undefined
        this.stopping = false
      })
    return this.state()
  }

  private nodeEnv(extra: Record<string, string> = {}) {
    const chrome = this.deps.browserPath()
    return { ...this.deps.node.env, ...(chrome ? { CHROME_PATH: chrome } : {}), ...extra }
  }

  /** Copies the kit into the project if needed, then installs its npm packages and Python venv. */
  async setup(): Promise<Kit3dState> {
    const dir = this.requireDir()
    await copyMissing(this.deps.templateDir(), dir)
    this.ensureWatch(dir)
    return this.start({ kind: 'setup', status: 'running', message: 'Setting up the 3D kit…' }, async () => {
      const py = this.requirements(true).python
      if (!py) throw new Error('Python 3.10 or newer is needed (python.org/downloads, or brew install python).')
      await this.step('npm', ['install', '--no-audit', '--no-fund'], dir, 'Installing three.js and Playwright (npm)…')
      if (!existsSync(this.venvPython(dir))) await this.step(py.exe, ['-m', 'venv', '.venv'], dir, 'Creating the Python environment…')
      await this.step(
        this.venvPython(dir),
        ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', 'requirements.txt'],
        dir,
        'Installing the Python packages (numpy, scipy, the voice; a few minutes)…',
      )
      await writeFile(join(dir, '.venv', '.harness-ready'), this.reqHash(dir))
      return 'The 3D kit is ready. Add a clip with New 3D clip.'
    })
  }

  /** Screenshots the app's screens the clips use (ui_states.mjs; the app must be running). */
  capture(): Promise<Kit3dState> {
    return this.start({ kind: 'capture', status: 'running', message: 'Capturing the app’s screens…' }, async (dir) => {
      const lines = await this.step(this.deps.node.command, ['capture_ui.mjs'], dir, 'Capturing the app’s screens…', this.nodeEnv())
      return lines.filter((l) => l.startsWith('→')).pop() ?? 'Captured the app’s screens.'
    })
  }

  private timeline(dir: string, clip: string) {
    return this.step(this.python(dir) ?? 'python3', ['story.py', clip], dir, `Building ${clip}'s timeline…`)
  }

  /** Up to 20 half-size stills at the moments that matter: a look in about a minute. */
  stills(clip: string): Promise<Kit3dState> {
    return this.start({ kind: 'stills', clip, status: 'running', message: 'Stills…' }, async (dir) => {
      await this.timeline(dir, clip)
      const out = join(dir, 'build', clip, 'stills')
      await rm(out, { recursive: true, force: true })
      const lines = await this.step(this.deps.node.command, ['render.mjs', 'stills', clip], dir, `Rendering ${clip}'s stills…`, this.nodeEnv())
      return lines.find((l) => / stills in /.test(l)) ?? 'Stills ready.'
    })
  }

  /** The whole clip: timeline, frames (resuming), sound, MP4. */
  render(clip: string, quality: Kit3dQuality = 'final'): Promise<Kit3dState> {
    const q = KIT3D_QUALITY[quality]
    return this.start({ kind: 'render', clip, quality, status: 'running', message: 'Rendering…' }, async (dir) => {
      const t0 = Date.now()
      const py = this.python(dir) ?? 'python3'
      const build = join(dir, 'build', clip)
      await this.timeline(dir, clip)
      let tl = readJson(join(build, 'timeline.json')) ?? {}
      const talks = Array.isArray(tl.lines) && tl.lines.length > 0
      if (talks) {
        // A clip that speaks (the mascot film) gets its voice first; the beats sit on its durations.
        await this.step(py, ['voice.py'], dir, 'Speaking the lines…')
        await this.timeline(dir, clip)
        tl = readJson(join(build, 'timeline.json')) ?? {}
      }
      const frames = Number(tl.frames) || 0
      const fps = Number(tl.fps) || 30
      if (!frames) throw new Error(`${clip}'s timeline has no frames.`)

      // Frames already rendered for this exact timeline and size are kept, so a stopped render resumes.
      const framesDir = join(build, 'frames')
      const stamp = `${createHash('sha256')
        .update(await readFile(join(build, 'timeline.json')))
        .digest('hex')
        .slice(0, 16)}:${q.w}x${q.h}:${q.sub}`
      const old = await readFile(join(framesDir, '.stamp'), 'utf8').catch(() => '')
      if (old.trim() !== stamp) await rm(framesDir, { recursive: true, force: true })
      await mkdir(framesDir, { recursive: true })
      await writeFile(join(framesDir, '.stamp'), stamp)
      const name = (i: number) => `${String(i).padStart(5, '0')}.png`
      let from = 0
      while (from < frames && existsSync(join(framesDir, name(from)))) from++
      if (from < frames) {
        // The last frame of a stopped render may be half-written.
        if (from > 0) await rm(join(framesDir, name(from - 1)), { force: true }).then(() => from--)
        const samples: [number, number][] = []
        const poll = setInterval(() => {
          let done = 0
          try {
            done = readdirSync(framesDir).filter((f) => f.endsWith('.png')).length
          } catch {
            // just made
          }
          samples.push([Date.now(), done])
          while (samples.length > 1 && samples[0][0] < Date.now() - 60_000) samples.shift()
          const [ta, da] = samples[0]
          const rate = samples.length > 1 && done > da ? (done - da) / ((Date.now() - ta) / 1000) : 0
          this.setJob({
            kind: 'render',
            clip,
            quality,
            status: 'running',
            message: `Rendering ${clip} (${q.label})…`,
            done,
            total: frames,
            etaSeconds: rate ? Math.round((frames - done) / rate) : undefined,
          })
        }, 1000)
        try {
          await this.step(this.deps.node.command, ['render.mjs', 'frames', clip, String(from), String(frames)], dir, `Rendering ${clip} (${q.label})…`, this.nodeEnv({ W: String(q.w), H: String(q.h), SUB: String(q.sub) }))
        } finally {
          clearInterval(poll)
        }
      }
      for (let i = 0; i < frames; i++) if (!existsSync(join(framesDir, name(i)))) throw new Error(`Frame ${i} is missing after the render.`)

      // Effects only for the narrated pitch; a clip that speaks keeps its voice and music.
      await this.step(py, ['sound.py', clip, ...(talks ? [] : ['--stem'])], dir, 'Making the sound…')
      await mkdir(join(dir, 'out'), { recursive: true })
      const mp4 = join(dir, 'out', `${clip}.mp4`)
      await this.step(
        'ffmpeg',
        [
          ...['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', join(framesDir, '%05d.png'), '-i', join(build, talks ? 'sound.wav' : 'sfx.wav')],
          ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', quality === 'final' ? 'slow' : 'veryfast'],
          // AAC overshoots the master's -1 dBFS peak a little: -1.5 dB keeps the true peak under it.
          ...['-af', 'volume=-1.5dB', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4],
        ],
        dir,
        'Writing the MP4…',
      )
      const seconds = Number(tl.duration) || frames / fps
      await writeFile(join(dir, 'out', `${clip}.json`), JSON.stringify({ quality, seconds, renderedAt: new Date().toISOString() }) + '\n')
      return `${clip} is rendered (${q.label}, ${seconds.toFixed(1)} s) in ${Math.max(1, Math.round((Date.now() - t0) / 60000))} min.`
    })
  }

  cancel(): Promise<Kit3dState> {
    if (this.job?.status === 'running') {
      this.stopping = true
      if (this.proc) killTree(this.proc)
    }
    return this.state()
  }

  /** Copies the clip into pitch/public/3d/; the Pitch studio then puts it in a screen scene. */
  async addToPitch(clip: string): Promise<{ media: string; seconds?: number }> {
    const dir = this.requireDir()
    const project = this.deps.projectDir()!
    const src = join(dir, 'out', `${clip}.mp4`)
    const st = await stat(src).catch(() => undefined)
    if (!st) throw new Error(`Render ${clip} first.`)
    const destDir = join(project, PITCH_DIR, 'public', KIT3D_PITCH_DIR)
    await mkdir(destDir, { recursive: true })
    const dst = join(destDir, `${clip}.mp4`)
    await copyFile(src, dst)
    // Same timestamp as the render, so the panel can tell the pitch has the latest one.
    await utimes(dst, st.atime, st.mtime)
    const side = readJson(join(dir, 'out', `${clip}.json`))
    void this.publish()
    return { media: `${KIT3D_PITCH_DIR}/${clip}.mp4`, seconds: typeof side?.seconds === 'number' ? side.seconds : undefined }
  }

  dispose() {
    clearTimeout(this.timer)
    this.watcher?.close()
    if (this.proc) killTree(this.proc)
  }
}
