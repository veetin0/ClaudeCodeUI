// Renders the Three.js scene in headless Chrome, one deterministic frame at a time.
//   node render.mjs stills            up to 20 stills at half resolution: look before the film
//   node render.mjs frames [from to]  every frame into build/frames/ (W, H, SUB to change the size
//                                     and the motion-blur subframes; JOBS=2 splits the range)
//   node render.mjs still <t>         one full-size still at time t
//   node render.mjs logo              the finished mark, 1024×1024 on transparent, → out/logo.png
// Chrome draws with SwiftShader (software GL) so it works on any machine; GL=gpu uses the GPU
// instead (faster where headless Chrome gets one; check that a still looks the same).
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chrome, serve } from './util.mjs'

const HERE = resolve(import.meta.dirname)
const TL = JSON.parse(readFileSync(join(HERE, 'build', 'timeline.json'), 'utf8'))
const [mode = 'stills', a, b] = process.argv.slice(2)
const env = (k, d) => Number(process.env[k] ?? d)

// Several processes: each renders its own slice of the frames.
if (mode === 'frames' && env('JOBS', 1) > 1) {
  const from = Number(a ?? 0)
  const to = Number(b ?? TL.frames)
  const jobs = env('JOBS', 1)
  const size = Math.ceil((to - from) / jobs)
  const runs = Array.from({ length: jobs }, (_, j) => [from + j * size, Math.min(to, from + (j + 1) * size)]).filter(([x, y]) => x < y)
  const codes = await Promise.all(runs.map(([x, y]) => new Promise((r) => spawn(process.execPath, [import.meta.filename, 'frames', String(x), String(y)], { stdio: 'inherit', env: { ...process.env, JOBS: '1' } }).on('exit', r))))
  process.exit(codes.some((c) => c) ? 1 : 0)
}

const site = await serve(HERE)
const gl = process.env.GL === 'gpu' ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
const browser = await chrome(gl)

async function open(w, h, sub, extra = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && !m.text().includes('favicon') && console.log('page:', m.text()))
  page.on('pageerror', (e) => console.log('page error:', e.message))
  await page.goto(`${site.url}/scene/index.html?w=${w}&h=${h}&sub=${sub}${extra}`)
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
  // The moments that matter: the studio, the problem, the jump in, each action just after its
  // screen change has settled, the jump out, the screen becoming the icon, the logo.
  const f = TL.finale
  const line = (id) => TL.lines.find((l) => l.id === id)
  const wake = TL.actions.find((a) => a.does === 'wake')
  const swat = TL.actions.find((a) => a.does === 'swat')
  const acts = TL.actions.filter((a) => ['press', 'stamp', 'type', 'cheer'].includes(a.does))
  const times = [
    TL.light + 0.4,
    wake && wake.t + 0.6,
    line('problem') && line('problem').at + line('problem').seconds * 0.7,
    swat && swat.t + 0.12,
    TL.power + 0.6,
    TL.music.drop - 0.35,
    ...acts.map((a) => (a.does === 'type' ? (a.start + a.end) / 2 : a.t + 0.35)),
    f.morph[0] - 0.3,
    (f.morph[0] + f.morph[1]) / 2,
    f.splash + 0.3,
    f.wordmark + 0.8,
  ].filter((t) => t != null)
  const pick = times.length > 20 ? times.filter((_, i) => i % Math.ceil(times.length / 20) === 0 || i === times.length - 1) : times
  mkdirSync(join(HERE, 'build', 'stills'), { recursive: true })
  const { page, grab } = await open(960, 540, 3)
  for (const t of pick) {
    await page.evaluate((t) => window.renderFrame(t), t)
    await grab(join(HERE, 'build', 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`))
  }
  console.log(`${pick.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)} s → build/stills/`)
} else if (mode === 'still') {
  const { page, grab } = await open(env('W', 1920), env('H', 1080), env('SUB', 5), process.env.EXTRA ?? '')
  await page.evaluate((t) => window.renderFrame(t), Number(a))
  const name = `still-${a}${process.env.TAG ? `-${process.env.TAG}` : ''}.png`
  await grab(join(HERE, 'build', name))
  console.log(`still at ${a} s → build/${name}`)
} else if (mode === 'frames') {
  const from = Number(a ?? 0)
  const to = Number(b ?? TL.frames)
  mkdirSync(join(HERE, 'build', 'frames'), { recursive: true })
  const { page, grab } = await open(env('W', 1920), env('H', 1080), env('SUB', 5))
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.renderFrame(t), f / TL.fps)
    await grab(join(HERE, 'build', 'frames', `${pad(f)}.png`))
    if ((f - from) % 30 === 0) console.log(`frame ${f}/${to}  ${((Date.now() - t0) / 1000 / (f - from + 1)).toFixed(2)} s/frame`)
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
site.close()
