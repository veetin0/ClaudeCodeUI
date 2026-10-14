import { existsSync, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import YAML from 'yaml'
import {
  parseDirectives,
  parseLoop,
  parseMilestones,
  parseRules,
  parseState,
  parseVerify,
  parseVerifyJson,
  pickConfig,
  setYamlProfile,
  type HackforgePluginInfo,
  type HackforgeSnapshot,
} from '@shared/hackforge'
import { listFiles, watchProject } from '../project/projectFiles'

const MEMORY = '.hackforge'
const CONFIG = join('challenge', 'hackforge.yaml')

/**
 * Whether a watcher path (always forward slashes, see watchProject) is HackForge state rather than
 * code. Compared as a string, not with join(): on Windows join() gives `challenge\hackforge.yaml`.
 */
export function isMemoryChange(rel: string): boolean {
  return rel === MEMORY || rel.startsWith(`${MEMORY}/`) || rel === 'challenge' || rel === 'challenge/hackforge.yaml' || rel.startsWith('.claude/')
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

const mtimeOf = (path: string) => stat(path).then((s) => s.mtimeMs, () => undefined)

/** `enabledPlugins` in a project's Claude Code settings has a `hackforge@<marketplace>` key set to true. */
async function pluginEnabledIn(settingsPath: string): Promise<boolean> {
  try {
    const s = JSON.parse(await readFile(settingsPath, 'utf8')) as { enabledPlugins?: Record<string, unknown> }
    return Object.entries(s.enabledPlugins ?? {}).some(([k, v]) => k.startsWith('hackforge@') && v !== false)
  } catch {
    return false
  }
}

/** Reads a project's HackForge state. Never throws: missing files just leave fields empty. */
export async function readHackforge(cwd: string, pluginInfo: () => HackforgePluginInfo): Promise<HackforgeSnapshot> {
  const hf = join(cwd, MEMORY)
  const [memFiles, challengeDir] = await Promise.all([readdir(hf).catch(() => null), stat(join(cwd, 'challenge')).then((s) => s.isDirectory(), () => false)])
  const files = (memFiles ?? []).filter((f) => !f.startsWith('.')).sort()
  // Tolerate case differences (Verify.md, state.md).
  const find = (name: string) => files.find((f) => f.toLowerCase() === name.toLowerCase())
  const mem = (name: string) => {
    const f = find(name)
    return f ? readText(join(hf, f)) : Promise.resolve(undefined)
  }
  const [yaml, state, rules, plan, verify, verifyJson, loopJson, loopMd, ledger, directives, decision, views] = await Promise.all([
    readText(join(cwd, CONFIG)),
    mem('STATE.md'),
    mem('RULES.md'),
    mem('PLAN.md'),
    mem('VERIFY.md'),
    mem('verify.json'),
    mem('LOOP.json'),
    mem('LOOP.md'),
    mem('ledger.jsonl'),
    mem('DIRECTIVES.md'),
    mem('DECISION.md'),
    readdir(join(hf, 'views')).then((f) => f.filter((x) => x.endsWith('.html')).sort(), () => [] as string[]),
  ])
  let config = {}
  try {
    config = yaml ? pickConfig(YAML.parse(yaml)) : {}
  } catch {
    // Half-edited YAML: show the rest.
  }
  let loopObj: unknown
  try {
    loopObj = loopJson ? JSON.parse(loopJson) : undefined
  } catch {
    loopObj = undefined
  }
  // verify.json is what the 2.x loop gate trusts; VERIFY.md is its rendering (or 1.x's only output).
  let verifyResult: HackforgeSnapshot['verify']
  if (verifyJson) {
    try {
      verifyResult = parseVerifyJson(JSON.parse(verifyJson), (await mtimeOf(join(hf, find('verify.json')!))) ?? 0)
    } catch {
      verifyResult = undefined
    }
  }
  if (!verifyResult && verify) verifyResult = parseVerify(verify, (await mtimeOf(join(hf, find('VERIFY.md')!))) ?? 0)
  let plugin = pluginInfo()
  // A project can enable an installed copy in its own .claude/settings.json.
  if (plugin.source === 'none' && ((await pluginEnabledIn(join(cwd, '.claude', 'settings.json'))) || (await pluginEnabledIn(join(cwd, '.claude', 'settings.local.json'))))) {
    plugin = { ...plugin, source: 'installed' }
  }
  return {
    cwd,
    present: memFiles !== null || challengeDir,
    initialized: memFiles !== null,
    config,
    state: state ? parseState(state) : {},
    rules: rules ? parseRules(rules) : [],
    directives: directives ? parseDirectives(directives) : [],
    decision: decision ? { title: /^#\s+(?:Decision\s*[:—–-]\s*)?(.+)$/im.exec(decision)?.[1]?.trim(), text: decision } : undefined,
    milestones: plan ? parseMilestones(plan) : [],
    verify: verifyResult,
    verifyStale: false,
    loop: loopObj !== undefined || loopMd || ledger ? parseLoop(loopObj, loopMd, ledger) : undefined,
    stopRequested: files.includes('STOP_LOOP'),
    pluginInstalled: plugin.source !== 'none',
    plugin,
    views,
    files,
    updatedAt: Date.now(),
  }
}

/** Newest modification time of the project's source files (as the loop gate computes it). */
async function newestSourceMtime(cwd: string): Promise<number> {
  const files = (await listFiles(cwd)).filter((f) => !f.startsWith(`${MEMORY}/`))
  let newest = 0
  for (let i = 0; i < files.length; i += 200) {
    const times = await Promise.all(files.slice(i, i + 200).map((f) => mtimeOf(join(cwd, f))))
    for (const t of times) if (t && t > newest) newest = t
  }
  return newest
}

const WATCH_RETRY_MS = 2000

interface Watched {
  watcher: FSWatcher | null
  timer?: NodeJS.Timeout
  retry?: NodeJS.Timeout
  last?: HackforgeSnapshot
  refs: number
}

/**
 * Keeps the renderer's HackForge dashboard live: watches each project a window shows and pushes a
 * fresh snapshot whenever .hackforge/ or challenge/hackforge.yaml change (and re-checks whether
 * VERIFY.md has gone stale when code changes).
 */
export class HackforgeService {
  private readonly watched = new Map<string, Watched>()

  constructor(
    private readonly pluginInfo: () => HackforgePluginInfo,
    private readonly push: (snapshot: HackforgeSnapshot) => void,
  ) {}

  async snapshot(cwd: string): Promise<HackforgeSnapshot> {
    const snap = await readHackforge(cwd, this.pluginInfo)
    if (snap.verify) snap.verifyStale = snap.verify.mtime + 1000 < (await newestSourceMtime(cwd))
    const w = this.watched.get(cwd)
    if (w) w.last = snap
    return snap
  }

  /** Starts watching (ref-counted) and returns the current snapshot. */
  async watch(cwd: string): Promise<HackforgeSnapshot> {
    let w = this.watched.get(cwd)
    if (w) w.refs++
    else {
      w = { watcher: null, refs: 1 }
      this.watched.set(cwd, w)
      this.startWatcher(cwd, w)
    }
    return this.snapshot(cwd)
  }

  private startWatcher(cwd: string, entry: Watched) {
    const refresh = (delay: number) => {
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => void this.snapshot(cwd).then((s) => this.watched.get(cwd) === entry && this.push(s)), delay)
    }
    const watcher = watchProject(cwd, (rel) => {
      const memory = isMemoryChange(rel)
      // Code changes only matter once there is a VERIFY.md that could go stale.
      if (!memory && !entry.last?.verify) return
      refresh(memory ? 200 : 1500)
    })
    entry.watcher = watcher
    // watchProject closes a watcher that errors (folder moved, EPERM on Windows…). Start a new one
    // shortly, and re-read, so the dashboard doesn't silently stop updating.
    watcher?.on('error', () => {
      if (entry.watcher !== watcher) return
      entry.watcher = null
      entry.retry = setTimeout(() => {
        if (this.watched.get(cwd) !== entry) return
        this.startWatcher(cwd, entry)
        refresh(0)
      }, WATCH_RETRY_MS)
    })
  }

  unwatch(cwd: string) {
    const w = this.watched.get(cwd)
    if (!w || --w.refs > 0) return
    clearTimeout(w.timer)
    clearTimeout(w.retry)
    w.watcher?.close()
    this.watched.delete(cwd)
  }

  /** The loop gate removes STOP_LOOP when it honours it, ending the loop after the current iteration. */
  async stopLoop(cwd: string) {
    await writeFile(join(cwd, MEMORY, 'STOP_LOOP'), `Requested from Harness at ${new Date().toISOString()}\n`)
  }

  async setProfile(cwd: string, profile: string) {
    const path = join(cwd, CONFIG)
    const yaml = (await readText(path)) ?? ''
    // .hackforge/ without challenge/ still shows the picker; create the folder rather than fail.
    await mkdir(join(cwd, 'challenge'), { recursive: true })
    await writeFile(path, setYamlProfile(yaml, profile))
  }

  /** Opens one of HackForge's HTML decision pages (.hackforge/views/*.html) in the browser. */
  viewPath(cwd: string, name: string): string {
    if (!/^[\w.-]+\.html$/.test(name)) throw new Error('Not a HackForge view')
    return join(cwd, MEMORY, 'views', name)
  }

  /** Should sessions in this folder get the HackForge guidance? */
  isProject(cwd: string): boolean {
    return existsSync(join(cwd, MEMORY)) || existsSync(join(cwd, CONFIG))
  }

  dispose() {
    for (const cwd of [...this.watched.keys()]) {
      const w = this.watched.get(cwd)!
      w.refs = 1
      this.unwatch(cwd)
    }
  }
}
