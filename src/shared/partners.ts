/**
 * API keys for the hackathon (Hackathon › Challenges → API keys). The list starts empty: you add a key,
 * Harness writes it to the project's .env (gitignored), passes it to every session in the project, can
 * share it with the team (encrypted), and writes a note to challenge/partners/ that HackForge and
 * Claude read. For a service Harness knows (the kits below, common hackathon sponsors) the note, key
 * check and MCP server come from the kit; for anything else Claude works out what the key is for and
 * writes the note itself (partnerResearchPrompt).
 *
 * Researched in October 2026. Details that couldn't be confirmed from public sources are marked
 * `unverified`; check those at the event.
 */

import YAML from 'yaml'

export interface PartnerKey {
  env: string
  label: string
  /** Hidden in the UI and never written to the kit notes. */
  secret: boolean
  placeholder?: string
}

export interface PartnerKit {
  id: string
  name: string
  site: string
  /** One line: what it is and what you'd use it for. */
  what: string
  /** Empty for partners without an API (challenge givers, investors). */
  keys: PartnerKey[]
  signup?: string
  docs?: string
  install?: { node?: string; python?: string }
  snippet?: { lang: 'ts' | 'python' | 'bash'; code: string }
  /** Harness can check the key with a cheap request. */
  checkable?: boolean
  notes?: string[]
  /** Public details couldn't be confirmed before the event. */
  unverified?: boolean
  /** Added by the team: a service Harness doesn't know (Claude researches it). */
  custom?: boolean
  /** What the team called it when adding the key (custom kits; empty when they just pasted a key). */
  label?: string
  /** Custom kits: Claude is still working out what the key is for, or has written its findings. */
  research?: 'pending' | 'done'
  /** The partner's own MCP server, added to sessions in the event project once its keys are set. */
  mcp?: PartnerMcp
}

/**
 * How Harness runs a partner's MCP server. `${ENV}` in headers, args or env is replaced with that key's
 * value; the server is added only when every referenced key is set (`keyless`: without the key too,
 * dropping what needs it).
 */
export type PartnerMcp =
  | { kind: 'http'; url: string; headers?: Record<string, string>; keyless?: boolean }
  /** A server bundled with Harness, run from its node_modules: `module` is the script path inside it. */
  | { kind: 'bundled'; module: string; args?: string[]; env?: Record<string, string> }

/** A partner server ready to add to a session, with keys filled in. */
export type ResolvedPartnerMcp =
  | { kind: 'http'; url: string; headers: Record<string, string>; hosting: 'hosted' | 'event-url' }
  | { kind: 'bundled'; module: string; args: string[]; env: Record<string, string>; hosting: 'bundled' }

const PLACEHOLDER = /\$\{([A-Z][A-Z0-9_]*)\}/g
const fill = (v: string, values: Record<string, string>) => v.replace(PLACEHOLDER, (_, env: string) => values[env] ?? '')
const needs = (v: string) => [...v.matchAll(PLACEHOLDER)].map((m) => m[1])

/**
 * The MCP server a kit gives sessions, or the keys it still needs. An MCP URL the team pasted at the
 * event wins over the built-in spec; it gets `Authorization: Bearer <the kit's secret key>` when one is set.
 */
