// Renders the Three.js scene in headless Chromium, one deterministic frame at a time.
//   node render.mjs stills            18 stills at half resolution (look at them before the film)
//   node render.mjs frames [from to]  every frame, full HD, into build/frames/
//   node render.mjs logo              the finished mark, 1024×1024 on transparent, into out/logo.png
//   node render.mjs still <t>         one full-size still at time t
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const HERE = resolve(import.meta.dirname)
const TL = JSON.parse(readFileSync(join(HERE, 'build', 'timeline.json'), 'utf8'))
const [mode = 'stills', a, b] = process.argv.slice(2)

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' }
const server = createServer((q, s) => {
  const p = join(HERE, decodeURIComponent(q.url.split('?')[0]))
  if (!p.startsWith(HERE) || !existsSync(p)) {
    s.writeHead(404)
    return s.end()
  }
  s.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  s.end(readFileSync(p))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const exe = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'] })

async function open(w, h, sub, extra = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('page:', m.text()))
  page.on('pageerror', (e) => console.log('page error:', e.message))
  await page.goto(`http://127.0.0.1:${port}/scene/index.html?w=${w}&h=${h}&sub=${sub}${extra}`)
  await page.waitForFunction(() => window.ready === true, null, { timeout: 300_000 })
  const cdp = await page.context().newCDPSession(page)
  const grab = async (file) => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    writeFileSync(file, Buffer.from(data, 'base64'))
  }
  return { page, grab }
}

const pad = (n) => String(n).padStart(5, '0')
const t0 = Date.now()

if (mode === 'stills') {
  // The 18 moments that matter: sticker, pop, every landing, the finale.
  const times = [0.3, 0.86, 1.6, 2.1, 3.6, 3.95, 5.1, 7.15, 8.45, 9.7, 11.95, 13.45, 15.45, 16.6, 17.6, 18.9, 20.6, 22.5]
  mkdirSync(join(HERE, 'build', 'stills'), { recursive: true })
  const { page, grab } = await open(960, 540, 3)
  for (const t of times) {
    await page.evaluate((t) => window.renderFrame(t), t)
    await grab(join(HERE, 'build', 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`))
  }
  console.log(`${times.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)} s → build/stills/`)
} else if (mode === 'still') {
  const { page, grab } = await open(Number(process.env.W ?? 1920), Number(process.env.H ?? 1080), Number(process.env.SUB ?? 5), process.env.EXTRA ?? '')
  await page.evaluate((t) => window.renderFrame(t), Number(a))
  mkdirSync(join(HERE, 'build'), { recursive: true })
  const name = `still-${a}${process.env.TAG ? `-${process.env.TAG}` : ''}.png`
  await grab(join(HERE, 'build', name))
  console.log(`still at ${a} s → build/${name}`)
} else if (mode === 'frames') {
  const from = Number(a ?? 0)
  const to = Number(b ?? TL.frames)
  mkdirSync(join(HERE, 'build', 'frames'), { recursive: true })
  const { page, grab } = await open(1920, 1080, Number(process.env.SUB ?? 5))
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.renderFrame(t), f / TL.fps)
    await grab(join(HERE, 'build', 'frames', `${pad(f)}.png`))
    if (f % 30 === 0) console.log(`frame ${f}/${to}  ${((Date.now() - t0) / 1000 / (f - from + 1)).toFixed(2)} s/frame`)
  }
  console.log(`frames ${from}–${to - 1} in ${((Date.now() - t0) / 60000).toFixed(1)} min`)
} else if (mode === 'logo') {
  mkdirSync(join(HERE, 'out'), { recursive: true })
  const { page } = await open(1024, 1024, 1, '&mc=128') // a finer mesh: the logo is seen up close
  const png = await page.evaluate(() => window.renderLogo())
  writeFileSync(join(HERE, 'out', 'logo.png'), Buffer.from(png.split(',')[1], 'base64'))
  console.log('→ out/logo.png')
}

await browser.close()
server.close()
