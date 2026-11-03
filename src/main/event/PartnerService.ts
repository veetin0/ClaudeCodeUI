import { existsSync, mkdirSync, readFileSync, rmSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { normPath, relTo } from '@shared/paths'
import {
  allPartnerEnvs,
  ENV_NAME_RE,
  ensureEnvIgnored,
  envNameFor,
  findKnownKit,
  kitIndex,
  kitNote,
  mergeEnvFile,
  parsePartnerNote,
  PARTNER_KITS,
  pendingNote,
  resolvePartnerMcp,
  type PartnerKeyInfo,
  type ResolvedPartnerMcp,
  type PartnerKit,
  type PartnersState,
} from '@shared/partners'

interface Stored {
  keys: Record<string, { enc: string; share: boolean }>
  /** Known services you added a key for (shown even while the key is being replaced). */
  added: string[]
  custom: PartnerKit[]
  checks: PartnersState['checks']
  docs: Record<string, string>
  mcp: Record<string, string>
}

export interface PartnerDeps {
  file: string
  encrypt(value: string): string
  decrypt(enc: string): string | undefined
  /** The event project (where .env and challenge/partners/ go). */
  projectDir(): string | undefined
  /** Other folders that get the .env too (handoff worktrees). */
  extraDirs(): string[]
  push(state: PartnersState): void
  fetch?: typeof fetch
}

/** Fields that aren't secret (a cloud name); every other value is masked, including keys Harness doesn't know. */
const PLAIN_ENVS = new Set(PARTNER_KITS.flatMap((k) => k.keys.filter((x) => !x.secret).map((x) => x.env)))
const mask = (env: string, v: string) => {
  if (PLAIN_ENVS.has(env)) return v.length > 40 ? `${v.slice(0, 37)}…` : v
  return v.length <= 8 ? '••••' : `${v.slice(0, 3)}…${v.slice(-4)}`
}

/**
 * Partner API keys: stored encrypted on this laptop (OS keychain), optionally shared with the team
 * (encrypted end to end through the relay), written to the event project's .env, and passed to every
 * session in that project. Kit notes for Claude go to challenge/partners/.
 */
export class PartnerService {
  private data: Stored = { keys: {}, added: [], custom: [], checks: {}, docs: {}, mcp: {} }
  private team: Record<string, { value: string; from: string }> = {}
  private timer?: NodeJS.Timeout
  private writeError?: string
  private watcher?: FSWatcher
  private watched?: string
  private notesTimer?: NodeJS.Timeout

  constructor(private readonly deps: PartnerDeps) {
    try {
      if (existsSync(deps.file)) this.data = { ...this.data, ...(JSON.parse(readFileSync(deps.file, 'utf8')) as Partial<Stored>) }
    } catch {
      // Unreadable: start empty rather than refuse to run.
    }
  }

  /** Every service Harness can use: the known ones and the keys you added for others. */
  kits(): PartnerKit[] {
    return [...PARTNER_KITS, ...this.data.custom]
  }

  /** The ones in play: keys you added, and known services you or a teammate have a key for. */
  private activeKits(): PartnerKit[] {
    const keyed = new Set([...Object.keys(this.data.keys), ...Object.keys(this.team)])
    return this.kits().filter((k) => k.custom || this.data.added.includes(k.id) || k.keys.some((x) => keyed.has(x.env)))
  }

  state(): PartnersState {
    const keys: Record<string, PartnerKeyInfo> = {}
    for (const [env, v] of Object.entries(this.team)) keys[env] = { source: 'team', from: v.from, share: false, preview: mask(env, v.value) }
    for (const [env, s] of Object.entries(this.data.keys)) {
      const value = this.deps.decrypt(s.enc)
      if (value !== undefined) keys[env] = { source: 'me', share: s.share, preview: mask(env, value) }
    }
    return {
      kits: this.activeKits(),
      known: PARTNER_KITS.filter((k) => k.keys.length).map((k) => k.name),
      keys,
      checks: this.data.checks,
      docs: this.data.docs,
      mcp: this.data.mcp,
      project: this.deps.projectDir(),
      writeError: this.writeError,
    }
  }

  /** Every key in effect: yours, then teammates' for the rest. */
  values(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [env, v] of Object.entries(this.team)) out[env] = v.value
    for (const [env, s] of Object.entries(this.data.keys)) {
      const value = this.deps.decrypt(s.enc)
      if (value !== undefined) out[env] = value
    }
    const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = out
    if (cloud && key && secret && !out.CLOUDINARY_URL) out.CLOUDINARY_URL = `cloudinary://${key}:${secret}@${cloud}`
    return out
  }

  /** Keys for a session in this folder: the event project and handoff folders get them all. */
  envFor(cwd: string): Record<string, string> {
    return this.inEvent(cwd) ? this.values() : {}
  }

  private inEvent(cwd: string): boolean {
    const dirs = [this.deps.projectDir(), ...this.deps.extraDirs()].filter((d): d is string => !!d)
    const c = normPath(cwd)
    return dirs.some((d) => normPath(d) === c || relTo(c, d) !== null)
  }

  /**
   * Partner MCP servers: for a session in this folder (only the event project gets them, like the
   * keys), or with no folder every kit that has one, ready or still missing keys (for Settings).
   */
  mcpServers(cwd?: string): { id: string; name: string; server: ResolvedPartnerMcp | { missing: string[] } }[] {
    if (cwd !== undefined && !this.inEvent(cwd)) return []
    const values = this.values()
    return this.activeKits().flatMap((kit) => {
      const server = resolvePartnerMcp(kit, values, this.data.mcp[kit.id])
      if (!server || (cwd !== undefined && 'missing' in server)) return []
      return [{ id: kit.id, name: kit.name, server }]
    })
  }

  /** The keys you chose to share, for the team relay (sealed there). */
  sharedSecrets(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const [env, s] of Object.entries(this.data.keys)) {
      if (!s.share) continue
      const v = this.deps.decrypt(s.enc)
      if (v !== undefined) out[env] = v
    }
    return out
  }

  setTeamKeys(keys: Record<string, { value: string; from: string }>) {
    this.team = keys
    this.changed()
  }

  setKey(env: string, value: string | null, share = true): PartnersState {
    if (!ENV_NAME_RE.test(env)) throw new Error(`${env} isn’t a valid variable name (capital letters, digits and _).`)
    const v = value?.trim()
    if (!v) delete this.data.keys[env]
    else this.data.keys[env] = { enc: this.deps.encrypt(v), share }
    // A changed key needs checking again.
    for (const k of this.kits()) if (k.keys.some((x) => x.env === env)) delete this.data.checks[k.id]
    this.save()
    this.changed()
    return this.state()
  }

  setShare(env: string, share: boolean): PartnersState {
    const s = this.data.keys[env]
    if (s) s.share = share
    this.save()
    this.changed()
    return this.state()
  }

  setDocs(kitId: string, url: string): PartnersState {
    const u = url.trim()
    if (u && !/^https?:\/\//.test(u)) throw new Error('Docs link must start with http:// or https://')
    if (u) this.data.docs[kitId] = u
    else delete this.data.docs[kitId]
    this.save()
    this.changed()
    return this.state()
  }

  /** An MCP server URL a partner gave out at the event (empty clears it). */
  setMcp(kitId: string, url: string): PartnersState {
    const u = url.trim()
    if (u && !/^https:\/\//.test(u)) throw new Error('MCP server URL must start with https://')
    if (u) {
      this.data.mcp[kitId] = u
      // Pasting a partner's MCP URL means you're using that service.
      if (!this.data.added.includes(kitId) && PARTNER_KITS.some((k) => k.id === kitId)) this.data.added.push(kitId)
    } else delete this.data.mcp[kitId]
    this.save()
    this.changed()
    return this.state()
  }

  /**
   * Adds an API key. A service Harness knows (by the name you typed) gets its kit: notes, key check,
   * MCP server. Anything else becomes a key of its own, which Claude then researches (the renderer
   * asks it with partnerResearchPrompt) and describes in challenge/partners/<id>.md.
   */
  addKey(opts: { key: string; name?: string }): { state: PartnersState; kitId: string; known: boolean } {
    const key = opts.key.trim()
    if (!key) throw new Error('Paste the API key.')
    if (key.length > 4000 || /\s/.test(key)) throw new Error('That doesn’t look like an API key: it should be one line without spaces.')
    const name = (opts.name ?? '').trim().slice(0, 60)
    const known = name ? findKnownKit(name) : undefined
    if (known) {
      if (!this.data.added.includes(known.id)) this.data.added.push(known.id)
      const env = (known.keys.find((k) => k.secret) ?? known.keys[0]).env
      this.setKey(env, key, true)
      return { state: this.state(), kitId: known.id, known: true }
    }
    const unique = (base: string, taken: (v: string) => boolean, sep: string) => {
      let v = base
      for (let n = 2; taken(v); n++) v = `${base}${sep}${n}`
      return v
    }
    const env = unique(envNameFor(name) ?? 'NEW_API_KEY', (v) => this.envTaken(v), '_')
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    // A note already in challenge/partners/ (an old key's, or one from git) belongs to something else.
    const project = this.deps.projectDir()
    const noteExists = (v: string) => !!project && existsSync(join(project, 'challenge', 'partners', `${v}.md`))
    const id = unique(`custom-${slug || 'key'}`, (v) => this.kits().some((k) => k.id === v) || noteExists(v), '-')
    this.data.custom.push({
      id,
      name: name || 'New API key',
      label: name || undefined,
      site: '',
      what: 'Claude is working out what this key is for…',
      keys: [{ env, label: 'API key', secret: true }],
      custom: true,
      research: 'pending',
    })
    this.data.keys[env] = { enc: this.deps.encrypt(key), share: true }
    this.save()
    this.changed()
    return { state: this.state(), kitId: id, known: false }
  }

  private envTaken(env: string): boolean {
    return env in this.data.keys || env in this.team || this.kits().some((k) => k.keys.some((x) => x.env === env))
  }

  /** Removes a key you added (and its note); a known service goes back to the catalog. */
  remove(id: string): PartnersState {
    const kit = this.kits().find((k) => k.id === id)
    if (!kit) return this.state()
    for (const k of kit.keys) delete this.data.keys[k.env]
    delete this.data.checks[id]
    delete this.data.mcp[id]
    delete this.data.docs[id]
    this.data.custom = this.data.custom.filter((k) => k.id !== id)
    this.data.added = this.data.added.filter((x) => x !== id)
    const project = this.deps.projectDir()
    if (project) rmSync(join(project, 'challenge', 'partners', `${id}.md`), { force: true })
    this.save()
    this.changed()
    return this.state()
  }

  /**
   * Picks up what Claude found out about the keys Harness doesn't know: the front matter of
   * challenge/partners/<id>.md (name, what it's for, docs, whether the key worked, and the variable
   * name its SDK expects, which the key is moved to). Returns whether anything changed.
   */
  readNotes(): boolean {
    const project = this.deps.projectDir()
    if (!project) return false
    let changed = false
    for (const kit of this.data.custom) {
      let text: string
      try {
        text = readFileSync(join(project, 'challenge', 'partners', `${kit.id}.md`), 'utf8')
      } catch {
        continue
      }
      const note = parsePartnerNote(text)
      if (!note || note.status === 'pending' || !note.what) continue
      const before = JSON.stringify([kit, this.data.checks[kit.id]])
      kit.research = 'done'
      if (note.name) kit.name = note.name
      kit.what = note.what
      if (note.docs) kit.docs = kit.site = note.docs
      const verdict =
        note.works === true
          ? { ok: true, message: 'Works (Claude checked it)' }
          : note.works === false
            ? { ok: false, message: note.problem ? `Didn’t work: ${note.problem}` : 'Didn’t work (Claude checked it)' }
            : undefined
      const had = this.data.checks[kit.id]
      if (verdict && (had?.ok !== verdict.ok || had.message !== verdict.message)) this.data.checks[kit.id] = { ...verdict, at: Date.now() }
      const env = kit.keys[0]?.env
      if (env && note.env && note.env !== env && ENV_NAME_RE.test(note.env) && !this.envTaken(note.env)) {
        const stored = this.data.keys[env]
        if (stored) {
          this.data.keys[note.env] = stored
          delete this.data.keys[env]
        }
        kit.keys[0] = { ...kit.keys[0], env: note.env }
      }
      if (JSON.stringify([kit, this.data.checks[kit.id]]) !== before) changed = true
    }
    if (changed) {
      this.save()
      this.changed()
    }
    return changed
  }

  /** Checks a kit's key with a cheap request (where there is one). */
  async test(kitId: string): Promise<PartnersState> {
    const kit = this.kits().find((k) => k.id === kitId)
    if (!kit) throw new Error('Unknown partner')
    const result = await checkKit(kit, this.values(), this.deps.fetch ?? fetch)
    this.data.checks[kitId] = { ...result, at: Date.now() }
    this.save()
    this.deps.push(this.state())
    return this.state()
  }

  /** Keys or the project changed: rewrite the files soon (several changes in a row write once). */
  changed() {
    this.deps.push(this.state())
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.write(), 400)
  }

  /** Writes .env (Harness's block only), .gitignore and challenge/partners/ in the event project. */
  write() {
    const project = this.deps.projectDir()
    if (!project || !existsSync(project)) return
    const values = this.values()
    const order = [...allPartnerEnvs(this.kits()), 'CLOUDINARY_URL']
    try {
      for (const dir of [project, ...this.deps.extraDirs()]) {
        if (!existsSync(dir)) continue
        const envPath = join(dir, '.env')
        const before = existsSync(envPath) ? readFileSync(envPath, 'utf8') : ''
        const after = mergeEnvFile(before, values, order)
        if (after !== before && (before || Object.keys(values).length)) writeFileSync(envPath, after, { mode: 0o600 })
        if (Object.keys(values).length) {
          const gi = join(dir, '.gitignore')
          const next = ensureEnvIgnored(existsSync(gi) ? readFileSync(gi, 'utf8') : '')
          if (next !== null) writeFileSync(gi, next)
        }
      }
      const ready = Object.keys(values)
      const notes = join(project, 'challenge', 'partners')
      mkdirSync(notes, { recursive: true })
      // What Claude wrote about a key since the last write (Harness may have been closed meanwhile).
      this.readNotes()
      const kits = this.activeKits()
      const files: [string, string][] = [['README.md', kitIndex(kits, ready)]]
      for (const k of kits.filter((x) => x.keys.length)) {
        // Claude owns the notes for keys Harness doesn't know: only a placeholder until it writes one.
        if (k.custom) {
          if (!existsSync(join(notes, `${k.id}.md`))) files.push([`${k.id}.md`, pendingNote(k)])
        } else files.push([`${k.id}.md`, kitNote(k, ready, this.data.docs[k.id], this.data.mcp[k.id])])
      }
      for (const [name, content] of files) {
        const p = join(notes, name)
        if (!existsSync(p) || readFileSync(p, 'utf8') !== content) writeFileSync(p, content)
      }
      // Notes Harness wrote for known services no longer in use (older versions wrote one for every kit).
      const active = new Set(kits.map((k) => k.id))
      for (const k of PARTNER_KITS) {
        const p = join(notes, `${k.id}.md`)
        if (!active.has(k.id) && existsSync(p) && readFileSync(p, 'utf8').startsWith(`# ${k.name}\n\n${k.what}\n`)) rmSync(p, { force: true })
      }
      this.watchNotes(notes)
      this.writeError = undefined
    } catch (err) {
      this.writeError = `Couldn’t write the keys into the project: ${err instanceof Error ? err.message : String(err)}`
    }
    this.deps.push(this.state())
  }

  private save() {
    writeFileSync(this.deps.file, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }

  /** Notices Claude writing a key's note, so its card updates while Claude works. */
  private watchNotes(dir: string) {
    if (this.watched === dir) return
    this.watcher?.close()
    this.watcher = undefined
    this.watched = dir
    try {
      this.watcher = watch(dir, () => {
        clearTimeout(this.notesTimer)
        this.notesTimer = setTimeout(() => this.readNotes(), 300)
      })
      this.watcher.unref?.()
      this.watcher.on('error', () => {
        this.watcher?.close()
        this.watcher = undefined
        this.watched = undefined
      })
    } catch {
      this.watched = undefined
    }
  }

  dispose() {
    clearTimeout(this.timer)
    clearTimeout(this.notesTimer)
    this.watcher?.close()
  }
}

const verdict = (status: number, okText = 'Key works'): { ok: boolean; message: string } => {
  if (status >= 200 && status < 300) return { ok: true, message: okText }
  if (status === 401 || status === 403) return { ok: false, message: `The key was rejected (${status}).` }
  if (status === 402) return { ok: false, message: 'The key works, but the account is out of credits (402).' }
  return { ok: false, message: `Couldn’t confirm the key: the API answered ${status}.` }
}

/** One cheap, read-only (or near-free) request per partner to see whether the key is accepted. */
export async function checkKit(kit: PartnerKit, v: Record<string, string>, f: typeof fetch): Promise<{ ok: boolean; message: string }> {
  const missing = kit.keys.filter((k) => !k.label.includes('optional') && !v[k.env]).map((k) => k.env)
  const req = (url: string, init: RequestInit = {}) => f(url, { ...init, signal: AbortSignal.timeout(12_000) })
  try {
    switch (kit.id) {
      case 'exa': {
        if (!v.EXA_API_KEY) break
        const r = await req('https://api.exa.ai/search', {
          method: 'POST',
          headers: { 'x-api-key': v.EXA_API_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ query: 'hackathon', numResults: 1 }),
        })
        return verdict(r.status)
      }
      case 'openai':
        if (!v.OPENAI_API_KEY) break
        return verdict((await req('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${v.OPENAI_API_KEY}` } })).status)
      case 'featherless':
        if (!v.FEATHERLESS_API_KEY) break
        return verdict(
          (await req('https://api.featherless.ai/v1/models', { headers: { authorization: `Bearer ${v.FEATHERLESS_API_KEY}` } })).status,
          'The API answered with your key',
        )
      case 'cloudinary': {
        if (missing.length) break
        const auth = Buffer.from(`${v.CLOUDINARY_API_KEY}:${v.CLOUDINARY_API_SECRET}`).toString('base64')
        return verdict(
          (await req(`https://api.cloudinary.com/v1_1/${encodeURIComponent(v.CLOUDINARY_CLOUD_NAME)}/ping`, { headers: { authorization: `Basic ${auth}` } }))
            .status,
        )
      }
      case 'aiven':
        if (!v.AIVEN_TOKEN)
          return v.DATABASE_URL
            ? { ok: true, message: 'Service URI saved (database URIs aren’t checked online; your app will connect with it).' }
            : { ok: false, message: 'Paste the service URI first.' }
        return verdict((await req('https://api.aiven.io/v1/me', { headers: { authorization: `aivenv1 ${v.AIVEN_TOKEN}` } })).status)
      case 'hostinger':
        if (!v.HOSTINGER_API_TOKEN) break
        return verdict(
          (await req('https://developers.hostinger.com/api/hosting/v1/websites', { headers: { authorization: `Bearer ${v.HOSTINGER_API_TOKEN}` } })).status,
        )
      case 'arduino': {
        if (!v.ARDUINO_CLIENT_ID || !v.ARDUINO_CLIENT_SECRET)
          return { ok: false, message: 'Paste the Cloud API client ID and secret first (boards on the table need no key).' }
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: v.ARDUINO_CLIENT_ID,
          client_secret: v.ARDUINO_CLIENT_SECRET,
          audience: 'https://api2.arduino.cc/iot',
        })
        return verdict(
          (
            await req('https://api2.arduino.cc/iot/v1/clients/token', {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body,
            })
          ).status,
        )
      }
      case 'verda': {
        if (missing.length) break
        const r = await req('https://api.verda.com/v1/oauth2/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ grant_type: 'client_credentials', client_id: v.VERDA_CLIENT_ID, client_secret: v.VERDA_CLIENT_SECRET }),
        })
        return r.status === 404 ? { ok: false, message: 'Couldn’t check: the token endpoint moved. Try the key with the SDK.' } : verdict(r.status)
      }
      default:
        return { ok: false, message: 'No automatic check for this one: try it from code.' }
    }
  } catch (err) {
    return { ok: false, message: `Couldn’t reach ${kit.name}: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: false, message: `Paste ${missing.join(', ') || 'the key'} first.` }
}
