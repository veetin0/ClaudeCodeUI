// The app's real screens: each state in ui_states.mjs screenshotted at 3840×2160 (a 1920×1080
// window drawn at 2×, Chrome's device scale, not zoom, so the layout stays the app's own) in the
// dark colour scheme, plus the rectangle of every target and panel in UI pixels.
//   node capture_ui.mjs          → build/ui/<state>.png and build/ui_layout.json
//   APP_URL=http://localhost:5173 node capture_ui.mjs   (overrides ui_states.url)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as APP from './ui_states.mjs'
import { chrome, serve } from './util.mjs'

const HERE = resolve(import.meta.dirname)
const OUT = join(HERE, 'build', 'ui')
const [PX, PY] = [1920, 1080]
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

const layout = { px: [PX, PY], scale: 2, panels: {}, states: {} }
let missing = 0
for (const [i, s] of APP.states.entries()) {
  await s.go?.(page)
  await page.waitForTimeout(s.wait ?? 400)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: PX, height: PY, scale: 1 } })
  writeFileSync(join(OUT, `${s.name}.png`), Buffer.from(data, 'base64'))
  const rects = {}
  for (const [name, sel] of Object.entries(s.targets ?? {})) rects[name] = await rect(sel)
  if (i === 0) for (const [name, sel] of Object.entries(APP.panels)) layout.panels[name] = await rect(sel)
  layout.states[s.name] = rects
  const lost = Object.entries(i === 0 ? { ...rects, ...layout.panels } : rects).filter(([, v]) => !v).map(([k]) => k)
  missing += lost.length
  console.log(`${s.name}${lost.length ? `  ✗ not found: ${lost.join(', ')}` : ''}`)
}
writeFileSync(join(HERE, 'build', 'ui_layout.json'), JSON.stringify(layout, null, 2))
console.log(`→ build/ui/ (${APP.states.length} screens at ${PX * 2}×${PY * 2}) and build/ui_layout.json`)
await close()
server?.close()
if (missing) process.exit(1)
