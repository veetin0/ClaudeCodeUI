import { spawnTool } from '../system/proc'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import {
  audioState,
  defaultScript,
  mp3Seconds,
  narrationHash,
  parseScript,
  PITCH_DIR,
  SCRIPT_FILE,
  TTS_MODEL,
  type PitchScript,
  type PitchJob,
  type PitchState,
  type Voice,
} from '@shared/pitch'

export type { PitchJob, PitchState, Voice } from '@shared/pitch'

export interface PitchDeps {
  projectDir(): string | undefined
  elevenLabsKey(): string | undefined
  templateDir: string
  push(state: PitchState): void
  fetch?: typeof fetch
  /** Runs npm install; injectable for tests. */
  runInstall?: (cwd: string, onLine: (line: string) => void) => Promise<number>
}

const ELEVEN = 'https://api.elevenlabs.io/v1'
const MEDIA_RE = /\.(mp4|webm|mov|m4v|png|jpe?g|gif|webp)$/i

async function copyMissing(from: string, to: string) {
  await mkdir(to, { recursive: true })
  for (const e of await readdir(from, { withFileTypes: true })) {
    const src = join(from, e.name)
    const dst = join(to, e.name)
    if (e.isDirectory()) await copyMissing(src, dst)
    else if (!existsSync(dst)) await writeFile(dst, await readFile(src))
  }
}

/** script.json as saved, or null if it's missing or not valid JSON. */
async function readScriptFile(dir: string): Promise<PitchScript | null> {
  const raw = await readFile(join(dir, SCRIPT_FILE), 'utf8').catch(() => undefined)
  try {
    return raw === undefined ? null : parseScript(JSON.parse(raw))
  } catch {
    return null
  }
}

/** ElevenLabs errors come as { detail: { message } } or { detail: "…" }. */
async function elevenError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { detail?: { message?: string; status?: string } | string } | null
  const detail = typeof body?.detail === 'string' ? body.detail : body?.detail?.message
  if (res.status === 401) return `ElevenLabs rejected the API key${detail ? `: ${detail}` : ''}`
  if (res.status === 402 || res.status === 429) return `ElevenLabs quota or rate limit reached${detail ? `: ${detail}` : ''}`
  return `ElevenLabs error ${res.status}${detail ? `: ${detail}` : ''}`
}

/** A request to ElevenLabs whose network failures say what happened ("fetch failed" doesn't). */
async function callEleven(f: typeof fetch, url: string, init: RequestInit & { signal: AbortSignal }, timeoutSec: number): Promise<Response> {
  try {
    return await f(url, init)
  } catch (e) {
    const err = e as Error & { cause?: { code?: string; message?: string } }
    if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`ElevenLabs didn't answer within ${timeoutSec} s. Try again.`)
    const why = err.cause?.code ?? err.cause?.message ?? err.message
    throw new Error(`Couldn't reach ElevenLabs (${why}). Check the internet connection.`)
  }
}

function defaultInstall(cwd: string, onLine: (l: string) => void): Promise<number> {
  return new Promise((resolve) => {
    const p = spawnTool('npm', ['install', '--no-audit', '--no-fund'], { cwd, env: process.env })
    const feed = (d: Buffer) => d.toString().split(/\r?\n/).filter(Boolean).forEach(onLine)
    p.stdout?.on('data', feed)
    p.stderr?.on('data', feed)
    p.on('error', (e) => {
      onLine(e.message)
      resolve(1)
    })
    p.on('close', (code) => resolve(code ?? 1))
  })
}

/**
 * Pitch studio backend: the pitch/ Remotion project inside the event project — scaffolding from the
 * template, script.json, npm install, and ElevenLabs narration per scene (cached by content hash).
 */
export class PitchService {
  private job?: PitchJob
  private watcher: FSWatcher | null = null
  private watched?: string
  private timer?: NodeJS.Timeout

  constructor(private readonly deps: PitchDeps) {}

  private pitchDir(): string | undefined {
    const p = this.deps.projectDir()
    return p ? join(p, PITCH_DIR) : undefined
  }

  private requireDir(): string {
    const d = this.pitchDir()
    if (!d) throw new Error('Link an event project first.')
    return d
  }

