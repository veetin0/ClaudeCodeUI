/**
 * Pitch studio: a narrated demo video as data. `pitch/script.json` drives a Remotion project
 * (pitch/), ElevenLabs narrates each scene, and Harness edits, times and rehearses it.
 */

export const PITCH_DIR = 'pitch'
export const SCRIPT_FILE = 'script.json'
export const VISUALS = ['title', 'bullets', 'quote', 'screen', 'end'] as const
export type Visual = (typeof VISUALS)[number]

export interface PitchScene {
  id: string
  /** Shown on screen (headline). */
  title: string
  /** Spoken by the narrator. */
  narration: string
  visual: Visual
  bullets?: string[]
  /** For 'screen': a video or image in pitch/public/, e.g. "demo.mp4". */
  media?: string
  /** Minimum length in seconds (e.g. to let a demo clip play). */
  seconds?: number
  /** Generated narration, relative to pitch/public/. */
  audio?: string
  audioSeconds?: number
  /** Hash of the narration settings the audio was made from. */
  audioHash?: string
}

export interface PitchScript {
  title: string
  tagline?: string
  team?: string
  /** Time limit for the video. */
  targetSeconds: number
  voiceId?: string
  voiceName?: string
  /** Brand colour (CSS). */
  accent?: string
  scenes: PitchScene[]
}

export const TTS_MODEL = 'eleven_multilingual_v2'
/** ~155 words per minute: calm, clear pitch delivery. */
const WORDS_PER_SECOND = 2.6
/** Breathing room after each scene. */
export const SCENE_GAP = 0.6

