import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normPath, relTo } from '@shared/paths'
import {
  allPartnerEnvs,
  ENV_NAME_RE,
  ensureEnvIgnored,
  kitIndex,
  kitNote,
  mergeEnvFile,
  PARTNER_KITS,
  resolvePartnerMcp,
  type PartnerKeyInfo,
  type ResolvedPartnerMcp,
  type PartnerKit,
  type PartnersState,
} from '@shared/partners'

interface Stored {
  keys: Record<string, { enc: string; share: boolean }>
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

const SECRET_ENVS = new Set(PARTNER_KITS.flatMap((k) => k.keys.filter((x) => x.secret).map((x) => x.env)))
const mask = (env: string, v: string, kits: PartnerKit[]) => {
  const secret = SECRET_ENVS.has(env) || kits.some((k) => k.custom && k.keys.some((x) => x.env === env))
  if (!secret) return v.length > 40 ? `${v.slice(0, 37)}…` : v
  return v.length <= 8 ? '••••' : `${v.slice(0, 3)}…${v.slice(-4)}`
}

/**
 * Partner API keys: stored encrypted on this laptop (OS keychain), optionally shared with the team
 * (encrypted end to end through the relay), written to the event project's .env, and passed to every
 * session in that project. Kit notes for Claude go to challenge/partners/.
 */
export class PartnerService {
  private data: Stored = { keys: {}, custom: [], checks: {}, docs: {}, mcp: {} }
  private team: Record<string, { value: string; from: string }> = {}
  private timer?: NodeJS.Timeout
  private writeError?: string

  constructor(private readonly deps: PartnerDeps) {
    try {
      if (existsSync(deps.file)) this.data = { ...this.data, ...(JSON.parse(readFileSync(deps.file, 'utf8')) as Partial<Stored>) }
    } catch {
      // Unreadable: start empty rather than refuse to run.
    }
  }

  kits(): PartnerKit[] {
    return [...PARTNER_KITS, ...this.data.custom]
  }

  state(): PartnersState {
    const kits = this.kits()
    const keys: Record<string, PartnerKeyInfo> = {}
    for (const [env, v] of Object.entries(this.team)) keys[env] = { source: 'team', from: v.from, share: false, preview: mask(env, v.value, kits) }
    for (const [env, s] of Object.entries(this.data.keys)) {
      const value = this.deps.decrypt(s.enc)
      if (value !== undefined) keys[env] = { source: 'me', share: s.share, preview: mask(env, value, kits) }
    }
    return { kits, keys, checks: this.data.checks, docs: this.data.docs, mcp: this.data.mcp, project: this.deps.projectDir(), writeError: this.writeError }
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
    return this.kits().flatMap((kit) => {
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
    if (u) this.data.mcp[kitId] = u
    else delete this.data.mcp[kitId]
    this.save()
    this.changed()
    return this.state()
  }

  addCustom(opts: { name: string; env: string; docs?: string }): PartnersState {
    const name = opts.name.trim().slice(0, 60)
    const env = opts.env.trim().toUpperCase()
    if (!name) throw new Error('Give the API a name.')
    if (!ENV_NAME_RE.test(env)) throw new Error('The variable name needs capital letters, digits and _, like ACME_API_KEY.')
    const id = `custom-${
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'api'
    }`
    if (this.kits().some((k) => k.id === id)) throw new Error(`${name} is already in the list.`)
    const docs = opts.docs?.trim()
    this.data.custom.push({
      id,
      name,
      site: docs ?? '',
      what: 'Added by your team at the event.',
      keys: [{ env, label: 'API key', secret: true }],
      docs: docs || undefined,
      custom: true,
    })
    this.save()
    this.changed()
    return this.state()
  }

  removeCustom(id: string): PartnersState {
    this.data.custom = this.data.custom.filter((k) => k.id !== id)
    delete this.data.mcp[id]
    this.save()
    this.changed()
    return this.state()
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
      const kits = this.kits()
      const files: [string, string][] = [
        ['README.md', kitIndex(kits, ready)],
        ...kits.filter((k) => k.keys.length).map((k): [string, string] => [`${k.id}.md`, kitNote(k, ready, this.data.docs[k.id], this.data.mcp[k.id])]),
      ]
      for (const [name, content] of files) {
        const p = join(notes, name)
        if (!existsSync(p) || readFileSync(p, 'utf8') !== content) writeFileSync(p, content)
      }
      this.writeError = undefined
    } catch (err) {
      this.writeError = `Couldn’t write the keys into the project: ${err instanceof Error ? err.message : String(err)}`
    }
    this.deps.push(this.state())
  }

  private save() {
    writeFileSync(this.deps.file, JSON.stringify(this.data, null, 2), { mode: 0o600 })
  }

  dispose() {
    clearTimeout(this.timer)
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
          body: JSON.stringify({ query: 'Junction hackathon', numResults: 1 }),
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