export function resolvePartnerMcp(kit: PartnerKit, values: Record<string, string>, eventUrl?: string): ResolvedPartnerMcp | { missing: string[] } | null {
  if (eventUrl) {
    const secret = kit.keys.find((k) => k.secret && values[k.env])
    return { kind: 'http', url: eventUrl, headers: secret ? { Authorization: `Bearer ${values[secret.env]}` } : {}, hosting: 'event-url' }
  }
  const m = kit.mcp
  if (!m) return null
  if (m.kind === 'http') {
    const headers: Record<string, string> = {}
    const missing: string[] = []
    for (const [h, v] of Object.entries(m.headers ?? {})) {
      const lack = needs(v).filter((env) => !values[env])
      if (lack.length) missing.push(...lack)
      else headers[h] = fill(v, values)
    }
    const urlLack = needs(m.url).filter((env) => !values[env])
    if (urlLack.length || (missing.length && !m.keyless)) return { missing: [...new Set([...urlLack, ...missing])] }
    return { kind: 'http', url: fill(m.url, values), headers, hosting: 'hosted' }
  }
  const all = [...(m.args ?? []), ...Object.values(m.env ?? {})]
  const missing = [...new Set(all.flatMap(needs).filter((env) => !values[env]))]
  if (missing.length) return { missing }
  return {
    kind: 'bundled',
    module: m.module,
    args: (m.args ?? []).map((a) => fill(a, values)),
    env: Object.fromEntries(Object.entries(m.env ?? {}).map(([k, v]) => [k, fill(v, values)])),
    hosting: 'bundled',
  }
}

export interface PartnerKeyInfo {
  /** Your own key, or one a teammate shared. */
  source: 'me' | 'team'
  from?: string
  /** You share it with the team (your own keys only). */
  share: boolean
  /** Masked for secrets ("sk-…9f2c"), in full for names like a cloud name. */
  preview: string
}

/** What the API keys section shows. Key values never leave the main process; only masked previews. */
export interface PartnersState {
  /** The keys you added (and services a teammate shared a key for). */
  kits: PartnerKit[]
  /** Services Harness knows, for name suggestions when adding a key. */
  known: string[]
  keys: Record<string, PartnerKeyInfo>
  checks: Record<string, { ok: boolean; message: string; at: number }>
  /** Docs links the team added (e.g. for a partner whose API turned up at the event). */
  docs: Record<string, string>
  /** MCP server URLs the team added at the event (e.g. a partner announcing one at the opening). */
  mcp: Record<string, string>
  /** The event project the keys are written to. */
  project?: string
  writeError?: string
}

