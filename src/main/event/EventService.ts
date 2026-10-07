import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import YAML from 'yaml'
import { pickEvent, pickProgress, type EventProgress, type EventState } from '@shared/event'
import { DEFAULT_EVENT, EVENT_PRESETS, type EventPresetId } from '@shared/presets/junction2026'

const EVENT_FILE = join('challenge', 'event.yaml')
const PROGRESS_FILE = join('challenge', 'event-checklist.json')
const HACKFORGE_FILE = join('challenge', 'hackforge.yaml')
const CHALLENGE_DIRS = ['brief', 'data', 'assets', 'prompts', 'examples']

export type { EventProgressPatch as ProgressPatch } from '@shared/ipc'
import type { EventProgressPatch as ProgressPatch } from '@shared/ipc'

const readText = (p: string) => readFile(p, 'utf8').catch(() => undefined)

async function writeIfMissing(path: string, content: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true })
  try {
    await writeFile(path, content, { flag: 'wx' })
    return true
  } catch {
    return false
  }
}

/** Sets keys in hackforge.yaml without touching the rest (comments and other settings survive). */
export function mergeHackforgeYaml(existing: string | undefined, settings: Record<string, unknown>): string {
  const doc = YAML.parseDocument(existing ?? '# HackForge configuration (set up by Harness event mode).\n')
  if (!doc.contents) doc.contents = doc.createNode({}) as unknown as typeof doc.contents
  const set = (path: string[], value: unknown) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) set([...path, k], v)
    } else {
      const prev = doc.getIn(path, true)
      if (YAML.isScalar(prev) && !Array.isArray(value)) {
        // Change the value in place so a trailing "# comment" stays.
        prev.value = value
        return
      }
      const node = doc.createNode(value) as YAML.Node
      if (Array.isArray(value)) (node as YAML.YAMLSeq).flow = true
      if (YAML.isNode(prev)) node.comment = prev.comment
      doc.setIn(path, node)
    }
  }
  for (const [k, v] of Object.entries(settings)) set([k], v)
  return doc.toString()
}

/**
 * Event mode backend: the event config (from the linked project's challenge/event.yaml, else the
 * built-in preset), the team's shared progress (challenge/event-checklist.json, synced through git),
 * and one-click project setup from a preset.
 */
export class EventService {
  private watcher: FSWatcher | null = null
  private watchedDir: string | null = null
  private timer?: NodeJS.Timeout

  constructor(
    private getProjectDir: () => string | undefined,
    private readonly push: (state: EventState) => void,
    private readonly preset: EventPresetId = DEFAULT_EVENT,
  ) {}

  async state(): Promise<EventState> {
    const dir = this.getProjectDir()
    this.ensureWatch(dir)
    const text = dir ? await readText(join(dir, EVENT_FILE)) : undefined
    let config = pickEvent(YAML.parse(EVENT_PRESETS[this.preset].yaml), this.preset)
    let source: EventState['source'] = 'preset'
    if (text) {
      try {
        const parsed = pickEvent(YAML.parse(text), this.preset)
        // A half-edited file shouldn't blank the clock.
        if (parsed.milestones.length) {
          config = parsed
          source = 'project'
        }
      } catch {
        // Keep the preset.
      }
    }
    let progress: EventProgress = { done: {}, partners: {} }
    const p = dir ? await readText(join(dir, PROGRESS_FILE)) : undefined
    if (p) {
      try {
        progress = pickProgress(JSON.parse(p))
      } catch {
        // Corrupt (e.g. a merge conflict): start empty rather than fail.
      }
    }
    return { config, source, projectDir: dir, projectReady: !!text, progress }
  }

  /** Prepares a folder for the event: challenge/ layout, event.yaml, team directive, brief, HackForge settings. */
  async setup(dir: string): Promise<EventState> {
    const preset = EVENT_PRESETS[this.preset]
    for (const d of CHALLENGE_DIRS) await mkdir(join(dir, 'challenge', d), { recursive: true })
    await writeIfMissing(join(dir, EVENT_FILE), preset.yaml)
    for (const [rel, content] of Object.entries(preset.files)) await writeIfMissing(join(dir, rel), content)
    const hfPath = join(dir, HACKFORGE_FILE)
    await writeFile(hfPath, mergeHackforgeYaml(await readText(hfPath), preset.hackforge))
    await writeIfMissing(join(dir, PROGRESS_FILE), JSON.stringify({ done: {}, partners: {} }, null, 2) + '\n')
    return this.state()
  }

  async updateProgress(patch: ProgressPatch): Promise<EventState> {
    const dir = this.getProjectDir()
    if (!dir) throw new Error('Link an event project first.')
    const cur = (await this.state()).progress
    if (patch.done) cur.done = { ...cur.done, ...patch.done }
    if (patch.partner) {
      const { name, ...flags } = patch.partner
      cur.partners[name] = { ...cur.partners[name], ...flags }
    }
    // Stable key order keeps git diffs small when teammates tick things at the same time.
    const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
    await mkdir(join(dir, 'challenge'), { recursive: true })
    await writeFile(join(dir, PROGRESS_FILE), JSON.stringify({ done: sorted(cur.done), partners: sorted(cur.partners) }, null, 2) + '\n')
    return this.state()
  }

  private ensureWatch(dir: string | undefined) {
    if (dir === this.watchedDir && (this.watcher || !dir)) return
    this.watcher?.close()
    this.watcher = null
    this.watchedDir = dir ?? null
    if (!dir) return
    try {
      // challenge/ may not exist yet; watch the project root so setup and `git pull` are both seen.
      this.watcher = watch(dir, { recursive: true }, (_e, file) => {
        const f = file?.toString() ?? ''
        if (f !== EVENT_FILE && f !== PROGRESS_FILE && f !== 'challenge') return
        clearTimeout(this.timer)
        this.timer = setTimeout(() => void this.state().then(this.push, () => {}), 150)
      })
      this.watcher.on('error', () => this.watcher?.close())
    } catch {
      this.watcher = null
    }
  }

  dispose() {
    clearTimeout(this.timer)
    this.watcher?.close()
    this.watcher = null
  }
}