  async state(): Promise<PitchState> {
    const dir = this.pitchDir()
    this.ensureWatch(dir)
    if (!dir) return { exists: false, installed: false, script: null, media: [], job: this.job }
    const exists = existsSync(join(dir, 'package.json'))
    let script: PitchScript | null = null
    let scriptError: string | undefined
    const raw = await readFile(join(dir, SCRIPT_FILE), 'utf8').catch(() => undefined)
    if (raw !== undefined) {
      try {
        script = parseScript(JSON.parse(raw))
      } catch (e) {
        scriptError = `script.json isn't valid JSON (${e instanceof Error ? e.message : e}). Fix it or save from the editor to replace it.`
      }
    }
    const media = (await readdir(join(dir, 'public'), { recursive: true }).catch(() => [] as string[]))
      .map((f) => String(f).replace(/\\/g, '/'))
      .filter((f) => MEDIA_RE.test(f) && !f.startsWith('audio/'))
      .sort()
    return { dir, exists, installed: existsSync(join(dir, 'node_modules', 'remotion')), script, scriptError, media, job: this.job }
  }

  private async publish() {
    this.deps.push(await this.state())
  }

  async scaffold(eventName: string): Promise<PitchState> {
    const dir = this.requireDir()
    await copyMissing(this.deps.templateDir, dir)
    // Packaging can drop dotfiles from the template; this one keeps node_modules out of the team's repo.
    if (!existsSync(join(dir, '.gitignore'))) await writeFile(join(dir, '.gitignore'), 'node_modules/\nout/\n')
    await mkdir(join(dir, 'public', 'audio'), { recursive: true })
    if (!existsSync(join(dir, SCRIPT_FILE))) await this.writeScript(dir, defaultScript(eventName))
    return this.state()
  }

  private writeScript(dir: string, script: PitchScript) {
    return writeFile(join(dir, SCRIPT_FILE), JSON.stringify(script, null, 2) + '\n')
  }

  async saveScript(script: PitchScript): Promise<PitchState> {
    const dir = this.requireDir()
    const clean = parseScript(script)
    if (!clean) throw new Error('Invalid script')
    // The editor's draft predates any narration attached while it was being edited; keep those takes.
    const onDisk = await readScriptFile(dir)
    for (const scene of clean.scenes) {
      const disk = onDisk?.scenes.find((s) => s.id === scene.id)
      if (disk?.audio && audioState(scene, clean.voiceId) !== 'fresh' && audioState({ ...disk, narration: scene.narration }, clean.voiceId) === 'fresh') {
        Object.assign(scene, { audio: disk.audio, audioHash: disk.audioHash, audioSeconds: disk.audioSeconds })
      }
    }
    await mkdir(dir, { recursive: true })
    await this.writeScript(dir, clean)
    return this.state()
  }