export function words(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function estimateSeconds(text: string): number {
  const w = words(text)
  return w ? w / WORDS_PER_SECOND + 0.4 : 0
}

/** Seconds a scene lasts in the video (same rule as the Remotion template). */
export function sceneSeconds(s: PitchScene, voiceId?: string): number {
  const fresh = s.audio && s.audioSeconds && s.audioHash === narrationHash(s.narration, voiceId)
  const spoken = fresh ? s.audioSeconds! : estimateSeconds(s.narration)
  return Math.max(s.seconds ?? 0, spoken, 2) + SCENE_GAP
}

export function totalSeconds(script: PitchScript): number {
  return script.scenes.reduce((t, s) => t + sceneSeconds(s, script.voiceId), 0)
}

/** FNV-1a over the things that change the audio, so unchanged scenes aren't re-generated (and re-billed). */
export function narrationHash(text: string, voiceId = '', model = TTS_MODEL): string {
  let h = 0x811c9dc5
  for (const ch of `${model}|${voiceId}|${text.trim()}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export type AudioState = 'none' | 'fresh' | 'stale' | 'silent'
export function audioState(s: PitchScene, voiceId?: string): AudioState {
  if (!s.narration.trim()) return 'silent'
  if (!s.audio) return 'none'
  return s.audioHash === narrationHash(s.narration, voiceId) ? 'fresh' : 'stale'
}

/** Duration of a constant-bitrate MP3 (ElevenLabs' mp3_44100_128): bytes ÷ 16 000. */
export const mp3Seconds = (bytes: number, kbps = 128) => bytes / ((kbps * 1000) / 8)

let counter = 0
export const newSceneId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`

/** A path inside pitch/public/: no leading slash, no "." or ".." segments, no backslashes. */
export function safeRelPath(p: string | undefined): string | undefined {
  if (!p) return undefined
  const clean = p
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
  return clean || undefined
}

/** ElevenLabs' per-request limit for eleven_multilingual_v2; anything longer couldn't be narrated anyway. */
export const MAX_NARRATION_CHARS = 10_000
const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)

/** Reads script.json; anything malformed is dropped or defaulted so the editor and video still work. */
export function parseScript(json: unknown): PitchScript | null {
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  const raw = (Array.isArray(o.scenes) ? o.scenes : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
  // Ids must come out the same on every read: narration files are named by id and re-attached by
  // id after the request. Missing or repeated ids get "scene-N" / "-2"; ids in the file win.
  const given = raw.map((r) => str(r.id, 40)?.replace(/[^\w-]/g, '') || '')
  const taken = new Set(given.filter(Boolean))
  const seen = new Set<string>()
  const scenes = raw.map((r, i): PitchScene => {
    const base = given[i] || `scene-${i + 1}`
    let id = base
    for (let n = 2; seen.has(id) || (!given[i] && taken.has(id)); n++) id = `${base}-${n}`
    seen.add(id)
    const visual = VISUALS.includes(r.visual as Visual) ? (r.visual as Visual) : 'title'
    return {
      id,
      title: str(r.title, 200) ?? '',
      // Not the 2000 default: a long scene's text must survive a save untouched.
      narration: str(r.narration, MAX_NARRATION_CHARS) ?? '',
      visual,
      bullets: Array.isArray(r.bullets) ? r.bullets.map((b) => str(b, 200)).filter((b): b is string => !!b).slice(0, 8) : undefined,
      media: safeRelPath(str(r.media, 200)),
      seconds: num(r.seconds),
      audio: safeRelPath(str(r.audio, 200)),
      audioSeconds: num(r.audioSeconds),
      audioHash: str(r.audioHash, 16) || undefined,
    }
  })
  return {
    title: str(o.title, 200) ?? 'Our project',
    tagline: str(o.tagline, 300) || undefined,
    team: str(o.team, 200) || undefined,
    targetSeconds: num(o.targetSeconds) || 120,
    voiceId: str(o.voiceId, 64) || undefined,
    voiceName: str(o.voiceName, 100) || undefined,
    accent: str(o.accent, 40) || undefined,
    scenes,
  }
}

/** The arc that works on a hackathon stage: inherited model → our flip → live proof → why it matters. */
export function defaultScript(eventName: string): PitchScript {
  const scene = (visual: Visual, title: string, narration: string, extra: Partial<PitchScene> = {}): PitchScene => ({ id: newSceneId(), visual, title, narration, ...extra })
  return {
    title: 'Project name',
    tagline: 'One line: what it does and for whom',
    team: `Built at ${eventName}`,
    targetSeconds: 120,
    accent: '#d97757',
    scenes: [
      scene('title', 'Project name', 'Everyone accepts that this is how it works. We asked what happens if the center moves.'),
      scene('bullets', 'The model we inherited', 'Today, people lose hours to this. It is slow, expensive, and nobody questions it.', {
        bullets: ['Who suffers today', 'What it costs', 'Why nobody fixed it'],
      }),
      scene('quote', 'Our flip', 'So we flipped it. Instead of this, we do that, and the whole thing changes.'),
      scene('screen', 'Live demo', 'Here it is working. Watch what happens when a real user does this.', { media: 'demo.mp4', seconds: 25 }),
      scene('bullets', 'How it works', "Under the hood it runs on our partner's platform, so it is fast and ready to scale.", {
        bullets: ['Partner technology we use', 'What is real today', 'What comes next'],
      }),
      scene('bullets', 'Why it matters', 'If this works, this many people get this much better. That is the center of gravity moving.', {
        bullets: ['Impact, in numbers', 'Who adopts it first'],
      }),
      scene('end', 'Project name', 'We are the team. Try it at our table, and thank you.'),
    ],
  }
}

export function writeScriptPrompt(targetSeconds: number): string {
  return `Write our hackathon pitch video script into ${PITCH_DIR}/${SCRIPT_FILE} (keep its JSON shape, voiceId, voiceName and accent; replace title, tagline and scenes). Read .hackforge/ (DECISION.md, PLAN.md, DEMO.md, VERIFY.md, STATE.md), challenge/brief/ and the README for what we actually built. Only claim what really works.

Structure (the arc that wins on stage): the model everyone inherited → our flip (one sentence) → live demo → how it works (the partner technology it runs on) → why it matters (impact in numbers) → end card. The event theme is "European Tech Renaissance: who moves the center of gravity?".

Rules:
- Total spoken length ≈ ${Math.round(targetSeconds * 0.85)} s at ~155 words per minute (about ${Math.round(targetSeconds * 0.85 * 2.6)} words across all narration), leaving room for the demo clip.
- Each scene: { "id", "title" (≤ 6 words, on screen), "narration" (spoken, plain sentences, no markdown), "visual": "title" | "bullets" | "quote" | "screen" | "end", "bullets" (≤ 4 short items, for "bullets"), "media" (file in pitch/public/, for "screen"), "seconds" (minimum length, e.g. for a demo clip) }.
- Keep existing scene ids where a scene keeps its role, so narration that hasn't changed isn't regenerated.
- Don't touch anything outside ${PITCH_DIR}/${SCRIPT_FILE}.`
}

export interface PitchJob {
  kind: 'install' | 'narrate'
  status: 'running' | 'done' | 'error'
  message: string
  done?: number
  total?: number
}

export interface PitchState {
  /** Absolute path of pitch/ (when an event project is linked). */
  dir?: string
  exists: boolean
  installed: boolean
  script: PitchScript | null
  scriptError?: string
  /** Videos and images in pitch/public/ (for "screen" scenes). */
  media: string[]
  job?: PitchJob
}

export interface Voice {
  id: string
  name: string
  description?: string
}
