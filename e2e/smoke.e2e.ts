/**
 * End-to-end smoke test: launches the real Electron app (from out/, built by `npm run test:e2e`)
 * against throwaway folders, clicks through Home, the Project place (Promo and Keys) and Settings,
 * and saves a screenshot per step to test-results/.
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
let projectDir: string
let env: Record<string, string>

const shot = (name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`) })

beforeAll(async () => {
  if (!existsSync(join(ROOT, 'out', 'main', 'index.js'))) throw new Error('Build first: npm run test:e2e builds the app before testing.')
  mkdirSync(SHOTS, { recursive: true })
  tmp = mkdtempSync(join(tmpdir(), 'harness-e2e-'))
  userData = join(tmp, 'user-data')
  claudeDir = join(tmp, 'claude')
  projectDir = join(tmp, 'orbit')
  for (const d of [userData, claudeDir, projectDir]) mkdirSync(d)

  env = {}
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v
  // Load the built renderer, not a dev server; run as a real app, not as Node.
  delete env.ELECTRON_RENDERER_URL
  delete env.ELECTRON_RUN_AS_NODE
  Object.assign(env, {
    HARNESS_USER_DATA: userData,
    CLAUDE_CONFIG_DIR: claudeDir,
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
  const key = (k: string) => page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+${k}`)

  it('runs against the temporary profile, never the real one', async () => {
    const paths = await app.evaluate(({ app }) => ({ userData: app.getPath('userData'), claude: process.env.CLAUDE_CONFIG_DIR }))
    expect(paths).toEqual({ userData, claude: claudeDir })
    expect(paths.userData.startsWith(join(homedir(), 'Library', 'Application Support'))).toBe(false)
  })

  it('opens on Home: What do you want to build?', async () => {
    await page.getByRole('heading', { name: 'What do you want to build?' }).waitFor()
    await shot('01-home')
  })

  it('opens the Project place with ⌘4 / Ctrl+4, with no project yet', async () => {
    await key('4')
    await page.getByRole('heading', { name: 'No project yet' }).waitFor()
    await shot('02-no-project')
  })

  it('uses a folder as the project (folder dialog stubbed)', async () => {
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as typeof dialog.showOpenDialog
    }, projectDir)
    await page.getByRole('button', { name: 'Use a folder…' }).click()
    await page.getByRole('tab', { name: 'Build' }).waitFor()
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.project).toBe(projectDir)
    expect(saved).not.toHaveProperty('eventProject')
    await shot('03-project')
  })

  it('makes a narrated slide video in promo/ and shows the script editor', async () => {
    await page.getByRole('tab', { name: 'Promo' }).click()
    await page.getByRole('heading', { name: /What kind of promo video/ }).waitFor()
    await page.locator('[data-style="slides"]').getByRole('button', { name: 'Use this style' }).click()
    await page.getByText('Saved to promo/script.json').waitFor()
    expect(JSON.parse(readFileSync(join(projectDir, 'promo', 'script.json'), 'utf8'))).toMatchObject({ title: 'orbit', targetSeconds: 90 })
    expect(existsSync(join(projectDir, 'promo', 'src', 'Pitch.tsx'))).toBe(true)
    await page.getByRole('heading', { name: 'Presentation deck (PDF)' }).waitFor()
    await shot('04-promo-editor')
  })

  it('shows the Keys tab, writing the services index into the project', async () => {
    await page.getByRole('tab', { name: 'Keys' }).click()
    await page.getByRole('heading', { name: 'API keys' }).waitFor()
    await expect.poll(() => existsSync(join(projectDir, '.harness', 'services', 'README.md')), { timeout: 5000 }).toBe(true)
    expect(readFileSync(join(projectDir, '.harness', 'services', 'README.md'), 'utf8')).toMatch(/Project › Keys/)
    await shot('05-keys')
  })

  it('shows the Usage saver in Settings, on by default', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:command', { id: 'settings' }))
    await page.getByRole('tab', { name: 'Advanced' }).click()
    await page.getByText('Spends your Claude plan where it buys quality').waitFor()
    expect(await page.getByLabel(/Pick the model for each message/).isChecked()).toBe(true)
    expect(await page.getByLabel(/Compact between tasks/).isChecked()).toBe(true)
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.usageSaver).toEqual({ enabled: true, autoModel: true, compact: true, skipGenerated: true, leanOutput: true })
    await page.getByText('Show sessions from your terminal').waitFor()
    await shot('06-advanced-settings')
  })

  it('shows ECC built in, on with the standard hook profile', async () => {
    await page.getByRole('tab', { name: 'Tools' }).click()
    const ecc = page.getByRole('switch', { name: 'ECC', exact: true })
    await ecc.waitFor()
    expect(await ecc.getAttribute('aria-checked')).toBe('true')
    await page.getByText(/agents, \d+ skills and \d+ commands/).waitFor()
    await page.getByRole('button', { name: 'Options' }).first().click()
    expect(await page.getByLabel('ECC hook profile').inputValue()).toBe('standard')
    const info = await page.evaluate(() => window.harness.eccInfo())
    expect(info.plugin.source).toBe('builtin')
    expect(info.counts.agents).toBeGreaterThan(50)
    await shot('07-ecc')
  })

  it('shows the built-in design skills in Settings, on by default', async () => {
    const impeccable = page.getByRole('switch', { name: 'impeccable', exact: true })
    await impeccable.scrollIntoViewIfNeeded()
    expect(await impeccable.getAttribute('aria-checked')).toBe('true')
    const uipro = page.getByRole('switch', { name: 'UI/UX Pro Max', exact: true })
    await uipro.click()
    await expect.poll(async () => (await page.evaluate(() => window.harness.getSettings())).designSkills.uiUxProMax).toBe(false)
    await uipro.click()
    await expect.poll(async () => (await page.evaluate(() => window.harness.getSettings())).designSkills.uiUxProMax).toBe(true)
    const saved = await page.evaluate(() => window.harness.getSettings())
    expect(saved.designSkills).toEqual({ impeccable: true, uiUxProMax: true, quietDetector: true })
    await shot('08-design-skills')
  })

  it('shows the dev tools in Settings: browser, library docs and service servers on', async () => {
    const browser = page.getByRole('switch', { name: 'Browser', exact: true })
    await browser.scrollIntoViewIfNeeded()
    expect(await browser.getAttribute('aria-checked')).toBe('true')
    expect(await page.getByRole('switch', { name: 'Library docs', exact: true }).getAttribute('aria-checked')).toBe('true')
    expect(await page.getByRole('switch', { name: 'Service servers', exact: true }).getAttribute('aria-checked')).toBe('true')
    const state = await page.evaluate(() => window.harness.devToolsState())
    expect(state.docs).toEqual({ status: 'ready', keyed: false })
    expect(state.project).toBe(projectDir)
    // A service's server joins once you add its key in Project › Keys; none yet.
    expect(state.partners).toEqual([])
    await shot('09-dev-tools')
    await page.keyboard.press('Escape')
  })

  it('opens usage history with ⌘5 / Ctrl+5', async () => {
    await page.getByText('Spends your Claude plan where it buys quality').waitFor({ state: 'detached' })
    await key('5')
    await page.getByText('Tokens per day, by model').waitFor()
    await shot('10-usage')
    await page.keyboard.press('Escape')
  })

  it('has nothing left of the hackathon mode', async () => {
    await page.keyboard.press('Escape')
    const text = await page.locator('body').innerText()
    expect(text).not.toMatch(/hackathon|hackforge|team run|\bcrew\b/i)
  })

  it('never started a Claude session', async () => {
    const history = await page.evaluate(() => window.harness.listHistory())
    expect(history).toEqual([])
  })
})
