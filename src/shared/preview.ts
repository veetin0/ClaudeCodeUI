/** Preview: Remotion Studio, dev servers and renders. Shared types plus pure output parsers. */

export interface ProjectInfo {
  cwd: string
  remotion: boolean
  remotionVersion?: string
  /** package.json scripts that look like dev servers (dev, start, storybook, preview…). */
  devScripts: { name: string; command: string }[]
  /** 3D models (.glb, .gltf) in the project, absolute paths, for the 3D viewer. */
  models?: string[]
}

export interface PreviewServer {
  id: string
  cwd: string
  kind: 'remotion' | 'script'
  label: string
  url?: string
  status: 'starting' | 'ready' | 'exited' | 'error'
  /** Last lines of output, ANSI stripped. */
  log: string[]
  startedAt: number
}

export interface Composition {
  id: string
  fps: number
  width: number
  height: number
  durationInFrames: number
}

export interface RenderProgress {
  phase: 'bundling' | 'rendering' | 'encoding'
  current: number
  total: number
  etaText?: string
}

export interface RenderJob {
  id: string
  cwd: string
  composition: string
  /** Absolute output path. */
  output: string
  status: 'running' | 'done' | 'error' | 'cancelled'
  progress?: RenderProgress
  error?: string
  startedAt: number
  endedAt?: number
}

export interface DetectedUrl {
  url: string
  cwd?: string
  source: 'command' | 'terminal'
  ts: number
}

export interface PreviewState {
  servers: PreviewServer[]
  renders: RenderJob[]
  detected: DetectedUrl[]
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g
export const stripAnsi = (s: string) => s.replace(ANSI, '')

const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s'"`<>)\]]*)?/g

/** Local dev-server URLs mentioned in output, normalised to localhost, without trailing punctuation. */
export function findLocalUrls(text: string): string[] {
  const urls = (stripAnsi(text).match(LOCAL_URL) ?? []).map((u) => u.replace(/0\.0\.0\.0|\[::1\]|127\.0\.0\.1/, 'localhost').replace(/[.,;:]+$/, ''))
  return [...new Set(urls)]
}

/** Latest progress in a chunk of `remotion render` output. */
export function parseRenderProgress(text: string): RenderProgress | null {
  let last: RenderProgress | null = null
  for (const line of stripAnsi(text).split(/[\r\n]+/)) {
    let m = /Bundling (\d+)%/.exec(line)
    if (m) last = { phase: 'bundling', current: Number(m[1]), total: 100 }
    m = /Rendered (\d+)\/(\d+)(?:, time remaining: (\S+))?/.exec(line)
    if (m) last = { phase: 'rendering', current: Number(m[1]), total: Number(m[2]), etaText: m[3] }
    m = /Encoded (\d+)\/(\d+)/.exec(line)
    if (m) last = { phase: 'encoding', current: Number(m[1]), total: Number(m[2]) }
  }
  return last
}

/** Rows of `remotion compositions`: "Intro    30      640x360        60 (2.00 sec)". */
export function parseCompositions(text: string): Composition[] {
  const out: Composition[] = []
  for (const line of stripAnsi(text).split('\n')) {
    const m = /^(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+)x(\d+)\s+(\d+)\s+\(/.exec(line.trim())
    if (m) out.push({ id: m[1], fps: Number(m[2]), width: Number(m[3]), height: Number(m[4]), durationInFrames: Number(m[5]) })
  }
  return out
}

const DEV_SCRIPT = /^(dev|start|serve|preview|storybook|studio|watch)(:|$)/
const NOT_A_SERVER = /\b(build|test|lint|typecheck|render|export|deploy)\b/
const DEV_COMMAND = /\b(vite|next|nuxt|astro|remix|webpack(-dev)?-server|webpack serve|react-scripts start|parcel|storybook|remotion studio|svelte-kit|expo start|serve|http-server|live-server|gatsby develop|eleventy --serve)\b/

/** Scripts worth offering as "start a preview". */
export function devScripts(scripts: Record<string, string> | undefined): { name: string; command: string }[] {
  return Object.entries(scripts ?? {})
    .filter(([name, cmd]) => DEV_SCRIPT.test(name) || (DEV_COMMAND.test(cmd) && !NOT_A_SERVER.test(cmd)))
    .map(([name, command]) => ({ name, command }))
}
