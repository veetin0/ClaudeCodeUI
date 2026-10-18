/**
 * End-to-end smoke test: launches the real Electron app (from out/, built by `npm run test:e2e`)
 * against throwaway folders, clicks through event mode, and saves a screenshot per step to
 * test-results/.
 *
 * Isolation: HARNESS_USER_DATA and CLAUDE_CONFIG_DIR point into a temp folder (never the real
 * profile or ~/.claude), ports are random, and Claude is pointed at a dead endpoint with a fake key,
 * so even an accidental session couldn't reach the API. The test also checks that no session ran.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const SHOTS = join(ROOT, 'test-results')
const randomPort = () => 40000 + Math.floor(Math.random() * 20000)

let app: ElectronApplication
let page: Page
let tmp: string
let userData: string
let claudeDir: string
let eventDir: string

const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

beforeAll(async () => {
  if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) throw new Error('Build first: npm run test:e2e builds the app before testing.')
  mkdirSync(SHOTS, { recursive: true })
  tmp = mkdtempSync(join(tmpdir(), 'harness-e2e-'))
  userData = join(tmp, 'user-data')
  claudeDir = join(tmp, 'claude')
  eventDir = join(tmp, 'junction-project')
  for (const d of [userData, claudeDir]) mkdirSync(d)

  const env: Record<string, string> = {}
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
  await app?.close()
  if (tmp) rmSync(tmp, { recursive: true, force: true })
})

describe('Harness (real Electron app)', () => {
  it('runs against the temporary profile, never the real one', async () => {
    const paths = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), claude: process.env.CLAUDE_CONFIG_DIR }))
    expect(paths).toEqual({ userData, claude: claudeDir })
    expect(paths.userData.startsWith(join(homedir(), 'Library', 'Application Support'))).toBe(false)
  })

  it('loads the start screen', async () => {
    await expect(page.getByRole('heading', { name: 'Run Claude Code. Watch it work.' }).waitFor()).resolves.toBeUndefined()
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

  it('never started a Claude session', async () => {
    const history = await page.evaluate(() => window.harness.listHistory())
    expect(history).toEqual([])
  })
})
