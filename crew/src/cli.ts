#!/usr/bin/env node
/**
 * harness-crew: lend your Claude to a teammate's project from a terminal, no app needed.
 *
 *   npx harness-crew <join code>
 *
 * Joins the team's relay, clones the driver's project, and runs the missions the driver's Claude
 * hands out, one at a time, each in a fresh Claude Code session on your own plan and its own branch,
 * then pushes the branch and reports back. Leave it open; Ctrl+C stops it.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, userInfo } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { emitKeypressEvents } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { designGuide } from '@shared/design'
import { DEFAULT_DESIGN_SKILLS } from '@shared/design'
import { parseJoinCode, type TeamConfig } from '@shared/team'
import { AgentService } from '../../src/main/agent/AgentService'
import { CrewWorker } from '../../src/main/crew/CrewWorker'
import { DesignService } from '../../src/main/design/DesignService'
import { DevToolsService, PLAYWRIGHT_CLI, PLAYWRIGHT_MCP } from '../../src/main/devtools/DevToolsService'
import { EventBus } from '../../src/main/events/bus'
import { builtinPlugin, choosePlugin, installedPlugin } from '../../src/main/hackforge/plugin'
import { agentEnv } from '../../src/main/system/agentEnv'
import { newMemberId, TeamService, type TeamKeys } from '../../src/main/team/TeamService'
import { c, fail, info, ok, printEvent, say, warn } from './terminal'

// The SDK warns that allowlisted tools skip the permission callback: that's intended here (crew tools,
// docs lookups and web search run without asking), and it would clutter the teammate's terminal.
process.removeAllListeners('warning')
process.on('warning', (w: Error & { code?: string }) => {
  if (w.code !== 'CLAUDE_SDK_CAN_USE_TOOL_SHADOWED') process.stderr.write(`${w.name}: ${w.message}\n`)
})

const here = dirname(fileURLToPath(import.meta.url))
const nodeRequire = createRequire(import.meta.url)
const VERSION = (JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version: string }).version

const HELP = `harness-crew ${VERSION}: lend your Claude to your team's project

  npx harness-crew <join code>     join the team and start taking missions
  npx harness-crew                 rejoin the last team
  npx harness-crew leave           leave the team and forget it
  npx harness-crew get-browser     download Chromium for browser checks (no Chrome/Edge here)

Options
  --name <name>     your name on the team board (default: git user.name)
  --dir <folder>    where the project is cloned (default: ~/harness-crew)
  --home <folder>   where harness-crew keeps its settings (default: ~/.harness-crew)
  --no-browser      don't let Claude open the app in a browser

What it needs: Node 20+, git with access to the team's repository, and a Claude
login (it asks you to sign in the first time). Missions run on your own Claude
plan, on their own branch; the team lead's Claude merges them.`

interface Saved {
  team?: TeamConfig
  memberId?: string
  name?: string
}

function args(argv: string[]) {
  const out: { code?: string; name?: string; dir?: string; home?: string; command?: string; help?: boolean; version?: boolean; noBrowser?: boolean } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--version' || a === '-v') out.version = true
    else if (a === '--name') out.name = argv[++i]
    else if (a === '--dir') out.dir = argv[++i]
    else if (a === '--home') out.home = argv[++i]
    else if (a === '--no-browser') out.noBrowser = true
    else if (a.startsWith('HT1.') || a.includes('HT1.')) out.code = a
    else if (!a.startsWith('-')) out.command = a
  }
  return out
}

/** The Claude Code binary the Agent SDK ships for this platform, else `claude` on PATH. */
function findClaude(): string | undefined {
  const plat = process.platform
  const names = [
    `@anthropic-ai/claude-agent-sdk-${plat}-${process.arch}`,
    ...(plat === 'linux' ? [`@anthropic-ai/claude-agent-sdk-${plat}-${process.arch}-musl`] : []),
  ]
  for (const n of names) {
    try {
      const bin = join(dirname(nodeRequire.resolve(`${n}/package.json`)), plat === 'win32' ? 'claude.exe' : 'claude')
      if (existsSync(bin)) return bin
    } catch {
      // not installed for this platform
    }
  }
  try {
    const out = execFileSync(plat === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out.split(/\r?\n/)[0]?.trim() || undefined
  } catch {
    return undefined
  }
}

function claudeAuth(bin: string): { loggedIn: boolean; method?: string } {
  try {
    const out = execFileSync(bin, ['auth', 'status', '--json'], {
      encoding: 'utf8',
      timeout: 20_000,
      env: agentEnv() as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const j = JSON.parse(out) as { loggedIn?: boolean; authMethod?: string; apiKeySource?: string }
    return { loggedIn: j.loggedIn === true, method: j.apiKeySource ? 'api_key' : j.authMethod }
  } catch {
    return { loggedIn: false }
  }
}

const gitName = () => {
  try {
    return execFileSync('git', ['config', '--global', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

async function main() {
  const a = args(process.argv.slice(2))
  if (a.help) return say(HELP)
  if (a.version) return say(VERSION)

  const home = resolve(a.home ?? process.env.HARNESS_CREW_HOME ?? join(homedir(), '.harness-crew'))
  const projects = resolve(a.dir ?? join(homedir(), 'harness-crew'))
  const configFile = join(home, 'config.json')
  mkdirSync(home, { recursive: true })
  let saved: Saved = {}
  try {
    saved = JSON.parse(readFileSync(configFile, 'utf8')) as Saved
  } catch {
    // first run
  }
  const save = () => writeFileSync(configFile, JSON.stringify(saved, null, 2))
  saved.memberId ??= newMemberId()

  say(`${c.bold('harness-crew')} ${c.dim(VERSION)}  ${c.dim('lend your Claude to the team')}`)

  // The browser Claude checks frontend work in: the teammate's Chrome or Edge, else a Chromium
  // downloaded once into the settings folder. Same Playwright tools as in Harness.
  const devTools = new DevToolsService({
    appPath: here,
    dataDir: home,
    settings: () => ({ browser: !a.noBrowser, showBrowser: false, docs: true, partnerServers: false }),
    context7Key: () => process.env.CONTEXT7_API_KEY,
    partnerServers: () => [],
    eventProject: () => undefined,
    push: () => {},
    node: { command: process.execPath, env: {} },
    appName: 'harness-crew',
    resolveModule: (rel) => {
      const mcpDir = dirname(nodeRequire.resolve('@playwright/mcp/package.json'))
      if (rel === PLAYWRIGHT_MCP) return join(mcpDir, 'cli.js')
      if (rel === PLAYWRIGHT_CLI) return join(dirname(createRequire(join(mcpDir, 'package.json')).resolve('playwright-core/package.json')), 'cli.js')
      return join(here, '..', 'node_modules', rel)
    },
  })

  if (a.command === 'get-browser') {
    if (devTools.browser().status === 'ready') return ok(`Browser: ${devTools.browser().via} is already here, nothing to download.`)
    info('Downloading Chromium for browser checks (about 150 MB, once)…')
    const b = (await devTools.installBrowser()).browser
    return b.status === 'ready' ? ok(`Browser ready: ${b.via}`) : fail(`Couldn't download Chromium: ${b.error ?? 'unknown error'}`)
  }

  if (a.command === 'leave') {
    if (!saved.team) return say('Not in a team.')
    const team = new TeamService(teamDeps())
    await team.leave()
    saved.team = undefined
    save()
    return ok('Left the team.')
  }

  // ---------- checks ----------
  const major = Number(process.versions.node.split('.')[0])
  if (major < 18) return fail(`Node ${process.versions.node} is too old: install Node 20 or newer from nodejs.org.`)
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0)
    return fail('git is not installed: get it from git-scm.com (Windows: Git for Windows, which also brings Git Bash).')
  const claude = findClaude()
  if (!claude) return fail('Claude Code was not found. Reinstall with: npx harness-crew@latest')
  let auth = claudeAuth(claude)
  if (!auth.loggedIn) {
    if (!process.stdin.isTTY) return fail(`Not signed in to Claude. Run ${claude} auth login, then start harness-crew again.`)
    say()
    say(`Sign in to Claude with your own account (Pro or Max). A browser window opens:`)
    spawnSync(claude, ['auth', 'login'], { stdio: 'inherit', env: agentEnv() as NodeJS.ProcessEnv })
    auth = claudeAuth(claude)
    if (!auth.loggedIn) return fail('Still not signed in. Start harness-crew again to retry.')
  }
  ok(`Claude: signed in${auth.method === 'api_key' ? ' (API key: billed per token)' : ''}`)
  const browser = devTools.browser()
  if (browser.status === 'ready') ok(`Browser: ${browser.via} (Claude opens the app in it to check frontend work)`)
  else if (browser.status === 'missing')
    warn('No Chrome or Edge found, so frontend work isn’t checked in a browser here. Fix it once with: npx -y harness-crew get-browser')

  // ---------- the team ----------
  const name = (a.name ?? saved.name ?? (gitName().split(/\s+/)[0] || userInfo().username || 'Crew')).slice(0, 40)
  saved.name = name
  let teamKeys: Record<string, string> = {}
  let worker: CrewWorker | undefined
  const bus = new EventBus()

  function teamDeps(): ConstructorParameters<typeof TeamService>[0] {
    return {
      getConfig: () => saved.team ?? null,
      setConfig: (cfg) => {
        saved.team = cfg ?? undefined
        save()
      },
      memberId: () => saved.memberId!,
      usesApiKey: () => !!process.env.ANTHROPIC_API_KEY,
      planUsage: () => agents.planUsage(),
      projectDir: () => worker?.status().repo?.dir,
      hackforge: async () => undefined,
      push: () => {},
      onTeamKeys: (keys: TeamKeys) => {
        teamKeys = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, v.value]))
      },
      crew: worker ? { payload: () => worker!.payload(), received: (e) => worker!.received(e), fast: () => worker!.fast() } : undefined,
    }
  }

  // ---------- sessions ----------
  const app = join(here)
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
  const hackforge = () => choosePlugin(builtinPlugin(app), installedPlugin(claudeDir))
  const design = new DesignService({ appPath: app, claudeDir, settings: () => DEFAULT_DESIGN_SKILLS, push: () => {} })
  const builderRules = (dir: string) => {
    const p = hackforge()
    if (!existsSync(join(dir, '.hackforge')) || !p.path) return undefined
    try {
      return readFileSync(join(p.path, 'agents', 'builder.md'), 'utf8')
        .replace(/^---[\s\S]*?---\s*/, '')
        .replaceAll('${CLAUDE_PLUGIN_ROOT}', p.path)
        .trim()
    } catch {
      return undefined
    }
  }
  // eslint-disable-next-line prefer-const
  let team: TeamService
  const agents: AgentService = new AgentService({
    bus,
    getEnv: () => agentEnv(),
    claudeExecutablePath: claude,
    promptAppend: (cwd) => {
      const loaded = design.plugins().filter((p) => p.source === 'builtin' || p.source === 'installed')
      return [
        designGuide({ impeccable: loaded.some((p) => p.key === 'impeccable'), uiUxProMax: loaded.some((p) => p.key === 'uiUxProMax') }),
        devTools.guide(cwd),
      ]
        .filter(Boolean)
        .join('\n\n')
    },
    plugins: () => {
      const p = hackforge()
      return [...(p.source === 'builtin' && p.path ? [{ type: 'local' as const, path: p.path }] : []), ...design.sdkPlugins()]
    },
    mcp: (cwd) => ({ servers: devTools.mcpServers(cwd), allow: devTools.allowedTools() }),
    extraEnv: () => ({ ...design.env(), ...teamKeys }),
    onRateLimit: (info) => {
      team?.onRateLimit(info)
      worker?.onRateLimit(info)
    },
    teamRadar: (abs) => team?.radarFor(abs),
  })

  let authCheckedAt = Date.now()
  worker = new CrewWorker({
    me: () => (saved.team ? { id: saved.team.memberId, name: saved.team.memberName } : null),
    agents,
    bus,
    home: projects,
    app: 'cli',
    version: VERSION,
    interactiveGit: !!process.stdin.isTTY,
    nudge: () => team?.nudge(),
    stateFile: join(home, `missions-${saved.memberId}.json`),
    builderRules,
    preflight: async () => {
      // Signed out since (expired login)? Say so instead of failing every mission.
      if (Date.now() - authCheckedAt < 5 * 60_000) return undefined
      authCheckedAt = Date.now()
      return claudeAuth(claude).loggedIn ? undefined : `Claude on ${name}'s laptop is signed out: run ${claude} auth login.`
    },
    onEvent: (e) => printEvent(e, () => worker?.status().driver ?? 'the lead'),
    onSession: (s, dir) => team?.setLocal({ sessions: s ? [s] : [], cwd: dir }),
  })
  team = new TeamService(teamDeps())

  if (a.code) {
    const parsed = parseJoinCode(a.code)
    if (!parsed) return fail('That is not a valid join code (it starts with HT1.). Copy it again from the lead’s Team board.')
    try {
      await team.join(a.code, name)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  } else if (!saved.team) {
    say()
    return say(HELP)
  }
  save()
  ok(`Joined the team as ${c.bold(saved.team!.memberName)} ${c.dim(`(change it with --name)`)}`)
  info('Waiting for the lead. Leave this window open: missions start by themselves. Ctrl+C stops.')
  team.start()

  // ---------- keys: y/n for approvals, p to pause, Ctrl+C to stop ----------
  let stopping = false
  const stop = async () => {
    if (stopping) {
      say(c.dim('Quitting now.'))
      process.exit(130)
    }
    stopping = true
    say()
    info('Stopping: pushing any work in progress and telling the lead…')
    await worker!.shutdown()
    for (let i = 0; i < 3; i++) await team.sync()
    worker!.close()
    team.dispose()
    ok('Stopped. Run npx harness-crew again to rejoin.')
    process.exit(0)
  }
  process.on('SIGINT', () => void stop())
  process.on('SIGTERM', () => void stop())
  if (process.stdin.isTTY) {
    emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)
    process.stdin.on('keypress', (_s: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') return void stop()
      const ask = worker!.pendingAsks()[0]
      if (ask && (key.name === 'y' || key.name === 'n')) return worker!.answer(ask.id, key.name === 'y', 'you')
      if (key.name === 'p') {
        worker!.accepting = !worker!.accepting
        team.nudge()
        return info(worker!.accepting ? 'Taking missions again.' : 'Paused: no new missions until you press p again (the current one carries on).')
      }
      if (key.name === 's') {
        const st = worker!.status()
        return say(
          c.dim(
            `lead: ${st.driver ?? 'not connected yet'} · project: ${st.repo?.dir ?? 'not cloned yet'} · ${st.running ? `working on ${st.running.id}` : 'idle'} · ${st.queued} queued · ${st.done} finished${st.problem ? ` · problem: ${st.problem}` : ''}`,
          ),
        )
      }
    })
    say(c.dim('  keys: s status · p pause/resume · Ctrl+C stop'))
  }
  let lastUsage = ''
  setInterval(() => {
    const u = team.state().myUsage
    const line = u.fiveHour ? `5 h window ${Math.round(u.fiveHour.pct)}% used${u.sevenDay ? `, week ${Math.round(u.sevenDay.pct)}%` : ''}` : ''
    if (line && line !== lastUsage) {
      lastUsage = line
      say(c.dim(`  Claude plan: ${line}`))
    }
    const st = team.state()
    if (!st.connected && st.error) warn(st.error)
  }, 60_000).unref()
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
})