export const PARTNER_KITS: PartnerKit[] = [
  {
    id: 'exa',
    name: 'Exa',
    site: 'https://exa.ai',
    what: 'Web search API built for AI: search the web and get clean page contents and highlights back.',
    keys: [{ env: 'EXA_API_KEY', label: 'API key', secret: true }],
    signup: 'https://dashboard.exa.ai',
    docs: 'https://exa.ai/docs',
    install: { node: 'npm install exa-js', python: 'pip install exa-py' },
    snippet: {
      lang: 'ts',
      code: `const res = await fetch('https://api.exa.ai/search', {
  method: 'POST',
  headers: { 'x-api-key': process.env.EXA_API_KEY!, 'content-type': 'application/json' },
  body: JSON.stringify({ query: 'battery storage startups in Finland', type: 'auto', numResults: 5, contents: { highlights: true } }),
})
const { results } = await res.json()`,
    },
    checkable: true,
    notes: ['The key goes in the `x-api-key` header.', '401 means a wrong key, 402 means the account is out of credits.'],
    // Exa's hosted server works without a key too (rate-limited).
    mcp: { kind: 'http', url: 'https://mcp.exa.ai/mcp', headers: { 'x-api-key': '${EXA_API_KEY}' }, keyless: true },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    site: 'https://openai.com',
    what: 'GPT models, embeddings, speech and image APIs.',
    keys: [{ env: 'OPENAI_API_KEY', label: 'API key', secret: true, placeholder: 'sk-…' }],
    signup: 'https://platform.openai.com/api-keys',
    docs: 'https://platform.openai.com/docs',
    install: { node: 'npm install openai', python: 'pip install openai' },
    snippet: {
      lang: 'ts',
      code: `import OpenAI from 'openai'
const openai = new OpenAI() // reads OPENAI_API_KEY
// Pick a current model from https://platform.openai.com/docs/models
const reply = await openai.responses.create({ model: process.env.OPENAI_MODEL!, input: 'Say hello to the hackathon' })
console.log(reply.output_text)`,
    },
    checkable: true,
    notes: ['Model names change often: check the models page at the event and put the one you use in OPENAI_MODEL.'],
  },
  {
    id: 'featherless',
    name: 'Featherless',
    site: 'https://featherless.ai',
    what: 'Serverless hosting for thousands of open-source models behind an OpenAI-compatible API.',
    keys: [{ env: 'FEATHERLESS_API_KEY', label: 'API key', secret: true }],
    signup: 'https://featherless.ai',
    docs: 'https://featherless.ai/docs',
    install: { node: 'npm install openai', python: 'pip install openai' },
    snippet: {
      lang: 'ts',
      code: `import OpenAI from 'openai'
const featherless = new OpenAI({ baseURL: 'https://api.featherless.ai/v1', apiKey: process.env.FEATHERLESS_API_KEY })
const models = await featherless.models.list() // pick a model id from here
const chat = await featherless.chat.completions.create({ model: '<model id>', messages: [{ role: 'user', content: 'Hello' }] })`,
    },
    checkable: true,
    notes: ['OpenAI-compatible: any OpenAI SDK works with the base URL https://api.featherless.ai/v1.', 'Keys are under the API keys section of your account.'],
  },
  {
    id: 'cloudinary',
    name: 'Cloudinary',
    site: 'https://cloudinary.com',
    what: 'Upload, store, transform and deliver images and video (resizing, AI cropping, background removal…).',
    keys: [
      { env: 'CLOUDINARY_CLOUD_NAME', label: 'Cloud name', secret: false },
      { env: 'CLOUDINARY_API_KEY', label: 'API key', secret: false },
      { env: 'CLOUDINARY_API_SECRET', label: 'API secret', secret: true },
    ],
    signup: 'https://cloudinary.com/users/register_free',
    docs: 'https://cloudinary.com/documentation',
    install: { node: 'npm install cloudinary', python: 'pip install cloudinary' },
    snippet: {
      lang: 'ts',
      code: `import { v2 as cloudinary } from 'cloudinary' // reads CLOUDINARY_URL
const uploaded = await cloudinary.uploader.upload('demo.jpg', { folder: 'hackathon' })
console.log(uploaded.secure_url)`,
    },
    checkable: true,
    notes: [
      'Harness also writes CLOUDINARY_URL (cloudinary://key:secret@cloud), which the SDKs read by themselves.',
      'All three values are on the dashboard under API Keys.',
    ],
    mcp: {
      kind: 'bundled',
      module: '@cloudinary/asset-management-mcp/bin/mcp-server.js',
      args: ['start'],
      env: {
        CLOUDINARY_CLOUD_NAME: '${CLOUDINARY_CLOUD_NAME}',
        CLOUDINARY_API_KEY: '${CLOUDINARY_API_KEY}',
        CLOUDINARY_API_SECRET: '${CLOUDINARY_API_SECRET}',
      },
    },
  },
  {
    id: 'modal',
    name: 'Modal',
    site: 'https://modal.com',
    what: 'Run Python functions on cloud GPUs and CPUs without managing servers: inference, training, batch jobs, web endpoints.',
    keys: [
      { env: 'MODAL_TOKEN_ID', label: 'Token ID', secret: false, placeholder: 'ak-…' },
      { env: 'MODAL_TOKEN_SECRET', label: 'Token secret', secret: true, placeholder: 'as-…' },
    ],
    signup: 'https://modal.com/settings/tokens',
    docs: 'https://modal.com/docs',
    install: { python: 'pip install modal' },
    snippet: {
      lang: 'python',
      code: `import modal

app = modal.App("hackathon-demo")

@app.function(gpu="T4")
def square(x: int) -> int:
    return x * x

@app.local_entrypoint()
def main():
    print(square.remote(7))

# run it: modal run app.py`,
    },
    notes: [
      'The SDK and the `modal` CLI read MODAL_TOKEN_ID and MODAL_TOKEN_SECRET from the environment, so no `modal token set` is needed.',
      'There is no quick key check from Harness: `modal run` tells you straight away.',
    ],
  },
  {
    id: 'aiven',
    name: 'Aiven',
    site: 'https://aiven.io',
    what: 'Managed open-source data services: PostgreSQL, MySQL, Valkey (Redis), Kafka, OpenSearch, ClickHouse.',
    keys: [
      {
        env: 'DATABASE_URL',
        label: 'Service URI (e.g. PostgreSQL)',
        secret: true,
        placeholder: 'postgres://avnadmin:…@….aivencloud.com:12345/defaultdb?sslmode=require',
      },
      { env: 'AIVEN_TOKEN', label: 'API token (optional)', secret: true },
    ],
    signup: 'https://console.aiven.io/signup',
    docs: 'https://aiven.io/docs',
    install: { node: 'npm install pg', python: 'pip install "psycopg[binary]"' },
    snippet: {
      lang: 'python',
      code: `import os, psycopg

with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
    print(conn.execute("select version()").fetchone())`,
    },
    checkable: true,
    notes: [
      'For an app you mostly need the service URI from the service’s Overview page in the console; Harness writes it as DATABASE_URL.',
      'The API token (for creating services from code or the `avn` CLI) is optional; it’s sent as `Authorization: aivenv1 <token>`.',
    ],
  },
  {
    id: 'hostinger',
    name: 'Hostinger',
    site: 'https://www.hostinger.com',
    what: 'Web hosting, VPS and domains, with an API to manage them: a place to put the demo online.',
    keys: [{ env: 'HOSTINGER_API_TOKEN', label: 'API token', secret: true }],
    signup: 'https://hpanel.hostinger.com',
    docs: 'https://developers.hostinger.com',
    snippet: {
      lang: 'bash',
      code: `curl -H "Authorization: Bearer $HOSTINGER_API_TOKEN" https://developers.hostinger.com/api/hosting/v1/websites`,
    },
    checkable: true,
    notes: ['Create the token in hPanel → Dev Tools → API. It is shown only once.'],
    // The npm server takes the API token; the hosted one (mcp.hostinger.com) needs a browser sign-in sessions can't do.
    mcp: { kind: 'bundled', module: 'hostinger-api-mcp/src/servers/all.js', env: { HOSTINGER_API_TOKEN: '${HOSTINGER_API_TOKEN}' } },
  },
  {
    id: 'arduino',
    name: 'Arduino',
    site: 'https://www.arduino.cc',
    what: 'Microcontroller boards and Arduino Cloud for connected devices, for hardware challenges.',
    keys: [
      { env: 'ARDUINO_CLIENT_ID', label: 'Cloud API client ID (optional)', secret: false },
      { env: 'ARDUINO_CLIENT_SECRET', label: 'Cloud API client secret', secret: true },
    ],
    signup: 'https://cloud.arduino.cc',
    docs: 'https://docs.arduino.cc/arduino-cloud/api/arduino-iot-api',
    install: { node: 'npm install @arduino/arduino-iot-client', python: 'pip install arduino-iot-client' },
    snippet: {
      lang: 'bash',
      code: `# Flash a board from the terminal (no IDE needed):
arduino-cli core install arduino:avr
arduino-cli compile --fqbn arduino:avr:uno sketch/
arduino-cli upload  --fqbn arduino:avr:uno -p /dev/cu.usbmodem* sketch/`,
    },
    checkable: true,
    notes: [
      'For boards on the table you need no key: install arduino-cli (macOS `brew install arduino-cli`, Windows `winget install ArduinoSA.CLI`) so Claude can compile and upload.',
      'The Cloud API (devices, properties, dashboards) uses a client ID and secret from Arduino Cloud → API Keys; tokens come from https://api2.arduino.cc/iot/v1/clients/token.',
    ],
  },
  {
    id: 'verda',
    name: 'Verda',
    site: 'https://verda.com',
    what: 'European GPU cloud (formerly DataCrunch): GPU instances, clusters and serverless containers.',
    keys: [
      { env: 'VERDA_CLIENT_ID', label: 'Client ID', secret: false },
      { env: 'VERDA_CLIENT_SECRET', label: 'Client secret', secret: true },
    ],
    signup: 'https://verda.com',
    docs: 'https://docs.verda.com',
    snippet: {
      lang: 'bash',
      code: `# Full API reference: https://api.verda.com/v1/docs
# Python SDK: https://github.com/verda-cloud/sdk-python`,
    },
    checkable: true,
    unverified: true,
    notes: [
      'Credentials come from the console’s Credentials page; the secret is shown once.',
      'The token request Harness uses for the check isn’t confirmed; if the check fails, try the key with the SDK before assuming it’s wrong.',
    ],
  },
  {
    id: 'cala',
    name: 'Cala',
    site: 'https://cala.ai',
    what: 'A verified knowledge graph for AI agents: structured, source-cited facts instead of raw web pages.',
    keys: [{ env: 'CALA_API_KEY', label: 'API key', secret: true }],
    signup: 'https://console.cala.ai',
    snippet: { lang: 'bash', code: `# Endpoints (from the LangChain integration): POST /v1/knowledge/search, POST /v1/knowledge/query, GET /v1/entities` },
    unverified: true,
    notes: [
      'Get the key at console.cala.ai. If the docs don’t give the base URL and auth header, ask the Cala team, then tell Claude.',
      'LangChain has a Cala retriever that reads CALA_API_KEY.',
    ],
  },
]

