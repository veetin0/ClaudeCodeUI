// The real Harness UI, screenshotted state by state at 3840×2160 (1920×1080 UI pixels at 2×), plus
// the rectangles of everything Forge lands on and, for the two fields Forge types into (your name,
// the challenge), the field at each step of the text going in. Launches the built app (npm run
// build) under a throwaway profile, drives the team run with real IPC where it can (project,
// challenge, files) and pushes run/team/crew states where a real run would need Claude.
//   xvfb-run -a -s "-screen 0 3900x2300x24" node capture_ui.mjs
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { _electron as electron } from 'playwright-core'

const HERE = resolve(import.meta.dirname)
const ROOT = resolve(HERE, '..', '..')
const OUT = join(HERE, 'build', 'ui')
const require = createRequire(join(ROOT, 'package.json'))
const electronPath = require('electron')
mkdirSync(OUT, { recursive: true })

const tmp = mkdtempSync(join(tmpdir(), 'forge-ui-'))
const env = { ...process.env, HARNESS_USER_DATA: join(tmp, 'user-data'), CLAUDE_CONFIG_DIR: join(tmp, 'claude'), ANTHROPIC_API_KEY: 'no-real-calls', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9', HARNESS_RELAY_PORT: '47811', HARNESS_HOOK_PORT: '47812' }
delete env.ELECTRON_RENDERER_URL
delete env.ELECTRON_RUN_AS_NODE

const app = await electron.launch({ executablePath: electronPath, args: [ROOT], cwd: ROOT, env })
const page = await app.firstWindow()
await page.waitForLoadState('domcontentloaded')
// 1920×1080 of UI drawn at 2× (Chrome's device scale, not zoom: the layout stays the app's own).
// Dark theme: the UI glows like a screen in the dark studio.
await app.evaluate(({ BrowserWindow, nativeTheme }) => {
  nativeTheme.themeSource = 'dark'
  BrowserWindow.getAllWindows()[0].setContentSize(1920, 1080)
})
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 2, mobile: false })
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
await page.waitForTimeout(800)

const push = (channel, state) => app.evaluate(({ BrowserWindow }, [c, s]) => BrowserWindow.getAllWindows()[0].webContents.send(c, s), [channel, state])
const now = Date.now()
const layout = {}
const typing = {}

/** Rectangles (UI pixels) of the named elements, found by a selector or by button text. */
async function rects(spec) {
  return page.evaluate((spec) => {
    const out = {}
    const r = (el) => {
      if (!el) return null
      const b = el.getBoundingClientRect()
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
    }
    for (const [name, q] of Object.entries(spec)) {
      let el = null
      if (q.css) el = document.querySelector(q.css)
      if (q.button) el = [...document.querySelectorAll('button')].find((b) => new RegExp(q.button).test(b.textContent.trim()))
      if (q.title) el = [...document.querySelectorAll('[title]')].find((b) => b.getAttribute('title').startsWith(q.title))
      if (q.text) el = [...document.querySelectorAll(q.tag ?? '*')].find((b) => b.childElementCount === 0 && new RegExp(q.text).test(b.textContent.trim()))
      if (el && q.up) for (let i = 0; i < q.up; i++) el = el.parentElement
      out[name] = r(el)
    }
    return out
  }, spec)
}

async function grab(file, clip = { x: 0, y: 0, w: 1920, h: 1080 }) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } })
  writeFileSync(file, Buffer.from(data, 'base64'))
}

async function shot(name, spec = {}, wait = 500) {
  await page.waitForTimeout(wait)
  await grab(join(OUT, `${name}.png`))
  layout[name] = await rects(spec)
  const missing = Object.entries(layout[name]).filter(([, v]) => !v).map(([k]) => k)
  console.log(`${name}${missing.length ? `  (missing: ${missing.join(', ')})` : ''}`)
}

