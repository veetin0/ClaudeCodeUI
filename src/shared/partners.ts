/**
 * Partner kits for Junction 2026: for each partner with an API, the key(s) it needs, the
 * environment variable names, install commands, a minimal working call and the docs. Paste a key
 * in event mode → Partners and Harness writes it to the project's .env (gitignored), passes it to
 * every session in the project, can share it with the team (encrypted), and writes a kit note to
 * challenge/partners/ that HackForge and Claude read.
 *
 * Researched in October 2026. Details that couldn't be confirmed from public sources are marked
 * `unverified`; check those at the event.
 */

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
  /** Added by the team (an API that turned up at the event). */
  custom?: boolean
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

/** What the Partners tab shows. Key values never leave the main process; only masked previews. */
export interface PartnersState {
  kits: PartnerKit[]
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
const reply = await openai.responses.create({ model: process.env.OPENAI_MODEL!, input: 'Say hello to Junction' })
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
const uploaded = await cloudinary.uploader.upload('demo.jpg', { folder: 'junction' })
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

app = modal.App("junction-demo")

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
    what: 'Microcontroller boards and Arduino Cloud for connected devices. Junction 2026 has a whole floor of hardware challenges.',
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
      'Get the key at console.cala.ai. The base URL and auth header weren’t public before the event: ask at their booth, then tell Claude.',
      'LangChain has a Cala retriever that reads CALA_API_KEY.',
    ],
  },
  ...['ironshard.ai|IRONSHARD', 'atach.dev|ATACH', 'craci.com|CRACI', 'qualiastudios.dev|QUALIA'].map((s): PartnerKit => {
    const [domain, env] = s.split('|')
    return {
      id: domain.split('.')[0],
      name: domain,
      site: `https://${domain}`,
      what: 'Junction 2026 partner. No public API documentation turned up before the event.',
      keys: [{ env: `${env}_API_KEY`, label: 'API key (if they give you one)', secret: true }],
      unverified: true,
      notes: ['If they offer an API at the event, paste the key here and their docs link below: Harness puts both where Claude finds them.'],
    }
  }),
  {
    id: 'aalto',
    name: 'Aalto University',
    site: 'https://www.aalto.fi',
    what: 'Junction’s home university and a challenge partner: expect research problems and datasets rather than an API.',
    keys: [],
  },
  {
    id: 'lifeline',
    name: 'Lifeline Ventures',
    site: 'https://lifelineventures.com',
    what: 'Early-stage venture capital fund: no API. Worth a sharp business case in the pitch.',
    keys: [],
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
    'Written by Harness (Hackathon › Challenges → Partner APIs). Keys live in `.env` (gitignored) and in every Harness session’s environment in this project. One file per partner has the env names, install command and a minimal example.',
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
