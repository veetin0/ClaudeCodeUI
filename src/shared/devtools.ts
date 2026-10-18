/**
 * Developer tools Harness gives sessions (Settings → Dev tools):
 * - Browser (Playwright MCP, bundled with Harness): Claude opens the running app, clicks through the
 *   demo path, reads console errors and saves screenshots (HackForge's verifier keeps them as evidence).
 * - Library docs (Context7, hosted): current, version-specific docs for any library or SDK, so Claude
 *   looks up an SDK it hasn't seen (a partner's, at a hackathon) instead of guessing its API.
 * - Partner servers: a partner's own MCP server, added to sessions in the event project once its key
 *   is set on the Partners tab (or its MCP URL pasted there at the event).
 * Claude Code defers MCP tool definitions until a tool is needed, so tools you don't use cost little context.
 */
export interface DevToolsSettings {
  browser: boolean
  /** Show the browser window while Claude uses it (off: headless). */
  showBrowser: boolean
  docs: boolean
  partnerServers: boolean
}

export const DEFAULT_DEV_TOOLS: DevToolsSettings = { browser: true, showBrowser: false, docs: true, partnerServers: true }

/** MCP server names sessions see (tools are mcp__<name>__<tool>). */
export const BROWSER_SERVER = 'browser'
export const DOCS_SERVER = 'context7'

export interface BrowserInfo {
  /** 'missing': no Chrome, Edge or downloaded Chromium on this computer. */
  status: 'off' | 'ready' | 'missing' | 'installing' | 'failed'
  /** Which browser it drives. */
  via?: string
  path?: string
  error?: string
}

export interface PartnerServerInfo {
  /** Kit id, also the MCP server name. */
  id: string
  name: string
  /** 'needs-key': the kit's keys aren't all set yet. */
  status: 'ready' | 'needs-key'
  /** Hosted by the partner, or bundled with Harness. */
  hosting: 'hosted' | 'bundled' | 'event-url'
}

export interface DevToolsState {
  browser: BrowserInfo
  docs: { status: 'off' | 'ready'; keyed: boolean }
  partners: PartnerServerInfo[]
  /** Partner servers only load in the event project (where the keys are). */
  eventProject?: string
}

/** Appended to the system prompt: when to reach for each tool. */
export function devToolsGuide(on: { browser: boolean; docs: boolean; partners: { id: string; name: string }[] }): string | undefined {
  if (!on.browser && !on.docs && !on.partners.length) return undefined
  const lines = ['# Dev tools (Harness)']
  if (on.browser) {
    lines.push(
      `- Browser (mcp__${BROWSER_SERVER}__*): check UI work in a real browser. Open the running app (the dev server's localhost URL or the Preview's URL), click through the main flow, read console errors, and take screenshots. Give screenshots meant as evidence or for the pitch an explicit filename under .hackforge/evidence/. Close the browser when you're done.`,
    )
  }
  if (on.docs) {
    lines.push(
      `- Library docs (mcp__${DOCS_SERVER}__*): before writing code against a library or SDK you haven't used in this session, especially a partner's SDK or anything released recently, look up its current docs with Context7 instead of guessing the API.`,
    )
  }
  if (on.partners.length) {
    lines.push(
      `- Partner servers (${on.partners.map((p) => `mcp__${p.id}__* for ${p.name}`).join(', ')}): the partners' own tools. Use them for that partner's work; reading and searching is fine, but ask before anything that changes the partner account (deploys, deletes, DNS, billing).`,
    )
  }
  return lines.join('\n')
}