  async install(): Promise<PitchState> {
    const dir = this.requireDir()
    if (this.job?.status === 'running') throw new Error('Another pitch job is still running.')
    this.job = { kind: 'install', status: 'running', message: 'npm install…' }
    void this.publish()
    let last = ''
    void (this.deps.runInstall ?? defaultInstall)(dir, (line) => {
      last = line.slice(0, 200)
      this.job = { kind: 'install', status: 'running', message: last }
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.publish(), 200)
    }).then((code) => {
      this.job =
        code === 0
          ? { kind: 'install', status: 'done', message: 'Remotion is installed.' }
          : { kind: 'install', status: 'error', message: `npm install failed (exit ${code})${last ? `: ${last}` : ''}` }
      void this.publish()
    })
    return this.state()
  }

  async voices(): Promise<Voice[]> {
    const key = this.deps.elevenLabsKey()
    if (!key) throw new Error('Add your ElevenLabs API key first.')
    const res = await callEleven(this.deps.fetch ?? fetch, `${ELEVEN}/voices`, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(15_000) }, 15)
    if (!res.ok) throw new Error(await elevenError(res))
    const body = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[] }
    return (body.voices ?? []).map((v) => ({
      id: v.voice_id,
      name: v.name,
      description: [v.labels?.gender, v.labels?.accent, v.labels?.description ?? v.labels?.use_case, v.category].filter(Boolean).join(' · ') || undefined,
    }))
  }

  /**
   * Narrates every scene whose audio is missing or out of date. Files are named by content hash, so
   * an unchanged scene reuses its file (no new ElevenLabs charge), even after a script rewrite.
   */
  async narrate(): Promise<PitchState> {
    const dir = this.requireDir()
    const key = this.deps.elevenLabsKey()
    if (!key) throw new Error('Add your ElevenLabs API key first (Pitch → Voice).')
    if (this.job?.status === 'running') throw new Error('Another pitch job is still running.')
    // Claim the job before the first await, so a double click can't start (and pay for) two runs.
    const before = this.job
    this.job = { kind: 'narrate', status: 'running', message: 'Checking the script…' }
    const script = await this.state().then(
      (st) => st.script,
      () => null,
    )
    if (!script?.voiceId) {
      this.job = before
      throw new Error(script ? 'Pick a narrator voice first.' : 'No script.json yet.')
    }
    const todo = script.scenes.filter((s) => audioState(s, script.voiceId) === 'none' || audioState(s, script.voiceId) === 'stale')
    if (todo.length === 0) {
      this.job = { kind: 'narrate', status: 'done', message: 'All narration is up to date.' }
      return this.state()
    }
    this.job = { kind: 'narrate', status: 'running', message: `Narrating ${todo.length} scene${todo.length > 1 ? 's' : ''}…`, done: 0, total: todo.length }
    void this.publish()
    void this.runNarration(dir, key, script.voiceId, todo.map((s) => ({ id: s.id, text: s.narration, title: s.title })))
    return this.state()
  }

  private async runNarration(dir: string, key: string, voiceId: string, todo: { id: string; text: string; title: string }[]) {
    const f = this.deps.fetch ?? fetch
    let done = 0
    try {
      for (const t of todo) {
        const hash = narrationHash(t.text, voiceId)
        const rel = `audio/${t.id}-${hash}.mp3`
        const abs = join(dir, 'public', rel)
        if (!existsSync(abs)) {
          this.job = { kind: 'narrate', status: 'running', message: `Narrating “${t.title || t.id}”…`, done, total: todo.length }
          void this.publish()
          const res = await callEleven(
            f,
            `${ELEVEN}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
              method: 'POST',
              headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
              body: JSON.stringify({ text: t.text.trim(), model_id: TTS_MODEL }),
              signal: AbortSignal.timeout(90_000),
            },
            90,
          )
          if (!res.ok) throw new Error(await elevenError(res))
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length < 512) throw new Error(`ElevenLabs returned no audio for “${t.title || t.id}”.`)
          await mkdir(dirname(abs), { recursive: true })
          await writeFile(abs, buf)
        }
        await this.attachAudio(dir, t.id, hash, rel, mp3Seconds((await stat(abs)).size))
        done++
      }
      this.job = { kind: 'narrate', status: 'done', message: `Narration ready (${done} scene${done === 1 ? '' : 's'}).`, done, total: todo.length }
    } catch (e) {
      this.job = { kind: 'narrate', status: 'error', message: e instanceof Error ? e.message : String(e), done, total: todo.length }
    }
    void this.publish()
  }

  /** Re-reads script.json and updates only that scene's audio fields, so edits made meanwhile survive. */
  private async attachAudio(dir: string, sceneId: string, hash: string, rel: string, seconds: number) {
    const raw = await readFile(join(dir, SCRIPT_FILE), 'utf8')
    const script = parseScript(JSON.parse(raw))
    const scene = script?.scenes.find((s) => s.id === sceneId)
    if (!script || !scene) return
    if (narrationHash(scene.narration, script.voiceId) !== hash) return // text changed meanwhile; leave it stale
    const old = scene.audio
    scene.audio = rel
    scene.audioHash = hash
    scene.audioSeconds = Math.round(seconds * 100) / 100
    await this.writeScript(dir, script)
    // Remove this scene's previous take (other scenes' files and hand-added audio stay).
    if (old && old !== rel && old.startsWith(`audio/${sceneId}-`)) await rm(join(dir, 'public', old), { force: true })
  }

  private ensureWatch(dir: string | undefined) {
    if (dir === this.watched) return
    this.watcher?.close()
    this.watcher = null
    this.watched = dir
    const root = this.deps.projectDir()
    if (!dir || !root) return
    try {
      // Watch the project so pitch/ appearing later (or a git pull) is noticed.
      this.watcher = watch(root, { recursive: true }, (_e, file) => {
        const f = file ? relative(PITCH_DIR, String(file)).replace(/\\/g, '/') : ''
        if (!file || String(file).replace(/\\/g, '/').split('/')[0] !== PITCH_DIR) return
        if (f.startsWith('node_modules') || f.startsWith('out/') || f.startsWith('.')) return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => void this.publish(), 250)
      })
      this.watcher.on('error', () => this.watcher?.close())
    } catch {
      this.watcher = null
    }
  }

  dispose() {
    clearTimeout(this.timer)
    this.watcher?.close()
  }
}