/** The field at each step of `text` going in, without a caret (the film draws the typing). */
async function typeSteps(state, target, field, text, n) {
  await page.addStyleTag({ content: '* { caret-color: transparent !important }' })
  const box = await field.boundingBox()
  const clip = { x: Math.floor(box.x) - 2, y: Math.floor(box.y) - 2, w: Math.ceil(box.width) + 4, h: Math.ceil(box.height) + 4 }
  const dir = join(OUT, `${state}.type`)
  mkdirSync(dir, { recursive: true })
  const steps = []
  for (let k = 1; k <= n; k++) {
    await field.fill(text.slice(0, Math.round((text.length * k) / n)))
    await field.evaluate((el) => (el.scrollTop = 0))
    await page.waitForTimeout(80)
    const file = `${String(k).padStart(2, '0')}.png`
    await grab(join(dir, file), clip)
    steps.push(`build/ui/${state}.type/${file}`)
  }
  typing[state] = { target, clip, steps }
  console.log(`  typing on ${state}: ${n} steps`)
}

// ---------- the people ----------
const member = (id, name, headroom, current) => ({
  id,
  name,
  online: true,
  app: 'cli',
  version: '0.2.0',
  accepting: true,
  headroom,
  usage: { source: 'plan' },
  queued: 0,
  waiting: false,
  current: current && { ...current, since: now - 9 * 60_000 },
})
const joinCommand = 'npx -y harness-crew HT1.eyJ1IjoiaHR0cHM6Ly9oYXJuZXNzLXJlbGF5Lm9ucmVuZGVyLmNvbSIsInQiOiJqdW5jdGlvbi0yMDI2In0'
const crew = (members) => ({ available: true, members, missions: [], asks: [], messages: [], autoReports: true, joinCommand })
const team = { config: { relayUrl: 'https://harness-relay.onrender.com', token: 'junction-2026-forge-film', memberId: 'veeti', memberName: 'Veeti', hosting: false }, connected: true, members: [], myUsage: { source: 'plan', fiveHour: { pct: 18 } }, conflicts: [], handoffs: [] }

// ---------- 1. Team ----------
await page.getByRole('heading', { name: 'Start your team' }).waitFor()
const nameField = page.getByPlaceholder('e.g. Veeti')
await shot('team_start', { name: { css: 'input[placeholder="e.g. Veeti"]' }, start: { button: '^Start$' } })
await typeSteps('team_start', 'name', nameField, 'Veeti', 5)
await shot('team_named', { start: { button: '^Start$' } })

await push('team:push', team)
await push('crew:push', crew([]))
await page.getByRole('heading', { name: 'Get everyone in' }).waitFor()
await shot('team_waiting', { copy: { button: 'Copy' }, command: { css: 'main code' }, continue: { button: '^Continue' } })
await push('crew:push', crew([member('a', 'Anna', 82)]))
await shot('team_one', { continue: { button: '^Continue' } })
await push('crew:push', crew([member('a', 'Anna', 82), member('b', 'Ben', 64), member('c', 'Cy', 71)]))
await shot('team_ready', { continue: { button: '^Continue' }, teamCard: { text: '^Team$', up: 3 } })

// ---------- 2. Setup (real project, real files) ----------
const parent = join(tmp, 'hackathons')
mkdirSync(parent, { recursive: true })
await page.evaluate((p) => window.harness.runCreateProject({ name: 'Grid Pulse', parent: p, deadline: new Date(Date.now() + 38 * 3600_000).toISOString(), plan: 'pro' }), parent)
await page.getByRole('heading', { name: 'Grid Pulse' }).waitFor()
await push('team:push', team)
const CHALLENGE = '# Smart grids for Espoo\n\nHelp households shift their electricity use to the cheapest, cleanest hours. Judged on impact, tech and demo.'
await shot('setup_empty', { challenge: { css: 'textarea' }, files: { text: '^Drop files or folders here$', up: 2 }, private: { text: '^Drop private files here$', up: 2 }, continue: { button: 'Continue: plan it' } })
await typeSteps('setup_empty', 'challenge', page.locator('textarea').first(), CHALLENGE, 12)
await page.evaluate((c) => window.harness.runSetChallenge(c), CHALLENGE)
await shot('setup_typed', { files: { text: '^Drop files or folders here$', up: 2 }, private: { text: '^Drop private files here$', up: 2 }, continue: { button: 'Continue: plan it' } })

