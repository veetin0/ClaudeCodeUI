// Renders a clip of the 3D kit in headless Chrome, one deterministic frame at a time.
//   node render.mjs stills <clip>            up to 20 stills at half resolution: look before rendering
//   node render.mjs frames <clip> [from to]  every frame → build/<clip>/frames/ (W, H, SUB to change the
//                                            size and the motion-blur subframes; JOBS=2 splits the range)
//   node render.mjs still <clip> <t>         one full-size still at time t
//   node render.mjs logo <clip>              the finished mark, 1024×1024 on transparent → out/logo.png
// Chrome draws with SwiftShader (software GL) so it works on any machine; GL=gpu uses the GPU
// instead (faster where headless Chrome gets one; check that a still looks the same). A render cut
// off midway resumes with `frames <clip> <from> <to>`.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chrome, serve } from './util.mjs'

const HERE = resolve(import.meta.dirname)
const [mode = 'stills', clip = 'film', a, b] = process.argv.slice(2)
const BUILD = join(HERE, 'build', clip)
const TL = JSON.parse(readFileSync(join(BUILD, 'timeline.json'), 'utf8'))
const env = (k, d) => Number(process.env[k] ?? d)

if (mode === 'frames' && env('JOBS', 1) > 1) {
  const from = Number(a ?? 0)
  const to = Number(b ?? TL.frames)
  const jobs = env('JOBS', 1)
  const size = Math.ceil((to - from) / jobs)
  const runs = Array.from({ length: jobs }, (_, j) => [from + j * size, Math.min(to, from + (j + 1) * size)]).filter(([x, y]) => x < y)
  const codes = await Promise.all(runs.map(([x, y]) => new Promise((r) => spawn(process.execPath, [import.meta.filename, 'frames', clip, String(x), String(y)], { stdio: 'inherit', env: { ...process.env, JOBS: '1' } }).on('exit', r))))
  process.exit(codes.some((c) => c) ? 1 : 0)
}

const site = await serve(HERE)
const gl = process.env.GL === 'gpu' ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox']
const browser = await chrome(gl)

async function open(w, h, sub, extra = '') {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('page:', m.text()))
  page.on('pageerror', (e) => console.log('page error:', e.message))
  await page.goto(`${site.url}/scene/index.html?clip=${clip}&w=${w}&h=${h}&sub=${sub}${extra}`)
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
  // The moments that matter: just after each action and each camera move has settled, the
  // finale's beats, and a few even ones in between.
  const f = TL.finale ?? {}
  const times = [
    ...TL.camera.map((c) => c.t + Math.min(1.0, (c.blend ?? 0.9) + 0.1)),
    ...(TL.actions ?? []).filter((x) => ['press', 'stamp', 'type', 'cheer', 'swat'].includes(x.does)).map((x) => (x.does === 'type' ? (x.start + x.end) / 2 : x.t + 0.35)),
    ...(TL.cards ?? []).slice(-1).map((c) => c.t + 0.4),
    ...(TL.product?.callouts ?? []).slice(-1).map((c) => c.t + 0.5),
    f.splash != null && f.splash + 0.3,
    f.wordmark != null && f.wordmark + 0.8,
    ...[0.15, 0.4, 0.65, 0.9].map((k) => TL.duration * k),
  ]
    .filter((t) => t !== false && t != null && t >= 0 && t < TL.duration)
    .sort((x, y) => x - y)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1] > 0.25)
  const pick = times.length > 20 ? times.filter((_, i) => i % Math.ceil(times.length / 20) === 0 || i === times.length - 1) : times
  mkdirSync(join(BUILD, 'stills'), { recursive: true })
  const { page, grab } = await open(960, 540, 3)
  for (const t of pick) {
    await page.evaluate((t) => window.renderFrame(t), t)
    await grab(join(BUILD, 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`))
  }
  console.log(`${pick.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)} s → build/${clip}/stills/`)
} else if (mode === 'still') {
  const { page, grab } = await open(env('W', 1920), env('H', 1080), env('SUB', 5), process.env.EXTRA ?? '')
  await page.evaluate((t) => window.renderFrame(t), Number(a))
  const name = `still-${a}${process.env.TAG ? `-${process.env.TAG}` : ''}.png`
  await grab(join(BUILD, name))
  console.log(`still at ${a} s → build/${clip}/${name}`)
} else if (mode === 'frames') {
  const from = Number(a ?? 0)
  const to = Number(b ?? TL.frames)
  mkdirSync(join(BUILD, 'frames'), { recursive: true })
  const { page, grab } = await open(env('W', 1920), env('H', 1080), env('SUB', 5))
  for (let f = from; f < to; f++) {
    await page.evaluate((t) => window.renderFrame(t), f / TL.fps)
    await grab(join(BUILD, 'frames', `${pad(f)}.png`))
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
