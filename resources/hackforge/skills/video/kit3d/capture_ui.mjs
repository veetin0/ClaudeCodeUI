// The app's real screens: each state in ui_states.mjs screenshotted at 2× (a 1920×1080 window, or
// ui_states.viewport, drawn at 2× with Chrome's device scale, not zoom, so the layout stays the app's own) in the
// dark colour scheme, plus the rectangle of every target in UI pixels. A state with `type` also
// gets its field captured at each step of the text being typed in (the hero types it in the film).
//   node capture_ui.mjs          → build/ui/<state>.png, build/ui/<state>.type/*.png, build/ui_layout.json
//   APP_URL=http://localhost:5173 node capture_ui.mjs   (overrides ui_states.url)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as APP from './ui_states.mjs'
import { chrome, serve } from './util.mjs'

const HERE = resolve(import.meta.dirname)
const OUT = join(HERE, 'build', 'ui')
const [PX, PY] = APP.viewport ?? [1920, 1080] // a phone app: export const viewport = [390, 844]
mkdirSync(OUT, { recursive: true })

let page
let close
let server
if (APP.launch) {
  ;({ page, close } = await APP.launch())
} else {
  const browser = await chrome()
  page = await (await browser.newContext({ viewport: { width: PX, height: PY } })).newPage()
  close = () => browser.close()
}
// The same for every app: the window's size, drawn at 2×, dark theme.
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setDeviceMetricsOverride', { width: PX, height: PY, deviceScaleFactor: 2, mobile: false })
await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })

let url = process.env.APP_URL ?? APP.url
if (url && !/^[a-z]+:\/\//.test(url)) {
  server = await serve(HERE)
  url = `${server.url}/${url}`
}
if (url) await page.goto(url, { waitUntil: 'load' })

async function rect(selector) {
  const box = await page.locator(selector).first().boundingBox({ timeout: 3000 }).catch(() => null)
  return box && { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) }
}

async function grab(file, clip = { x: 0, y: 0, w: PX, h: PY }) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h, scale: 1 } })
  writeFileSync(file, Buffer.from(data, 'base64'))
}

/** The field at each step of the text going in (no caret: the film draws the typing). */
async function typeSteps(s) {
  const sel = s.targets?.[s.type.target] ?? s.type.target
  const field = page.locator(sel).first()
  const box = await field.boundingBox()
  const clip = { x: Math.floor(box.x) - 2, y: Math.floor(box.y) - 2, w: Math.ceil(box.width) + 4, h: Math.ceil(box.height) + 4 }
  const text = s.type.text
  const n = s.type.steps ?? Math.min(14, Math.max(4, Math.ceil(text.length / 6)))
  const dir = join(OUT, `${s.name}.type`)
  mkdirSync(dir, { recursive: true })
  await page.addStyleTag({ content: '* { caret-color: transparent !important }' })
  const steps = []
  for (let k = 1; k <= n; k++) {
    await field.fill(text.slice(0, Math.round((text.length * k) / n)))
    await field.evaluate((el) => (el.scrollTop = 0))
    await page.waitForTimeout(80)
    const file = `${String(k).padStart(2, '0')}.png`
    await grab(join(dir, file), clip)
    steps.push(`build/ui/${s.name}.type/${file}`)
  }
  if (s.type.reset !== false) await field.fill('')
  return { target: s.type.target, clip, steps }
}

const layout = { px: [PX, PY], scale: 2, states: {}, typing: {} }
let missing = 0
for (const [i, s] of APP.states.entries()) {
  await s.go?.(page)
  await page.waitForTimeout(s.wait ?? 400)
  await grab(join(OUT, `${s.name}.png`))
  const rects = {}
  for (const [name, sel] of Object.entries(s.targets ?? {})) rects[name] = await rect(sel)
  layout.states[s.name] = rects
  const lost = Object.entries(rects).filter(([, v]) => !v).map(([k]) => k)
  missing += lost.length
  if (s.type) layout.typing[s.name] = await typeSteps(s)
  console.log(`${s.name}${s.type ? `  (typing: ${layout.typing[s.name].steps.length} steps)` : ''}${lost.length ? `  ✗ not found: ${lost.join(', ')}` : ''}`)
}
writeFileSync(join(HERE, 'build', 'ui_layout.json'), JSON.stringify(layout, null, 2))
console.log(`→ build/ui/ (${APP.states.length} screens at ${PX * 2}×${PY * 2}) and build/ui_layout.json`)
await close()
server?.close()
if (missing) process.exit(1)
