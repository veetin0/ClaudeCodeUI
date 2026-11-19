/**
 * Developer tools Harness gives sessions (Settings › Tools):
 * - Browser (Playwright MCP, bundled with Harness): Claude opens the running app, clicks through the
 *   main flow, reads console errors and saves screenshots (ECC's evaluator scores builds with it).
 * - Library docs (Context7, hosted): current, version-specific docs for any library or SDK, so Claude
 *   looks up an SDK it hasn't seen instead of guessing its API.
 * - Service servers: a service's own MCP server, added to sessions in the current project once its
 *   key is set under Project › Keys (or its MCP URL pasted there).
 * - Reverse engineering (REA, installed on demand, off by default): Claude works out how existing
 *   software works (a service's site or HAR capture → its API, an SDK shipped as a bundle, DLL or
 *   APK, a binary, firmware, a packet capture) and cites the evidence. It runs on the user's own
 *   Node: Electron's is older than REA needs.
 * Claude Code defers MCP tool definitions until a tool is needed, so tools you don't use cost little context.
 */
export interface DevToolsSettings {
  browser: boolean
  /** Show the browser window while Claude uses it (off: headless). */
  showBrowser: boolean
  docs: boolean
  partnerServers: boolean
  /** Reverse engineering with REA. */
  rea: boolean
  /** Claude works in an open Blender (the community MCP for Blender). */
  blender: boolean
}

export const DEFAULT_DEV_TOOLS: DevToolsSettings = { browser: true, showBrowser: false, docs: true, partnerServers: true, rea: false, blender: false }

/** MCP server names sessions see (tools are mcp__<name>__<tool>). The browser is named like Playwright's own
 * server, so agents that list mcp__playwright__* tools (ECC's evaluator) can use it. */
export const BROWSER_SERVER = 'playwright'
export const DOCS_SERVER = 'context7'
export const REA_SERVER = 'rea'
export const BLENDER_SERVER = 'blender'

/**
 * MCP for Blender's tools that only look (at the scene, the add-on, or asset search results): they
 * run without asking. Running Python in Blender, importing assets, AI model generation (paid
 * services) and the telemetry tools ask first.
 */
export const BLENDER_READ_TOOLS = ['get_addon_status', 'get_scene_info', 'look', 'search_assets']

export interface BlenderInfo {
  /**
   * 'off': the live connection is off (Blender may still be found, for scripted renders).
   * 'external': MCP for Blender is already in the user's Claude Code config, so sessions use that.
   */
  status: 'off' | 'needs-blender' | 'needs-uv' | 'needs-addon' | 'installing' | 'ready' | 'external' | 'failed'
  blender?: { path: string; version?: string }
  uvx?: string
  /** A Blender with the add-on is open, so Claude can work in it now. */
  live?: boolean
  error?: string
}

/** The REA release Harness installs: one exact version, as REA's docs ask of a lasting registration. */
export const REA_VERSION = '6.8.0'
/** The Node versions REA supports (its package.json engines: ^22.23.4 || ^24.22.1 || >=26.12.1). */
export const REA_NODE = '22.23.4+ or 24.22.1+'

/** Whether a Node version (e.g. "v24.22.1") can run REA. */
export function nodeRunsRea(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  if (!m) return false
  const [maj, min, pat] = m.slice(1).map(Number)
  const atLeast = (minor: number, patch: number) => min > minor || (min === minor && pat >= patch)
  if (maj === 22) return atLeast(23, 4)
  if (maj === 24) return atLeast(22, 1)
  if (maj === 26) return atLeast(12, 1)
  return maj > 26 // 23 and 25 aren't supported
}

/**
 * REA tools that only read, so they run without a permission prompt: not marked destructive, not
 * writing files (export_/import_) or settings, and either working on what's already open (the
 * evidence, a binary, a bundle) or reading a local file you name. Everything else asks first:
 * running the target (process, Electron and browser scenarios), live browsers, phones (adb),
 * debuggers and Frida, extraction.
 */
