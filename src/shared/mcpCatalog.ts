/**
 * ECC's catalog of MCP servers (mcp-configs/mcp-servers.json) as tools you can add to a project:
 * Project › Keys lists them, the ones you add are recorded in the project, and sessions in it get
 * them with their keys filled in from the project's API keys. Placeholders such as
 * YOUR_FIRECRAWL_KEY_HERE become variables (FIRECRAWL_API_KEY), so no key is ever written into a file.
 */

export type CatalogConfig =
  | { type: 'stdio'; command: string; args: string[]; env: Record<string, string> }
  | { type: 'http'; url: string; headers: Record<string, string> }

export interface CatalogServer {
  id: string
  description: string
  /** The config with ${VAR} where the catalog had a placeholder. */
  config: CatalogConfig
  /** The variables it needs (from the project's API keys). */
  needs: string[]
}

export interface CatalogEntry extends CatalogServer {
  added: boolean
  /** Needed variables that have no key yet. */
  missing: string[]
}

/** Harness gives every session these already, or they need a program you install yourself. */
const SKIP = new Set(['playwright', 'context7', 'filesystem'])
/** Only servers that start from a package (npx, uvx) or a URL: nothing that needs a local build or path. */
const RUNNERS = new Set(['npx', 'uvx'])
const PLACEHOLDER = /YOUR_([A-Z0-9_]+?)(?:_HERE)?\b/g
const PATHLIKE = /(^|\s|=)(\/path\/|\/absolute\/|~\/)/

const VAR_OK = /^[A-Z][A-Z0-9_]*$/

/** "YOUR_FIRECRAWL_KEY_HERE" in env FIRECRAWL_API_KEY → FIRECRAWL_API_KEY; "YOUR_PROJECT_REF" in supabase's args → SUPABASE_PROJECT_REF. */
function variableFor(token: string, serverId: string, envKey?: string): string {
  if (envKey && VAR_OK.test(envKey)) return envKey
  const prefix = serverId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return token.startsWith(prefix) ? token : `${prefix}_${token}`
}

/** Reads ECC's catalog; keeps the servers Harness can run as they are, with placeholders turned into variables. */
export function parseCatalog(raw: unknown): CatalogServer[] {
  const servers = (raw as { mcpServers?: Record<string, unknown> } | null)?.mcpServers
  if (!servers || typeof servers !== 'object') return []
  const out: CatalogServer[] = []
  for (const [id, value] of Object.entries(servers)) {
    if (SKIP.has(id) || !/^[a-z0-9-]+$/.test(id) || !value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    const description = typeof v.description === 'string' ? v.description.trim() : ''
    const needs = new Set<string>()
    const fill = (s: string, envKey?: string) =>
      s.replace(PLACEHOLDER, (_m, token: string) => {
        const name = variableFor(token, id, envKey)
        needs.add(name)
        return `\${${name}}`
      })
    if (v.type === 'http' && typeof v.url === 'string') {
      // A local URL is a program you run yourself.
      if (!/^https:\/\//.test(v.url)) continue
      const headers: Record<string, string> = {}
      for (const [k, h] of Object.entries((v.headers as Record<string, unknown>) ?? {})) if (typeof h === 'string') headers[k] = fill(h)
      out.push({ id, description, config: { type: 'http', url: fill(v.url), headers }, needs: [...needs] })
      continue
    }
    if (typeof v.command !== 'string' || !RUNNERS.has(v.command)) continue
    const args = Array.isArray(v.args) ? v.args.filter((a): a is string => typeof a === 'string') : []
    if (args.some((a) => PATHLIKE.test(a))) continue
    const env: Record<string, string> = {}
    for (const [k, e] of Object.entries((v.env as Record<string, unknown>) ?? {})) if (typeof e === 'string') env[k] = fill(e, k)
    out.push({ id, description, config: { type: 'stdio', command: v.command, args: args.map((a) => fill(a)), env }, needs: [...needs] })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

const expand = (s: string, values: Record<string, string>) => s.replace(/\$\{([A-Z0-9_]+)\}/g, (_m, k: string) => values[k] ?? '')

/** A catalog server ready for a session, or what it still needs. */
export function resolveCatalogServer(s: CatalogServer, values: Record<string, string>): CatalogConfig | { missing: string[] } {
  const missing = s.needs.filter((n) => !values[n])
  if (missing.length) return { missing }
  if (s.config.type === 'http') {
    return { type: 'http', url: expand(s.config.url, values), headers: Object.fromEntries(Object.entries(s.config.headers).map(([k, v]) => [k, expand(v, values)])) }
  }
  return {
    type: 'stdio',
    command: s.config.command,
    args: s.config.args.map((a) => expand(a, values)),
    env: Object.fromEntries(Object.entries(s.config.env).map(([k, v]) => [k, expand(v, values)])),
  }
}