/** Keys in the order kits declare them, for the .env file. */
export function allPartnerEnvs(kits: PartnerKit[]): string[] {
  return [...new Set(kits.flatMap((k) => k.keys.map((x) => x.env)))]
}

export const ENV_NAME_RE = /^[A-Z][A-Z0-9_]{1,63}$/

/** The kit note Claude reads (challenge/partners/<id>.md). Never contains key values. */
export function kitNote(kit: PartnerKit, ready: string[], docs?: string, mcpUrl?: string): string {
  const lines = [`# ${kit.name}`, '', kit.what, '']
  if (kit.keys.length) {
    lines.push('## Keys (in the project’s .env and every Harness session’s environment)')
    for (const k of kit.keys) lines.push(`- \`${k.env}\`: ${k.label}${ready.includes(k.env) ? ' (set)' : ' (not set yet)'}`)
    if (kit.id === 'cloudinary') lines.push('- `CLOUDINARY_URL`: built from the three above, read by the SDKs')
    lines.push('', 'Read keys from the environment; never hard-code or print them, and never commit .env.', '')
  }
  if (kit.install?.node || kit.install?.python) {
    lines.push('## Install')
    if (kit.install.node) lines.push(`- Node: \`${kit.install.node}\``)
    if (kit.install.python) lines.push(`- Python: \`${kit.install.python}\``)
    lines.push('')
  }
  if (kit.snippet) lines.push('## Minimal example', '', '```' + kit.snippet.lang, kit.snippet.code, '```', '')
  if (kit.mcp || mcpUrl) {
    lines.push(
      '## MCP server',
      `- Harness sessions in this project get the \`mcp__${kit.id}__*\` tools (${mcpUrl ? 'the MCP URL your team added' : kit.mcp?.kind === 'http' ? 'hosted by the partner' : 'bundled with Harness'}) once the keys above are set and Settings › Tools › Partner servers is on.`,
      '',
    )
  }
  if (kit.notes?.length) lines.push('## Notes', ...kit.notes.map((n) => `- ${n}`), '')
  const links = [
    docs && `Docs: ${docs}`,
    kit.docs && kit.docs !== docs && `Docs: ${kit.docs}`,
    kit.signup && `Keys: ${kit.signup}`,
    `Site: ${kit.site}`,
  ].filter(Boolean)
  lines.push('## Links', ...links.map((l) => `- ${l}`))
  if (kit.unverified) lines.push('', '_Some details weren’t publicly confirmed before the event; check the docs before relying on them._')
  return lines.join('\n') + '\n'
}

