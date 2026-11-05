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
      scene('title', 'Project name', 'Everyone accepts that this is how it works. We asked what happens if it doesn’t have to be.'),
      scene('bullets', 'The model we inherited', 'Today, people lose hours to this. It is slow, expensive, and nobody questions it.', {
        bullets: ['Who suffers today', 'What it costs', 'Why nobody fixed it'],
      }),
      scene('quote', 'Our flip', 'So we flipped it. Instead of this, we do that, and the whole thing changes.'),
      scene('screen', 'Live demo', 'Here it is working. Watch what happens when a real user does this.', { media: 'demo.mp4', seconds: 25 }),
      scene('bullets', 'How it works', "Under the hood it runs on our partner's platform, so it is fast and ready to scale.", {
        bullets: ['Partner technology we use', 'What is real today', 'What comes next'],
      }),
      scene('bullets', 'Why it matters', 'If this works, this many people get this much better, starting with the first team that tries it.', {
        bullets: ['Impact, in numbers', 'Who adopts it first'],
      }),
      scene('end', 'Project name', 'We are the team. Try it at our table, and thank you.'),
    ],
  }
}

export function writeScriptPrompt(targetSeconds: number): string {
  return `Write our hackathon pitch video script into ${PITCH_DIR}/${SCRIPT_FILE} (keep its JSON shape, voiceId, voiceName and accent; replace title, tagline and scenes). Read .hackforge/ (DECISION.md, PLAN.md, DEMO.md, VERIFY.md, STATE.md), challenge/brief/ and the README for what we actually built. Only claim what really works.

Structure (the arc that wins on stage): the model everyone inherited → our flip (one sentence) → live demo → how it works (the partner technology it runs on) → why it matters (impact in numbers) → end card. Tie it to the event's theme (challenge/event.yaml) where it fits naturally.

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
  /** What kind of video the team chose (pitch/style.json); null until they answer. */
  choice: PitchChoice | null
  /** Finished videos in pitch/out/, newest first (file names). */
  videos: string[]
  /** The cartoon short skill, downloaded when the team picks Cartoon. */
  cartoon: CartoonSkillState
}

export interface CartoonSkillState {
  status: 'missing' | 'installing' | 'ready' | 'error'
  error?: string
}

export interface Voice {
  id: string
  name: string
  description?: string
}

// ---------- what kind of video (or none) ----------

export const STYLE_FILE = 'style.json'
/** Finished videos made outside the slide video (cartoon, something else) go here. */
export const VIDEO_OUT_DIR = 'out'
export const PITCH_STYLES = ['slides', '3d', 'cartoon', 'custom', 'none'] as const
export type PitchStyle = (typeof PITCH_STYLES)[number]
export type VideoFormat = 'vertical' | 'horizontal'

/** The team's answer to "Do you want a pitch or promo video?" (pitch/style.json, shared through git). */
export interface PitchChoice {
  style: PitchStyle
  /** "Something else": what the team described. */
  brief?: string
  /** Cartoon: 9:16 or 16:9. */
  format?: VideoFormat
  at: number
}

export function parseChoice(raw: unknown): PitchChoice | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!PITCH_STYLES.includes(o.style as PitchStyle)) return null
  const brief = typeof o.brief === 'string' && o.brief.trim() ? o.brief.trim().slice(0, 2000) : undefined
  const format = o.format === 'vertical' || o.format === 'horizontal' ? o.format : undefined
  return { style: o.style as PitchStyle, ...(brief ? { brief } : {}), ...(format ? { format } : {}), at: typeof o.at === 'number' ? o.at : 0 }
}

/** The three ready-made kinds of video the chooser offers (thumbnails live in the renderer's assets). */
export const PITCH_TEMPLATES: { style: 'slides' | '3d' | 'cartoon'; title: string; line: string; needs: string; time: string }[] = [
  {
    style: 'slides',
    title: 'Narrated slides',
    line: 'Title, problem, your flip, the live demo and the end card, narrated scene by scene. You edit every line here.',
    needs: 'Node',
    time: 'About 20 min',
  },
  {
    style: '3d',
    title: '3D video',
    line: 'The narrated video with 3D shots: your real app driven by a 3D cursor, a laptop or phone, problem cards, a logo sting.',
    needs: 'Node, Python 3.10+, ffmpeg, Chrome',
    time: 'About 1 h',
  },
  {
    style: 'cartoon',
    title: 'Cartoon short',
    line: 'A ~60 s cartoon story about the problem you solve: 2D characters in a colourful 3D world, with voice, music and sound.',
    needs: 'Node, Python 3, ffmpeg; about 2 GB free',
    time: 'A few hours',
  },
]

export function threeDVideoPrompt(targetSeconds: number): string {
  return `Make our pitch video a 3D video (≈ ${targetSeconds} s) with HackForge's 3D pitch kit in video/kit3d/ (read its README), building on ${PITCH_DIR}/${SCRIPT_FILE}.

1. If the script is still the starter script, write it first: read .hackforge/ (DECISION.md, PLAN.md, DEMO.md, VERIFY.md) and challenge/ for what we actually built, and only claim what really works.
2. Pick 3D hero shots for the scenes that gain from them: the problem as cards, the real app driven by the 3D cursor (or on a laptop or phone) for the demo, and a logo sting for the end. A talking character film only if the product has an AI assistant.
3. Add each clip to video/kit3d/story.py, render stills to check the look, then the final, and put each MP4 in ${PITCH_DIR}/public/3d/. Point the matching scenes at them ("visual": "screen", "media": "3d/<clip>.mp4", "seconds": <clip length>); change only visual, media and seconds, never audio, audioSeconds or audioHash.
4. Keep the narration in the script; Harness narrates, previews and renders it.`
}

export function cartoonPrompt(format: VideoFormat): string {
  const size =
    format === 'vertical'
      ? 'vertical 9:16 (1080x1920, final 1440x2560)'
      : 'horizontal 16:9 (1920x1080, final 2560x1440); adapt the shot plan and camera framing to the wider frame'
  return `Use the cartoon-3d-short skill to make a cartoon promo short for this hackathon project: ${size}, 55-70 s.

- The story is about the problem our product solves, told with our OWN characters, story and voice: a relatable character runs into the problem, it escalates, then our product changes it, and the ending lands on what it makes possible. Read .hackforge/ (DECISION.md, PLAN.md, DEMO.md), challenge/ and the README so every claim is true. The product's name can be said, but there are no captions or labels in the video.
- Build it as its own Remotion project in video/cartoon/ (copy the skill's templates/bridge as it says), not in ${PITCH_DIR}/.
- Write the script first and show it to me before rendering anything heavy. Then follow the skill's pipeline: voice, shot plan, stills, look checks, the final render and the sound mix.
- Set REMOTION_TMP, TEMP and TMP to a folder outside the project (Remotion copies public/ into it on every bundle) and clean it up when you're done.
- Copy the final video to ${PITCH_DIR}/${VIDEO_OUT_DIR}/cartoon-short.mp4 so it shows up on Harness's Pitch tab.
- Never upload, publish or send the skill's reference frames.`
}

export function customVideoPrompt(brief: string, targetSeconds: number): string {
  return `Make our pitch or promo video. What the team wants:

${brief.trim()}

- Read .hackforge/ (DECISION.md, PLAN.md, DEMO.md, VERIFY.md), challenge/ and the README for what we actually built, and only claim what really works. Check challenge/brief/ for the rules (length, format, whether generated media is allowed).
- Aim for about ${targetSeconds} s unless the description says otherwise. Plan it first (a short storyboard) and show it to me before rendering anything heavy.
- Use HackForge's video skill and its 3D pitch kit where they fit. If ${PITCH_DIR}/${SCRIPT_FILE} exists, build on it; otherwise build the video in its own folder under video/.
- Copy the finished video to ${PITCH_DIR}/${VIDEO_OUT_DIR}/ so it shows up on Harness's Pitch tab.`
}

export function videoChangePrompt(text: string, file?: string): string {
  return `Change our ${file ? `video ${PITCH_DIR}/${VIDEO_OUT_DIR}/${file}` : 'pitch video'}: ${text.trim()}

Work in the video's own project (video/ or ${PITCH_DIR}/), render it again, and copy the new version over the old one in ${PITCH_DIR}/${VIDEO_OUT_DIR}/.`
}