const REA_LOCAL_READS = new Set([
  'analyze_javascript_application',
  'inspect_web_network_capture',
  'inspect_artifact',
  'inspect_asset_catalog',
  'open_binary',
  'binary_session',
  'inspect_binary_layout',
  'inspect_with_objdump',
  'inspect_wasm_artifact',
  'inspect_android_package',
  'search_android_classes',
  'inspect_android_class',
  'inspect_android_method',
  'trace_android_references',
  'inspect_packet_capture',
  'inspect_packet_fields',
  'decode_signal_recording',
  'inspect_firmware_regions',
  'inspect_sqlite_database',
  'inspect_recorded_crash',
  'inspect_evm_interface',
  'inspect_macho',
  'inspect_plist',
  'inspect_signature',
  'list_architectures',
  'demangle_swift',
  'trace_web_module_imports',
  'trace_web_source_location',
])

export interface ReaTool {
  name: string
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean }
}

export function reaRunsWithoutAsking(t: ReaTool): boolean {
  const a = t.annotations ?? {}
  if (a.destructiveHint) return false
  if (/^(export|import)_/.test(t.name) || t.name === 'update_analysis_settings') return false
  return !a.openWorldHint || REA_LOCAL_READS.has(t.name)
}

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

export interface ReaInfo {
  /**
   * 'external': REA is already in the user's Claude Code config, so sessions use that one.
   * 'needs-node': no Node, or one older than REA supports. 'not-installed': ready to install.
   */
  status: 'off' | 'needs-node' | 'not-installed' | 'installing' | 'ready' | 'external' | 'failed'
  /** The Node version found ("v24.22.1"), if any. */
  node?: string
  version?: string
  error?: string
}

export interface DevToolsState {
  browser: BrowserInfo
  docs: { status: 'off' | 'ready'; keyed: boolean }
  partners: PartnerServerInfo[]
  rea: ReaInfo
  blender: BlenderInfo
  /** Service servers only load in the current project (where the keys are). */
  project?: string
}

/** Appended to the system prompt: when to reach for each tool. */
export function devToolsGuide(on: { browser: boolean; docs: boolean; partners: { id: string; name: string }[]; rea?: boolean; blender?: boolean }): string | undefined {
  if (!on.browser && !on.docs && !on.partners.length && !on.rea && !on.blender) return undefined
  const lines = ['# Dev tools (Harness)']
  if (on.browser) {
    lines.push(
      `- Browser (mcp__${BROWSER_SERVER}__*): check UI work in a real browser. Open the running app (the dev server's localhost URL or the Preview's URL), click through the main flow, read console errors, and take screenshots. Give screenshots you keep (for the README, the promo video or a review) an explicit filename under docs/screenshots/. Close the browser when you're done.`,
    )
  }
  if (on.docs) {
    lines.push(
      `- Library docs (mcp__${DOCS_SERVER}__*): before writing code against a library or SDK you haven't used in this session, especially a service's SDK or anything released recently, look up its current docs with Context7 instead of guessing the API.`,
    )
  }
  if (on.partners.length) {
    lines.push(
      `- Service servers (${on.partners.map((p) => `mcp__${p.id}__* for ${p.name}`).join(', ')}): the services' own tools. Use them for that service's work; reading and searching is fine, but ask before anything that changes the account (deploys, deletes, DNS, billing).`,
    )
  }
  if (on.rea) {
    lines.push(
      `- Reverse engineering (mcp__${REA_SERVER}__*, REA): to learn how existing software works, with evidence. A service's website or a saved HAR capture of it gives its real API (endpoints, payloads); an SDK shipped only as a bundle, DLL or APK shows how it's called; a reference app shows how a feature is built; a binary, firmware image or packet capture can be analysed. Use it only on software the owner allows you to analyse (your own builds, apps and sites you have permission for), never on files in private/. Start with static analysis; running the target asks first. Quote REA's evidence and its stated limits in what you write down.`,
    )
  }
  if (on.blender) {
    lines.push(
      `- Blender (mcp__${BLENDER_SERVER}__*, MCP for Blender): build and adjust 3D objects and scenes in the user's open Blender window, for the product, the promo video or a 3D clip. If the tools say Blender isn't connected, ask the user to open it (Harness: Settings › Tools › Blender › Open Blender). Check your work with look after each change. When a model is right, export it as .glb into assets/ (named top-level parts, real scale in metres, Y-up) and keep a script that rebuilds it, as the craft playbook says. Running code in Blender asks first; asset imports and AI model generation may need the user's API keys and also ask.`,
    )
  }
  return lines.join('\n')
}