/** challenge/partners/README.md: which partner APIs are ready to use. */
export function kitIndex(kits: PartnerKit[], ready: string[]): string {
  const withApi = kits.filter((k) => k.keys.length)
  const isReady = (k: PartnerKit) => k.keys.some((x) => ready.includes(x.env))
  const lines = [
    '# Partner APIs',
    '',
    'Written by Harness (Hackathon › Challenges → API keys). Keys live in `.env` (gitignored) and in every Harness session’s environment in this project. One file per service has the env names, how to install and use it, and a minimal example.',
    '',
    '| Partner | Ready | Env vars | Kit |',
    '|---|---|---|---|',
    ...withApi.map((k) => `| ${k.name} | ${isReady(k) ? 'yes' : 'no key yet'} | ${k.keys.map((x) => `\`${x.env}\``).join(', ')} | [${k.id}.md](${k.id}.md) |`),
  ]
  const info = kits.filter((k) => !k.keys.length)
  if (info.length) lines.push('', 'Other partners (no API): ' + info.map((k) => `${k.name} (${k.what})`).join(' '))
  return lines.join('\n') + '\n'
}

/** A line for .env: double-quoted, escaped, single line. */
export function envLine(name: string, value: string): string {
  return `${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`
}

export const ENV_BLOCK_START = '# >>> Harness partner keys (managed by Harness: event mode → Partners)'
export const ENV_BLOCK_END = '# <<< Harness partner keys'

/** Replaces Harness's block in a .env file (or adds it), leaving everything else as it was. */
export function mergeEnvFile(existing: string, values: Record<string, string>, order: string[]): string {
  const start = existing.indexOf(ENV_BLOCK_START)
  const end = existing.indexOf(ENV_BLOCK_END)
  const outside = start >= 0 && end > start ? existing.slice(0, start) + existing.slice(end + ENV_BLOCK_END.length).replace(/^\r?\n/, '') : existing
  const names = [
    ...order.filter((n) => n in values),
    ...Object.keys(values)
      .filter((n) => !order.includes(n))
      .sort(),
  ]
  if (!names.length) {
    if (outside === existing) return existing
    const rest = outside.replace(/\s*$/, '')
    return rest ? `${rest}\n` : ''
  }
  const block = [ENV_BLOCK_START, ...names.map((n) => envLine(n, values[n])), ENV_BLOCK_END].join('\n')
  const base = outside.replace(/\s*$/, '')
  return `${base ? `${base}\n\n` : ''}${block}\n`
}

/** Adds `.env` to a .gitignore's content if nothing there ignores it yet. */
export function ensureEnvIgnored(gitignore: string): string | null {
  const lines = gitignore.split(/\r?\n/).map((l) => l.trim())
  // `.env.*` alone doesn't cover `.env` itself.
  if (lines.some((l) => l === '.env' || l === '.env*' || l === '*.env' || l === '/.env')) return null
  return `${gitignore.replace(/\s*$/, '')}${gitignore.trim() ? '\n' : ''}.env\n`
}

// ---------- adding a key ----------

const fold = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '')

/** The known service a typed name refers to ("exa", "OpenAI", "featherless.ai"), if any. */
export function findKnownKit(name: string): PartnerKit | undefined {
  const f = fold(name)
  if (!f) return undefined
  return PARTNER_KITS.find((k) => k.keys.length && [k.name, k.id].some((n) => fold(n) === f || `${fold(n)}ai` === f))
}

/** A variable name from a service name: "Acme Maps" → ACME_MAPS_API_KEY. */
export function envNameFor(name: string): string | undefined {
  let base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!base) return undefined
  if (/^\d/.test(base)) base = `K_${base}`
  const env = /_(API_KEY|KEY|TOKEN|SECRET)$/.test(base) ? base : `${base}_API_KEY`
  return ENV_NAME_RE.test(env) ? env : undefined
}

/** What Claude found out about a key, from the front matter of challenge/partners/<id>.md. */
export interface PartnerNote {
  status?: string
  name?: string
  env?: string
  docs?: string
  works?: boolean | 'unknown'
  problem?: string
  what?: string
}

/** Reads a note's front matter; null when there is none (or it isn't YAML). */
export function parsePartnerNote(text: string): PartnerNote | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return null
  let fm: unknown
  try {
    fm = YAML.parse(m[1])
  } catch {
    return null
  }
  if (!fm || typeof fm !== 'object') return null
  const o = fm as Record<string, unknown>
  const str = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const docs = str(o.docs, 500)
  return {
    status: str(o.status, 20),
    name: str(o.name, 60),
    env: str(o.env, 64)?.toUpperCase(),
    docs: docs && /^https?:\/\//.test(docs) ? docs : undefined,
    works: o.works === true || o.works === 'true' ? true : o.works === false || o.works === 'false' ? false : o.works === undefined ? undefined : 'unknown',
    problem: str(o.problem),
    what: str(o.what),
  }
}

/** The note Harness leaves for a key Claude hasn't looked into yet. Never contains the key. */
export function pendingNote(kit: PartnerKit): string {
  const env = kit.keys[0]?.env ?? ''
  const title = kit.label ?? kit.name
  return [
    '---',
    'status: pending',
    `name: ${JSON.stringify(title)}`,
    `env: ${env}`,
    '---',
    `# ${title}`,
    '',
    `An API key the team added, in \`${env}\` (the project's .env and every Harness session's environment).`,
    'Harness asks Claude to work out which service it is for and how to use it; Claude replaces this note with what it finds.',
    '',
    'Read the key from the environment; never hard-code or print it, and never commit .env.',
    '',
  ].join('\n')
}

