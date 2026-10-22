/**
 * End-to-end smoke test: launches the real Electron app (from out/, built by `npm run test:e2e`)
 * against throwaway folders, clicks through event mode, and saves a screenshot per step to
 * test-results/.
 *
 * Isolation: HARNESS_USER_DATA and CLAUDE_CONFIG_DIR point into a temp folder (never the real
 * profile or ~/.claude), ports are random, and Claude is pointed at a dead endpoint with a fake key,
 * so even an accidental session couldn't reach the API. The test also checks that no session ran.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CrewState } from '../src/shared/crew'
import type { RunState } from '../src/shared/run'

const ROOT = resolve(import.meta.dirname, '..')
const SHOTS = join(ROOT, 'test-results')
const randomPort = () => 40000 + Math.floor(Math.random() * 20000)

let app: ElectronApplication
let page: Page
let tmp: string
let userData: string
let claudeDir: string
let eventDir: string
let env: Record<string, string>
let crewProc: ChildProcess | undefined
let crewOut = ''

const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

beforeAll(async () => {
  if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) throw new Error('Build first: npm run test:e2e builds the app before testing.')
  mkdirSync(SHOTS, { recursive: true })
  tmp = mkdtempSync(join(tmpdir(), 'harness-e2e-'))
  userData = join(tmp, 'user-data')
  claudeDir = join(tmp, 'claude')
  eventDir = join(tmp, 'junction-project')
  for (const d of [userData, claudeDir]) mkdirSync(d)

  env = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  // Load the built renderer, not a dev server; run as a real app, not as Node.
  delete env.ELECTRON_RENDERER_URL
  delete env.ELECTRON_RUN_AS_NODE
  Object.assign(env, {
    HARNESS_USER_DATA: userData,
    CLAUDE_CONFIG_DIR: claudeDir,
    HARNESS_RELAY_PORT: String(randomPort()),
    HARNESS_HOOK_PORT: String(randomPort()),
    // No real Claude conversations: a fake key and an endpoint nothing listens on.
    ANTHROPIC_API_KEY: 'e2e-no-real-calls',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    ELEVENLABS_API_KEY: '',
    // impeccable's engine cache: a temp folder, never the real ~/.impeccable.
    IMPECCABLE_HOME: join(tmp, 'impeccable'),
  })

  app = await electron.launch({ executablePath: electronPath as unknown as string, args: [ROOT], cwd: ROOT, env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.setViewportSize({ width: 1440, height: 900 })
}, 60_000)

afterAll(async () => {
  crewProc?.kill('SIGKILL')
  await app?.close()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('Harness (real Electron app)', () => {
  it('runs against the temporary profile, never the real one', async () => {
    const paths = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), claude: process.env.CLAUDE_CONFIG_DIR }))
    expect(paths).toEqual({ userData, claude: claudeDir })
    expect(paths.userData.startsWith(join(homedir(), 'Library', 'Application Support'))).toBe(false)
  })

  it('opens on the team run: Start your team', async () => {
    await expect(page.getByRole('heading', { name: 'Start your team' }).waitFor()).resolves.toBeUndefined()
    await page.getByText('Hosted on this laptop').waitFor()
    await shot('01-start-screen')
  })

  it('opens event mode with ⌘6 / Ctrl+6', async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+6' : 'Control+6')
    await page.getByRole('heading', { name: 'Junction 2026' }).waitFor()
    await page.getByRole('button', { name: /Create or pick a folder/ }).waitFor()
    await shot('02-event-mode')
  })

  it('sets up an event project in a temp folder (folder dialog stubbed)', async () => {
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
    }, eventDir)
    await page.getByRole('button', { name: /Create or pick a folder/ }).click()
    await page.getByText('set up for the event', { exact: false }).waitFor()
    expect(existsSync(join(eventDir, 'challenge', 'event.yaml'))).toBe(true)
    expect(readFileSync(join(eventDir, 'challenge', 'hackforge.yaml'), 'utf8')).toMatch(/challenge:/)
    expect(readFileSync(join(eventDir, '.gitattributes'), 'utf8')).toMatch(/\*\.sh text eol=lf/)
    await shot('03-event-project')
  })

  it('adds a challenge on the Challenges tab', async () => {
    await page.getByRole('button', { name: /^Challenges/ }).click()
    await page.getByRole('button', { name: 'Add one' }).click()
    await page.getByPlaceholder('Partner').fill('Aalto University')
    await page.getByPlaceholder('Challenge title').fill('Smart grids for Espoo')
    await page.getByPlaceholder('Paste the challenge description').fill('Balance the grid with **real** data.')
    await page.getByRole('button', { name: 'Save challenge' }).click()
    await page.getByRole('button', { name: /Smart grids for Espoo/ }).waitFor()
    expect(readFileSync(join(eventDir, 'challenges', 'aalto-university-smart-grids-for-espoo.md'), 'utf8')).toMatch(/partner: Aalto University/)
    await shot('04-challenge-added')
  })

  it('creates a team hosted on this computer', async () => {
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    await page.getByLabel('Your name').fill('Ada')
    await page.getByRole('button', { name: 'Create team' }).click()
    await page.getByText('hosting the relay').waitFor()
    await page.getByRole('button', { name: /Copy join code/ }).waitFor()
    await shot('05-team-hosted')
  })

  it('shows the Crew card, and a teammate joins it from a terminal with harness-crew', async () => {
    const command = await page.locator('code', { hasText: 'npx -y harness-crew HT1.' }).first().innerText()
    const code = /HT1\.[\w-]+/.exec(command)![0]
    // The real CLI (crew/dist, built by test:e2e), with the same throwaway Claude config and fake key.
    crewProc = spawn(
      process.execPath,
      [join(ROOT, 'crew', 'dist', 'cli.mjs'), code, '--name', 'Bea', '--home', join(tmp, 'crew-home'), '--dir', join(tmp, 'crew-projects')],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    crewProc.stdout?.on('data', (d) => (crewOut += d))
    crewProc.stderr?.on('data', (d) => (crewOut += d))
    await page.getByText('Waiting for your project · terminal').waitFor({ timeout: 30_000 })
    expect(crewOut).toMatch(/Joined the team as Bea/)
    await shot('05b-crew-joined')
    crewProc.kill('SIGINT')
  })

  it('creates pitch/ and shows the script editor', async () => {
    await page.getByRole('button', { name: 'Pitch', exact: true }).click()
    await page.getByRole('button', { name: 'Create pitch/' }).click()
    await page.getByText('Saved to pitch/script.json').waitFor()
    expect(existsSync(join(eventDir, 'pitch', 'script.json'))).toBe(true)
    expect(existsSync(join(eventDir, 'pitch', 'src', 'Pitch.tsx'))).toBe(true)
    await shot('06-pitch-editor')
  })

  it('shows the Usage saver in Settings, on by default', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', { id: 'settings' }))
    await page.getByText('Spends your Claude plan where it buys quality').waitFor()
    expect(await page.getByLabel(/Pick the model for each message/).isChecked()).toBe(true)
    expect(await page.getByLabel(/Compact between tasks/).isChecked()).toBe(true)
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.usageSaver).toEqual({ enabled: true, autoModel: true, compact: true, skipGenerated: true, leanOutput: true })
    await shot('07-usage-saver-settings')
  })

  it('shows the built-in design skills in Settings, on by default', async () => {
    const impeccable = page.getByRole('checkbox', { name: /^impeccable/ })
    await impeccable.scrollIntoViewIfNeeded()
    expect(await impeccable.isChecked()).toBe(true)
    await page.getByText(/4\.6\.0 built in/).waitFor()
    await page.getByText(/2\.15\.0 built in/).waitFor()
    const uipro = page.getByRole('checkbox', { name: /^UI\/UX Pro Max/ })
    await uipro.uncheck()
    await expect.poll(async () => (await page.evaluate(() => window.harness.getSettings())).designSkills.uiUxProMax).toBe(false)
    await uipro.check()
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.designSkills).toEqual({ impeccable: true, uiUxProMax: true, quietDetector: true })
    await shot('07b-design-skills')
  })

  it('shows the dev tools in Settings: browser and library docs on, partner servers listed', async () => {
    const browser = page.getByRole('checkbox', { name: /^Browser/ })
    await browser.scrollIntoViewIfNeeded()
    expect(await browser.isChecked()).toBe(true)
    expect(await page.getByRole('checkbox', { name: /^Library docs/ }).isChecked()).toBe(true)
    expect(await page.getByRole('checkbox', { name: /^Partner servers/ }).isChecked()).toBe(true)
    // Exa's hosted server works without a key, so it is ready straight away.
    await page.getByText('Exa · ready').waitFor()
    const state = await page.evaluate(() => window.harness.devToolsState())
    expect(state.docs).toEqual({ status: 'ready', keyed: false })
    expect(state.partners.map((p) => p.id)).toEqual(expect.arrayContaining(['exa', 'cloudinary', 'hostinger']))
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.devTools).toEqual({ browser: true, showBrowser: false, docs: true, partnerServers: true })
    await shot('07c-dev-tools')
    await page.keyboard.press('Escape')
  })

  it('shows partner kits and writes their notes into the event project', async () => {
    await page.getByText('Spends your Claude plan where it buys quality').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Partner APIs/ }).click()
    await page.locator('[data-kit="exa"]').waitFor()
    expect(await page.locator('[data-kit]').count()).toBeGreaterThanOrEqual(10)
    await expect.poll(() => existsSync(join(eventDir, 'challenge', 'partners', 'README.md')), { timeout: 5000 }).toBe(true)
    expect(readFileSync(join(eventDir, 'challenge', 'partners', 'exa.md'), 'utf8')).toMatch(/EXA_API_KEY/)
    await shot('08-partner-apis')
  })

  it('opens usage history with ⌘7 / Ctrl+7', async () => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+7' : 'Control+7')
    await page.getByText('Tokens per day, by model').waitFor()
    await shot('09-usage')
    await page.keyboard.press('Escape')
  })

  it('team run: a teammate joins from a terminal, then the project gets its challenge, files and private files', async () => {
    await page
      .getByRole('button', { name: /Team run|Start the team/ })
      .first()
      .click()
    await page.getByRole('heading', { name: 'Get everyone in' }).waitFor()
    const command = await page.locator('code', { hasText: 'npx -y harness-crew HT1.' }).first().innerText()
    const code = /HT1\.[\w-]+/.exec(command)![0]
    crewOut = ''
    crewProc = spawn(
      process.execPath,
      [join(ROOT, 'crew', 'dist', 'cli.mjs'), code, '--name', 'Cy', '--home', join(tmp, 'crew-home-2'), '--dir', join(tmp, 'crew-projects-2')],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    crewProc.stdout?.on('data', (d) => (crewOut += d))
    crewProc.stderr?.on('data', (d) => (crewOut += d))
    await page.getByText('Cy', { exact: true }).waitFor({ timeout: 30_000 })
    await shot('10-team-run-joined')

    await page.getByRole('button', { name: /^Continue with/ }).click()
    await page.getByRole('heading', { name: 'Create the project' }).waitFor()
    const parent = join(tmp, 'hackathons')
    mkdirSync(parent)
    await page.getByPlaceholder('e.g. Grid Pulse').fill('Grid Pulse')
    await page.getByPlaceholder('Choose a folder…').fill(parent)
    await page.getByRole('button', { name: 'Create project' }).click()
    await page.getByRole('heading', { name: 'Grid Pulse' }).waitFor()
    const dir = join(parent, 'grid-pulse')
    expect(readFileSync(join(dir, 'challenge', 'hackforge.yaml'), 'utf8')).toMatch(/checkpoints: \[plan\]/)
    expect(await page.getByRole('button', { name: /Continue: plan it/ }).isDisabled()).toBe(true)

    await page.getByPlaceholder(/Paste the challenge here/).fill('# Smart grids\n\nBalance the Espoo grid with real data. Judged on impact and demo.')
    await page.getByRole('heading', { name: 'Grid Pulse' }).click()
    await expect.poll(() => readFileSync(join(dir, 'challenge', 'brief', 'CHALLENGE.md'), 'utf8')).toMatch(/Balance the Espoo grid/)

    const data = join(tmp, 'prices.csv')
    const secret = join(tmp, 'matches.csv')
    writeFileSync(data, 'hour,price\n1,3.2\n')
    writeFileSync(secret, 'player,x,y\n')
    const pick = (file: string) =>
      app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [f] })) as typeof dialog.showOpenDialog
      }, file)
    await pick(data)
    await page.getByRole('button', { name: 'Add…' }).nth(1).click()
    await page.getByText('prices.csv').waitFor()
    await pick(secret)
    await page.getByRole('button', { name: 'Add…' }).nth(2).click()
    await page.getByText('Guard on: blocked for Claude, kept out of git').waitFor()
    expect(existsSync(join(dir, 'challenge', 'assets', 'prices.csv'))).toBe(true)
    expect(JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8')).permissions.deny).toContain('Read(./private/**)')
    expect(await page.getByRole('button', { name: /Continue: plan it/ }).isEnabled()).toBe(true)
    // The crew gets the project through the team server (the event project is now this one).
    const crew = await page.evaluate(() => window.harness.crewState())
    expect(crew.members.map((m) => m.name)).toContain('Cy')
    await shot('11-team-run-setup')
    crewProc.kill('SIGINT')
  })

  it('renders the plan, the run board and the end (states pushed as the run would)', async () => {
    const dir = join(tmp, 'hackathons', 'grid-pulse')
    // A plan as HackForge writes it.
    for (const f of ['DECISION.md', 'PLAN.md']) cpSync(join(ROOT, 'test', 'fixtures', 'hackforge-project', '.hackforge', f), join(dir, '.hackforge', f))
    const base = await page.evaluate(() => window.harness.runState())
    const now = Date.now()
    const push = (channel: string, state: unknown) =>
      app.evaluate(({ BrowserWindow }, [c, s]) => BrowserWindow.getAllWindows()[0].webContents.send(c as string, s), [channel, state])
    const plan: RunState = {
      ...base,
      stage: 'plan',
      step: 'plan-ready',
      sessionId: 'lead',
      sessionLive: true,
      lead: { status: 'idle', lastText: 'The plan is ready: 3 milestones.' },
    }
    await push('run:push', plan)
    await page.getByRole('button', { name: /Accept and run/ }).waitFor()
    await page.getByText('Milestones', { exact: true }).waitFor()
    await shot('12-team-run-plan')

    const member = (id: string, name: string, headroom: number, current?: { id: string; title: string; activity: string }) => ({
      id,
      name,
      online: true,
      app: 'cli' as const,
      version: '0.2.0',
      accepting: true,
      headroom,
      usage: { source: 'plan' as const },
      queued: 0,
      waiting: false,
      current: current && { ...current, since: now - 12 * 60_000 },
    })
    const crew: CrewState = {
      available: true,
      members: [
        member('a', 'Anna', 78, { id: 'm-1', title: 'M2 M2.1 (backend)', activity: 'Bash: npm test' }),
        member('b', 'Ben', 54, { id: 'm-2', title: 'M2 M2.2 (frontend)', activity: 'Edit: src/app/page.tsx' }),
        member('c', 'Cy', 31),
      ],
      missions: [],
      asks: [{ id: 'q1', mission: 'm-2', tool: 'Bash', summary: 'docker compose up -d', at: now - 60_000, fromId: 'b', fromName: 'Ben' }],
      messages: [],
      autoReports: true,
    } as unknown as CrewState
    await push('crew:push', crew)
    const running: RunState = {
      ...plan,
      stage: 'run',
      step: 'building',
      startedAt: now - 3 * 3600_000,
      current: 'M2',
      lead: { status: 'running', activity: 'Task: build M2.3 (data pipeline)' },
      milestones: [
        {
          id: 'M1',
          goal: 'Walking skeleton: request → forecast → chart',
          status: 'done',
          startedAt: now - 3 * 3600_000,
          endedAt: now - 3600_000,
          budgetMs: 7 * 3600_000,
          fixRounds: 0,
        },
        { id: 'M2', goal: 'Live prices and the balancing suggestion', status: 'building', startedAt: now - 40 * 60_000, budgetMs: 7 * 3600_000, fixRounds: 0 },
        { id: 'M3', goal: 'Demo polish and the pitch path', status: 'todo', budgetMs: 7 * 3600_000, fixRounds: 0 },
      ],
      tasks: [
        { id: 'M1.1', milestone: 'M1', owned: ['api/**'], assignee: { kind: 'crew', id: 'a', name: 'Anna', mission: 'm-0' }, state: 'done', attempts: 0 },
        {
          id: 'M2.1',
          milestone: 'M2',
          role: 'backend',
          owned: ['api/prices/**'],
          assignee: { kind: 'crew', id: 'a', name: 'Anna', mission: 'm-1' },
          state: 'working',
          attempts: 0,
        },
        {
          id: 'M2.2',
          milestone: 'M2',
          role: 'frontend',
          owned: ['src/app/**'],
          assignee: { kind: 'crew', id: 'b', name: 'Ben', mission: 'm-2' },
          state: 'working',
          attempts: 0,
        },
        {
          id: 'M2.3',
          milestone: 'M2',
          role: 'data',
          owned: ['pipeline/**'],
          assignee: { kind: 'lead' },
          state: 'working',
          attempts: 1,
          note: "Cy's Claude failed; given to your Claude.",
        },
      ],
      inbox: [
        {
          id: 'd1',
          kind: 'decision',
          from: 'Your Claude',
          title: 'Fingrid’s live API needs a key we don’t have. Use the hourly CSV export instead?',
          suggestion: 'Yes: the CSV is updated hourly, which is enough for the demo, and needs no key.',
          options: ['Use the CSV', 'Wait for a key'],
          at: now - 120_000,
        },
      ],
      log: [
        { at: now - 3 * 3600_000, text: 'Run started: 3 milestones, about 7 h each, 3 crew ready.', tone: 'good' },
        { at: now - 3600_000, text: 'M1 is done (2 h).', tone: 'good' },
        { at: now - 40 * 60_000, text: 'M2 started: M2.1 → Anna, M2.2 → Ben, M2.3 → Cy.' },
        { at: now - 10 * 60_000, text: "M2.3 goes to your Claude: Cy's Claude failed.", tone: 'warn' },
      ],
    }
    await push('run:push', running)
    await page.getByText('Fingrid’s live API needs a key').waitFor()
    await page.getByText('docker compose up -d').waitFor()
    await shot('13-team-run-board')

    await push('run:push', { ...running, stage: 'done', step: 'idle', inbox: [], done: { at: now, reason: 'Loop ended: plateau' } })
    await page.getByRole('heading', { name: 'Done' }).waitFor()
    await shot('14-team-run-done')
    // Back to the real state.
    await push('run:push', base)
    await push('crew:push', await page.evaluate(() => window.harness.crewState()))
  })

  it('never started a Claude session', async () => {
    const history = await page.evaluate(() => window.harness.listHistory())
    expect(history).toEqual([])
  })
})
