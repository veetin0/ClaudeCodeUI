// Keep in sync with Harness (src/shared/pitch.ts): the editor and the video must agree on timing.
export type Visual = 'title' | 'bullets' | 'quote' | 'screen' | 'end'

export interface Scene {
  id: string
  title: string
  narration: string
  visual: Visual
  bullets?: string[]
  media?: string
  seconds?: number
  audio?: string
  audioSeconds?: number
  audioHash?: string
}

export interface Script {
  title: string
  tagline?: string
  team?: string
  targetSeconds: number
  voiceId?: string
  accent?: string
  scenes: Scene[]
}

export const FPS = 30
const MODEL = 'eleven_multilingual_v2'
const GAP = 0.6

export function narrationHash(text: string, voiceId = '', model = MODEL): string {
  let h = 0x811c9dc5
  for (const ch of `${model}|${voiceId}|${text.trim()}`) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const estimate = (text: string) => {
  const w = text.trim() ? text.trim().split(/\s+/).length : 0
  return w ? w / 2.6 + 0.4 : 0
}

/** Narration that still matches the scene's text and voice. */
export const freshAudio = (s: Scene, voiceId?: string) =>
  s.audio && s.audioSeconds && s.audioHash === narrationHash(s.narration, voiceId) ? s.audio : undefined

export function sceneFrames(s: Scene, voiceId?: string): number {
  const spoken = freshAudio(s, voiceId) ? s.audioSeconds! : estimate(s.narration)
  return Math.round((Math.max(s.seconds ?? 0, spoken, 2) + GAP) * FPS)
}
