import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import YAML from 'yaml'
import { pickEvent, pickProgress, type EventProgress, type EventState } from '@shared/event'
import { DEFAULT_EVENT, EVENT_PRESETS, type EventPresetId } from '@shared/presets/junction2026'
import { applyPatch, CHALLENGES_DIR, chosenBrief, parseChallenge, serializeChallenge, slugify, type Challenge, type ChallengePatch } from '@shared/challenges'

const EVENT_FILE = join('challenge', 'event.yaml')
const PROGRESS_FILE = join('challenge', 'event-checklist.json')
const HACKFORGE_FILE = join('challenge', 'hackforge.yaml')
const CHALLENGE_DIRS = ['brief', 'data', 'assets', 'prompts', 'examples']
const CHOSEN_BRIEF = join('challenge', 'brief', '00-chosen-challenge.md')
/** Any plain file name (no path separators), so files Claude names differently still show up. */
const ID_RE = /^[A-Za-z0-9][\w.-]{0,100}$/

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

/**
 * Mixed Mac/Windows teams: Git on Windows may check scripts out with CRLF endings, which breaks bash
 * (HackForge's gate.sh). Force LF for scripts, keeping any .gitattributes the repo already has.
 */
export const LF_RULES = ['*.sh text eol=lf', '*.bash text eol=lf', '*.py text eol=lf']
export async function ensureLfAttributes(dir: string) {
  const path = join(dir, '.gitattributes')
  const cur = (await readText(path)) ?? ''
  const missing = LF_RULES.filter((r) => !cur.split(/\r?\n/).some((l) => l.trim().replace(/\s+/g, ' ') === r))
  if (!missing.length) return
  const header = cur ? '' : '# Scripts keep Unix line endings on every OS (bash breaks on CRLF).\n'
  await writeFile(path, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${header}${missing.join('\n')}\n`)
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
  /** Writes run one at a time: each is read-modify-write, and quick clicks overlap otherwise. */
  private queue: Promise<unknown> = Promise.resolve()

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
    return { config, source, projectDir: dir, projectReady: !!text, progress, challenges: dir ? await this.readChallenges(dir) : [] }
  }

  /** Prepares a folder for the event: challenge/ layout, event.yaml, team directive, brief, HackForge settings. */
  setup(dir: string): Promise<EventState> {
    return this.serial(() => this.writeSetup(dir))
  }

  private async writeSetup(dir: string): Promise<EventState> {
    const preset = EVENT_PRESETS[this.preset]
    for (const d of CHALLENGE_DIRS) await mkdir(join(dir, 'challenge', d), { recursive: true })
    await writeIfMissing(join(dir, EVENT_FILE), preset.yaml)
    for (const [rel, content] of Object.entries(preset.files)) await writeIfMissing(join(dir, rel), content)
    const hfPath = join(dir, HACKFORGE_FILE)
    await writeFile(hfPath, mergeHackforgeYaml(await readText(hfPath), preset.hackforge))
    await writeIfMissing(join(dir, PROGRESS_FILE), JSON.stringify({ done: {}, partners: {} }, null, 2) + '\n')
    await ensureLfAttributes(dir)
    return this.state()
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn)
    this.queue = next.catch(() => {})
    return next
  }

  updateProgress(patch: ProgressPatch): Promise<EventState> {
    return this.serial(() => this.writeProgress(patch))
  }

  private async writeProgress(patch: ProgressPatch): Promise<EventState> {
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

  // ---------- challenges ----------

  private async readChallenges(dir: string): Promise<Challenge[]> {
    const files = await readdir(join(dir, CHALLENGES_DIR)).catch(() => [] as string[])
    const out: Challenge[] = []
    const ids = files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)).filter((id) => ID_RE.test(id)).sort()
    for (const id of ids) {
      const f = `${id}.md`
      const src = await readText(join(dir, CHALLENGES_DIR, f))
      if (src !== undefined) out.push(parseChallenge(src, id))
    }
    return out
  }

  private requireDir(): string {
    const dir = this.getProjectDir()
    if (!dir) throw new Error('Link an event project first.')
    return dir
  }

  private challengePath(dir: string, id: string) {
    if (!ID_RE.test(id)) throw new Error(`Invalid challenge id: ${id}`)
    return join(dir, CHALLENGES_DIR, `${id}.md`)
  }

  /** Adds a challenge typed or pasted into the board. */
  addChallenge(c: { partner: string; title: string; description: string; link?: string }): Promise<EventState> {
    return this.serial(() => this.writeNewChallenge(c))
  }

  private async writeNewChallenge(c: { partner: string; title: string; description: string; link?: string }): Promise<EventState> {
    const dir = this.requireDir()
    await mkdir(join(dir, CHALLENGES_DIR), { recursive: true })
    const base = slugify(`${c.partner} ${c.title}`)
    let id = base
    for (let i = 2; await readText(this.challengePath(dir, id)); i++) id = `${base}-${i}`
    const challenge: Challenge = {
      id,
      partner: c.partner.trim() || 'Unknown partner',
      title: c.title.trim() || 'Untitled challenge',
      status: 'candidate',
      link: c.link?.trim() || undefined,
      scores: {},
      description: c.description,
      notes: '',
    }
    await writeFile(this.challengePath(dir, id), serializeChallenge(challenge))
    return this.state()
  }

  updateChallenge(id: string, patch: ChallengePatch): Promise<EventState> {
    return this.serial(() => this.patchChallenge(id, patch))
  }

  private async patchChallenge(id: string, patch: ChallengePatch): Promise<EventState> {
    const dir = this.requireDir()
    const path = this.challengePath(dir, id)
    const src = await readText(path)
    if (src === undefined) throw new Error('That challenge file no longer exists.')
    await writeFile(path, serializeChallenge(applyPatch(parseChallenge(src, id), patch)))
    return this.state()
  }

  deleteChallenge(id: string): Promise<EventState> {
    return this.serial(async () => {
      const dir = this.requireDir()
      await rm(this.challengePath(dir, id), { force: true })
      return this.state()
    })
  }

  /**
   * Picks the challenge: marks it chosen (any previous pick goes back to the shortlist), writes the
   * brief HackForge reads, names the challenge in hackforge.yaml and ticks the checklist item.
   */
  chooseChallenge(id: string): Promise<EventState> {
    return this.serial(() => this.writeChoice(id))
  }

  private async writeChoice(id: string): Promise<EventState> {
    const dir = this.requireDir()
    for (const c of await this.readChallenges(dir)) {
      if (c.id !== id && c.status === 'chosen') await this.patchChallenge(c.id, { status: 'shortlist' })
    }
    await this.patchChallenge(id, { status: 'chosen' })
    const chosen = parseChallenge((await readText(this.challengePath(dir, id)))!, id)
    await mkdir(join(dir, 'challenge', 'brief'), { recursive: true })
    await writeFile(join(dir, CHOSEN_BRIEF), chosenBrief(chosen))
    const hfPath = join(dir, HACKFORGE_FILE)
    await writeFile(hfPath, mergeHackforgeYaml(await readText(hfPath), { challenge: `${chosen.partner}: ${chosen.title}` }))
    return this.writeProgress({ done: { 'p-challenge': true } })
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
        const f = (file?.toString() ?? '').replace(/\\/g, '/')
        if (f !== 'challenge/event.yaml' && f !== 'challenge/event-checklist.json' && f !== 'challenge' && f !== CHALLENGES_DIR && !f.startsWith(`${CHALLENGES_DIR}/`)) return
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