/** What Claude gets asked when a key for an unknown service is added (the key's value is never in it). */
export function partnerResearchPrompt(kit: PartnerKit): string {
  const env = kit.keys[0]?.env ?? 'API_KEY'
  const file = `challenge/partners/${kit.id}.md`
  const labelled = kit.label ? `, labelled "${kit.label}"` : ', without a name'
  const firstChars = 'printf %s "$' + env + '" | cut -c1-4'
  return `A teammate added an API key to this hackathon project. It's in the environment variable ${env} (also in .env at the project root)${labelled}. Work out what it's for and how we can use it.

1. Never print, echo, log or commit the key's value, and don't paste it anywhere. To recognise its format you may look at its first 4 characters only (for example: ${firstChars}).
2. Identify the service from the label, the key's format and web search. If you can't tell, say so in the note.
3. Find the official API docs and how to authenticate (the header or SDK option, and the environment variable the official SDK reads).
4. If the API has a cheap read-only call (list models, account info, one tiny search), make exactly one with the key from the environment to see whether it works. Don't do anything that costs money or changes data.
5. Read challenge/ to see how this API could help with our challenge.
6. Replace ${file} with this front matter, then the notes:

---
status: ready
name: <the service's name>
env: <the variable name its official SDK expects, e.g. EXA_API_KEY; keep ${env} if unsure>
docs: <official docs URL>
works: <true, false or unknown>
problem: <only when works is false: one short line>
what: <one line: what it does and what we'd use it for>
---
## How to use it
The install command and a minimal working example that reads the key from process.env / os.environ (never hard-coded).
## Ideas for our challenge
Two to four concrete ways it could help, based on challenge/.

Keep it short. Harness shows the front matter on the key's card, and if you change env it renames the variable in .env for you.`
}