const src = join(tmp, 'organisers')
mkdirSync(src, { recursive: true })
const files = { 'rules.pdf': '%PDF-1.4 rules', 'grid-prices-2025.csv': 'hour,price\n', 'brand-kit.zip': 'zip', 'smart-meter-sample.json': '{}' , 'household-meters.csv': 'id\n' }
for (const [f, body] of Object.entries(files)) writeFileSync(join(src, f), body)
await page.evaluate(([s]) => window.harness.runAddFiles('challenge', [`${s}/rules.pdf`]), [src])
await page.evaluate(([s]) => window.harness.runAddFiles('files', [`${s}/grid-prices-2025.csv`, `${s}/smart-meter-sample.json`, `${s}/brand-kit.zip`]), [src])
await page.evaluate(([s]) => window.harness.runAddFiles('private', [`${s}/household-meters.csv`]), [src])
// The Setup screen reads the files when the project changes: nudge it with a fresh state.
const real = await page.evaluate(() => window.harness.runState())
await push('run:push', { ...real, project: { ...real.project, dir: real.project.dir + '/' } })
await push('run:push', real)
await page.getByText('Guard on: blocked for Claude, kept out of git').waitFor()
await push('team:push', team)
await shot('setup_ready', { challenge: { css: 'textarea' }, files: { text: '^Drop files or folders here$', up: 2 }, continue: { button: 'Continue: plan it' } })

// ---------- 3. Plan ----------
const dir = real.project.dir
mkdirSync(join(dir, '.hackforge'), { recursive: true })
writeFileSync(
  join(dir, '.hackforge', 'DECISION.md'),
  `# Decision: Grid Pulse\nA household app that moves flexible electricity use (dishwasher, EV charging, heating boosts) to the cheapest, cleanest hours, from live Fingrid and Nord Pool prices. It shows each family what they saved and how much CO₂ they avoided.\n\n**Why:** it uses the partner's real data, the demo is one tap, and impact is measurable in euros and grams.\n`,
)
writeFileSync(
  join(dir, '.hackforge', 'PLAN.md'),
  `# Plan\n\nTime budget: 38 h · Team: 4 · Profile: lean\n\n## Milestones (vertical slices)\n| M | Goal | Covers | Acceptance checks (runnable) | Time-box | Status |\n|---|------|--------|------------------------------|----------|--------|\n| M1 | Live prices → cheapest hours → one screen | D1, J1 | \`npm test\` | 8 h | ⬜ |\n| M2 | Schedule devices and show savings | J1, J2 | \`npm run e2e\` | 10 h | ⬜ |\n| M3 | Demo polish, CO₂ view and the pitch path | D2, J3 | \`./gate.sh\` | 8 h | ⬜ |\n`,
)
const planState = { ...real, stage: 'plan', step: 'plan-ready', sessionId: 'lead', sessionLive: true, lead: { status: 'idle', lastText: 'The plan is ready: 3 milestones. Accept it and Harness splits the work across the team.' }, inbox: [], next: 'Review the plan: accept it to start the run, or ask for changes.' }
await push('run:push', planState)
await page.getByRole('button', { name: /Accept and run/ }).waitFor()
await page.getByText('Milestones', { exact: true }).waitFor()
await push('team:push', team)
await push('crew:push', crew([member('a', 'Anna', 82), member('b', 'Ben', 64), member('c', 'Cy', 71)]))
await shot('plan', { accept: { button: 'Accept and run' }, decision: { text: '^Grid Pulse$', tag: 'h2', up: 2 } })

