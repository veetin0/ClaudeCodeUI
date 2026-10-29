/**
 * 3D clips in the Pitch studio: HackForge's 3D pitch kit (skills/video/kit3d) copied into the event
 * project's video/kit3d/. Claude writes each clip into its story.py; Harness sets the kit up, renders
 * stills and the clip with progress, and puts the MP4 into pitch/public/3d/ as a screen scene.
 */

/** Where the kit lives in the event project (the same place /hackforge:video uses). */
export const KIT3D_DIR = 'video/kit3d'
/** Where finished clips go in the pitch (pitch/public/<this>/<clip>.mp4). */
export const KIT3D_PITCH_DIR = '3d'

export const KIT3D_TYPES = [
  { id: 'app', label: 'App walkthrough', hint: 'Your real app fills the frame; a 3D cursor clicks and types through it.' },
  { id: 'laptop', label: 'Laptop', hint: 'A laptop opens, its screen wakes, and the cursor uses your app on it.' },
  { id: 'phone', label: 'Phone', hint: 'A phone floats in showing your app (captured at a phone size).' },
  { id: 'product', label: 'Product', hint: 'A physical product turns on a pedestal, explodes into its parts, with labels.' },
  { id: 'cards', label: 'Problem cards', hint: 'The problem pops up as 3D cards, then gets swept away.' },
  { id: 'logo', label: 'Logo sting', hint: 'The tile rises, the mark shines, then the name and tagline.' },
  { id: 'film', label: 'Mascot film', hint: 'Your character says hello, jumps into the app and uses it, then becomes the logo.' },
] as const
export type Kit3dType = (typeof KIT3D_TYPES)[number]['id']

/** Draft: quick to check the pacing. Final: what goes in the pitch. */
export const KIT3D_QUALITY = {
  draft: { w: 960, h: 540, sub: 2, label: 'Draft (540p)' },
  final: { w: 1920, h: 1080, sub: 5, label: 'Final (1080p)' },
} as const
export type Kit3dQuality = keyof typeof KIT3D_QUALITY

export interface Kit3dRequirement {
  id: 'python' | 'ffmpeg' | 'browser' | 'npm'
  ok: boolean
  /** What was found (a version or a path). */
  found?: string
  /** How to get it when it's missing. */
  hint: string
}

export interface Kit3dClip {
  name: string
  /** The clip function's one-line description. */
  doc: string
  /** From build/<clip>/timeline.json once it has been built. */
  seconds?: number
  frames?: number
  uses?: string[]
  /** It speaks (the mascot film): rendered with its own voice and music instead of effects only. */
  talks?: boolean
  /** Absolute paths of the latest stills. */
  stills: string[]
  video?: { path: string; quality: Kit3dQuality; seconds?: number; mtime: number }
  /** Its copy in pitch/public/3d/: none, the same as the latest render, or older. */
  pitch: 'none' | 'current' | 'stale'
}

export interface Kit3dJob {
  kind: 'setup' | 'capture' | 'stills' | 'render'
  clip?: string
  quality?: Kit3dQuality
  status: 'running' | 'done' | 'error' | 'cancelled'
  /** The step, or the last line of output. */
  message: string
  done?: number
  total?: number
  etaSeconds?: number
}

export interface Kit3dState {
  /** Absolute path of video/kit3d (when an event project is linked). */
  dir?: string
  exists: boolean
  /** Node packages and the Python environment are installed. */
  ready: boolean
  requirements: Kit3dRequirement[]
  clips: Kit3dClip[]
  listError?: string
  job?: Kit3dJob
}

const TYPE_GUIDE: Record<Kit3dType, string> = {
  app: "an `app` clip: `f.app(navigator='cursor')`, then `f.go(...)` beats on the real screens (type, press; every press changes the screen), `f.shot(...)` for the camera, `f.end(seconds, fade=0)`.",
  laptop: "a `device` clip on a laptop: `f.device('laptop', open=(0.2, 1.3))`, `f.app(navigator='cursor', mode='device')`, `f.power(t)`, `device_hero` / `device_front` shots, then `f.go(...)` beats.",
  phone:
    "a `device` clip on a phone: `f.device('phone', open=(0.2, 1.0))`, `f.app(navigator='cursor', mode='device')`; capture the app at a phone viewport (`export const viewport = [390, 844]` in ui_states.mjs).",
  product:
    'a `product` clip: `f.product(model=..., explode=(t0, t1), callouts=[(t, part, text), ...])` with a `product_orbit` shot. Use a .glb from the project (assets/ or challenge/assets/) with named top-level parts if there is one; otherwise the demo model as a stand-in, and say so.',
  cards: 'a `cards` clip: `f.card_beat([...], t0, every=..., out=...)` with the real problem in 3-5 short card texts (from the pitch script or BRIEF.md), and a `studio_mid` shot.',
  logo: "a `logo` clip: `f.logo(at=0.2)`, with LOGO's colours, wordmark and tagline from the brand (and `icon` set to the app's icon if there is one).",
  film: 'the character film: `f.app(navigator=\'hero\')`, `f.intro()`, `f.enter(...)`, `f.go(...)` beats, `f.outro(...)`; the character in scene/character.js, its LINES and PROBLEM in story.py (see the mascot skill if there is no character yet).',
}

/** The prompt Harness sends Claude to write a new clip into the kit's story.py. */
export function kit3dClipPrompt(type: Kit3dType, description: string): string {
  return `Add a new 3D clip to ${KIT3D_DIR}/story.py (HackForge's 3D pitch kit; read its README.md and film.py's docstrings first).

What it should show: ${description.trim() || 'pick what fits the pitch best'}
Kind: ${TYPE_GUIDE[type]}

How:
- Write it as a new function in story.py with a one-line docstring saying what it shows, and add it to CLIPS. Give it a short snake_case name. Don't change the other clips.
- Brand: set APP, LOGO (tile colours, wordmark, tagline, the app's icon as \`icon\`) and SET from the project (DESIGN.md, pitch/script.json's accent, the app's own colours) if they still hold the kit's example values.
- If it shows the app: point ui_states.mjs at the running app (start it if needed), list the screens and targets the clip uses, and run \`node capture_ui.mjs\` in ${KIT3D_DIR}. Check build/ui/ looks right.
- Keep it short: 4-10 s for a clip that goes into the narrated pitch, ending with \`f.end(seconds, fade=0)\`.
- Check it with \`python3 story.py <name>\` in ${KIT3D_DIR} (use .venv/bin/python3 if it exists) and fix what it reports.
- Don't render frames: Harness renders it (Hackathon › Pitch → 3D clips) once you're done. Tell me the clip's name.`
}

/** The prompt for changing an existing clip. */
export function kit3dChangePrompt(clip: string, change: string): string {
  return `In ${KIT3D_DIR}/story.py (HackForge's 3D pitch kit), change the clip \`${clip}\`: ${change.trim()}

Keep its name. Check it with \`python3 story.py ${clip}\` in ${KIT3D_DIR} (use .venv/bin/python3 if it exists) and fix what it reports. If it needs new app screens, update ui_states.mjs and run \`node capture_ui.mjs\`. Don't render frames: Harness renders it from Hackathon › Pitch.`
}

/** "product_hero" → "Product hero". */
export function clipTitle(name: string): string {
  const t = name.replace(/[_-]+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : name
}