// ---------- 4. Run ----------
const M = [
  { id: 'M1', goal: 'Live prices → cheapest hours → one screen' },
  { id: 'M2', goal: 'Schedule devices and show savings' },
  { id: 'M3', goal: 'Demo polish, CO₂ view and the pitch path' },
]
const H = 3600_000
function runState(done, current, extra = {}) {
  const milestones = M.map((m, i) => ({
    ...m,
    status: i < done ? 'done' : m.id === current ? 'building' : 'todo',
    startedAt: i < done ? now - (done - i + 1) * 2 * H : m.id === current ? now - 35 * 60_000 : undefined,
    endedAt: i < done ? now - (done - i) * 2 * H : undefined,
    budgetMs: 9 * H,
    fixRounds: 0,
  }))
  const roles = [
    ['backend', 'api/prices/**', 'Anna'],
    ['frontend', 'src/app/**', 'Ben'],
    ['data', 'pipeline/**', 'Cy'],
  ]
  const tasks = M.flatMap((m, i) =>
    roles.map(([role, owned, name], k) => ({
      id: `${m.id}.${k + 1}`,
      milestone: m.id,
      role,
      owned: [owned],
      assignee: k === 2 && i === 2 ? { kind: 'lead' } : { kind: 'crew', id: name[0].toLowerCase(), name, mission: `m-${i}${k}` },
      state: i < done ? 'done' : 'working',
      attempts: 0,
      note: i < done ? `2 commits on crew/${name.toLowerCase()}/m-${i}${k}` : undefined,
    })),
  )
  return {
    ...planState,
    stage: 'run',
    step: current ? 'building' : 'finishing',
    current,
    startedAt: now - 7 * H,
    lead: { status: 'running', activity: current ? `Task: integrate ${current}` : 'Skill: hackforge:pitch' },
    milestones,
    tasks,
    log: [
      { at: now - 7 * H, text: 'Run started: 3 milestones, about 9 h each, 3 crew ready.', tone: 'good' },
      ...milestones.filter((m) => m.status === 'done').map((m) => ({ at: m.endedAt, text: `${m.id} is done (2 h).`, tone: 'good' })),
      ...(current ? [{ at: now - 35 * 60_000, text: `${current} started: ${current}.1 → Anna, ${current}.2 → Ben, ${current}.3 → Cy.` }] : []),
    ],
    next: current ? `Building ${current}.` : 'Your Claude is writing the pitch, verifying and improving.',
    ...extra,
  }
}
const busy = (cur) =>
  crew([
    member('a', 'Anna', 78, { id: 'm1', title: `${cur} ${cur}.1 (backend)`, activity: 'Bash: npm test' }),
    member('b', 'Ben', 58, { id: 'm2', title: `${cur} ${cur}.2 (frontend)`, activity: 'Edit: src/app/page.tsx' }),
    member('c', 'Cy', 66, { id: 'm3', title: `${cur} ${cur}.3 (data)`, activity: 'Write: pipeline/prices.py' }),
  ])
const timeline = { m1: { title: 'M1:' }, m2: { title: 'M2:' }, m3: { title: 'M3:' }, finish: { title: 'Pitch, final' } }
for (const [name, done, cur] of [
  ['run_m1', 0, 'M1'],
  ['run_m2', 1, 'M2'],
  ['run_m3', 2, 'M3'],
  ['run_finish', 3, undefined],
]) {
  await push('crew:push', cur ? busy(cur) : crew([member('a', 'Anna', 61), member('b', 'Ben', 44), member('c', 'Cy', 52)]))
  await push('run:push', runState(done, cur))
  await push('team:push', team)
  await page.getByText('What happened').waitFor()
  await shot(name, timeline)
}

// ---------- 5. Done ----------
await push('run:push', { ...runState(3, undefined), stage: 'done', step: 'idle', done: { at: now, reason: 'Loop ended: target score reached' }, next: 'Done. Check VERIFY.md and submit.' })
await page.getByRole('heading', { name: 'Done' }).waitFor()
await shot('done', { trophy: { css: 'main .lucide-trophy', up: 1 }, title: { text: '^Done$', tag: 'h1' } })

writeFileSync(join(HERE, 'build', 'ui_layout.json'), JSON.stringify({ px: [1920, 1080], scale: 2, states: layout, typing }, null, 2))
console.log(`→ ${OUT} and build/ui_layout.json`)
await app.close()
rmSync(tmp, { recursive: true, force: true })
