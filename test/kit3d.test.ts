import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clipTitle, kit3dChangePrompt, kit3dClipPrompt, type Kit3dState } from '@shared/kit3d'
import { Kit3dService, type Runner } from '../src/main/kit3d/Kit3dService'

const KIT = join(__dirname, '..', 'resources', 'hackforge', 'skills', 'video', 'kit3d')
const tmp = () => mkdtempSync(join(tmpdir(), 'harness-kit3d-'))
const realPython = (args: string[], cwd?: string) => {
  try {
    return execFileSync('python3', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch {
    return undefined
  }
}

interface Call {
  cmd: string
  args: string[]
  env?: Record<string, string>
}

/** A fake toolchain: each step writes what the real one would. */
function fakeRun(opts: { fail?: (c: Call) => string | undefined; talks?: boolean; frames?: number; delay?: number; slow?: (c: Call) => boolean } = {}) {
  const calls: Call[] = []
  const run: Runner = async (cmd, args, o, onLine) => {
    const c = { cmd, args, env: o.env }
    calls.push(c)
    if (opts.delay && (!opts.slow || opts.slow(c))) await new Promise((r) => setTimeout(r, opts.delay))
    const failure = opts.fail?.(c)
    if (failure) {
      onLine(failure)
      return 1
    }
    const dir = o.cwd
    if (cmd === 'npm') for (const m of ['three', 'playwright-core']) mkdirSync(join(dir, 'node_modules', m), { recursive: true })
    if (args.join(' ') === '-m venv .venv') {
      mkdirSync(join(dir, '.venv', 'bin'), { recursive: true })
      // A venv python that is the real one, so story.py --list still works.
      writeFileSync(join(dir, '.venv', 'bin', 'python3'), '#!/bin/sh\nexec python3 "$@"\n', { mode: 0o755 })
    }
    if (args[0] === 'story.py') {
      const clip = args[1]
      mkdirSync(join(dir, 'build', clip), { recursive: true })
      const n = opts.frames ?? 5
      writeFileSync(join(dir, 'build', clip, 'timeline.json'), JSON.stringify({ duration: n / 30, frames: n, fps: 30, uses: ['product', 'stage'], lines: opts.talks ? [{ id: 'hi' }] : [] }))
      onLine(`✓ ${clip}: product, stage`)
    }
    if (args[0] === 'render.mjs' && args[1] === 'frames') {
      const [, , clip, from, to] = args
      for (let i = Number(from); i < Number(to); i++) writeFileSync(join(dir, 'build', clip, 'frames', `${String(i).padStart(5, '0')}.png`), 'png')
    }
    if (args[0] === 'render.mjs' && args[1] === 'stills') {
      const clip = args[2]
      mkdirSync(join(dir, 'build', clip, 'stills'), { recursive: true })
      for (const t of ['t00.50', 't01.20']) writeFileSync(join(dir, 'build', clip, 'stills', `${t}.png`), 'png')
      onLine(`2 stills in 3.1 s → build/${clip}/stills/`)
    }
    if (args[0] === 'sound.py') writeFileSync(join(dir, 'build', args[1], args.includes('--stem') ? 'sfx.wav' : 'sound.wav'), 'wav')
    if (cmd === 'ffmpeg') writeFileSync(args[args.length - 1], 'mp4')
    return 0
  }
  return { run, calls }
}

function service(opts: { run?: Runner; python?: string; ffmpeg?: boolean; browser?: string; project?: string } = {}) {
  const project = opts.project ?? tmp()
  const pushed: Kit3dState[] = []
  const svc = new Kit3dService({
    projectDir: () => project,
    templateDir: () => KIT,
    push: (s) => pushed.push(s),
    browserPath: () => opts.browser,
    node: { command: 'node', env: {} },
    run: opts.run,
    platform: 'linux',
    probe: (cmd, args, cwd) => {
      if (cmd === 'ffmpeg') return opts.ffmpeg === false ? undefined : 'ffmpeg version 7.1 Copyright (c) the FFmpeg developers\n'
      if (cmd === 'npm') return '10.9.2\n'
      if ((cmd === 'python3' || cmd === 'python') && opts.python) return `${opts.python}\n/usr/bin/${cmd}\n`
      if (cmd.endsWith('python3') || cmd === 'python3' || cmd === 'python') return realPython(args, cwd)
      return undefined
    },
  })
  return { svc, pushed, project, kit: join(project, 'video', 'kit3d') }
}

async function settle(svc: Kit3dService) {
  for (let i = 0; i < 200; i++) {
    const s = await svc.state()
    if (s.job?.status !== 'running') return s
    await new Promise((r) => setTimeout(r, 25))
  }
  throw new Error('job never finished')
}

describe('3D clips', () => {
  it('says what is missing before setup: Python 3.10+, ffmpeg, a browser', async () => {
    const { svc } = service({ python: '3.9.6', ffmpeg: false })
    const s = await svc.state()
    expect(s.exists).toBe(false)
    expect(s.ready).toBe(false)
    const by = Object.fromEntries(s.requirements.map((r) => [r.id, r]))
    expect(by.python).toMatchObject({ ok: false, found: '3.9.6' })
    expect(by.ffmpeg).toMatchObject({ ok: false, hint: expect.stringContaining('brew install ffmpeg') })
    expect(by.browser).toMatchObject({ ok: false, hint: expect.stringContaining('Get Chromium') })
    expect(by.npm).toMatchObject({ ok: true, found: '10.9.2' })
    // Without a supported Python, setup stops with the reason.
    await svc.setup()
    expect((await settle(svc)).job).toMatchObject({ kind: 'setup', status: 'error', message: expect.stringContaining('Python 3.10') })
  })

  it('copies the kit, installs npm packages and a Python venv, then lists the clips', async () => {
    const { run, calls } = fakeRun()
    const { svc, kit } = service({ run, browser: '/Chrome' })
    await svc.setup()
    const s = await settle(svc)
    expect(s.job).toMatchObject({ kind: 'setup', status: 'done' })
    expect(existsSync(join(kit, 'story.py'))).toBe(true)
    expect(existsSync(join(kit, 'node_modules', 'three'))).toBe(true)
    expect(calls.map((c) => [c.cmd.replace(/.*\//, ''), ...c.args.slice(0, 2)].join(' '))).toEqual([
      'npm install --no-audit',
      expect.stringMatching(/^python3? -m venv$/),
      'python3 -m pip',
    ])
    expect(s.ready).toBe(true)
    expect(s.clips.map((c) => c.name)).toEqual(['film', 'walkthrough', 'device', 'product', 'problem', 'logo'])
    expect(s.clips.find((c) => c.name === 'product')).toMatchObject({ doc: expect.stringContaining('explodes into its parts'), pitch: 'none', stills: [] })
    // A changed requirements.txt means the Python packages need installing again.
    writeFileSync(join(kit, 'requirements.txt'), readFileSync(join(kit, 'requirements.txt'), 'utf8') + 'rich>=13\n')
    expect((await svc.state()).ready).toBe(false)
  })

  it('reports a failed step with what the tool said', async () => {
    const { run } = fakeRun({ fail: (c) => (c.args.includes('pip') ? 'ERROR: No matching distribution found for kokoro-onnx>=0.4' : undefined) })
    const { svc } = service({ run })
    await svc.setup()
    expect((await settle(svc)).job).toMatchObject({ status: 'error', message: expect.stringContaining('No matching distribution found for kokoro-onnx') })
  })

  it('renders stills for a quick look', async () => {
    const { run, calls } = fakeRun()
    const { svc, kit } = service({ run, browser: '/Chrome' })
    await svc.setup()
    await settle(svc)
    await svc.stills('product')
    const s = await settle(svc)
    expect(s.job).toMatchObject({ kind: 'stills', clip: 'product', status: 'done', message: expect.stringContaining('2 stills') })
    expect(s.clips.find((c) => c.name === 'product')!.stills).toEqual([join(kit, 'build', 'product', 'stills', 't00.50.png'), join(kit, 'build', 'product', 'stills', 't01.20.png')])
    const still = calls.find((c) => c.args[0] === 'render.mjs')!
    expect(still).toMatchObject({ cmd: 'node', args: ['render.mjs', 'stills', 'product'], env: { CHROME_PATH: '/Chrome' } })
  })

  it('renders a clip with effects only, resumes a stopped render, and adds it to the pitch', async () => {
    const { run, calls } = fakeRun({ frames: 6 })
    const { svc, kit, project } = service({ run, browser: '/Chrome' })
    await svc.setup()
    await settle(svc)
    await svc.render('product', 'draft')
    let s = await settle(svc)
    expect(s.job).toMatchObject({ kind: 'render', clip: 'product', status: 'done', message: expect.stringContaining('Draft (540p)') })
    const frames = calls.find((c) => c.args[1] === 'frames')!
    expect(frames.args).toEqual(['render.mjs', 'frames', 'product', '0', '6'])
    expect(frames.env).toMatchObject({ W: '960', H: '540', SUB: '2', CHROME_PATH: '/Chrome' })
    expect(calls.find((c) => c.args[0] === 'sound.py')!.args).toEqual(['sound.py', 'product', '--stem'])
    const mux = calls.find((c) => c.cmd === 'ffmpeg')!
    expect(mux.args).toEqual(expect.arrayContaining(['-af', 'volume=-1.5dB', '-preset', 'veryfast', join(kit, 'build', 'product', 'sfx.wav'), join(kit, 'out', 'product.mp4')]))
    expect(JSON.parse(readFileSync(join(kit, 'out', 'product.json'), 'utf8'))).toMatchObject({ quality: 'draft', seconds: 0.2 })
    expect(s.clips.find((c) => c.name === 'product')).toMatchObject({ video: { quality: 'draft', seconds: 0.2 }, pitch: 'none' })

    // Into the pitch: same timestamp as the render, so it reads as current.
    expect(await svc.addToPitch('product')).toEqual({ media: '3d/product.mp4', seconds: 0.2 })
    expect(Math.abs(statSync(join(project, 'pitch', 'public', '3d', 'product.mp4')).mtimeMs - statSync(join(kit, 'out', 'product.mp4')).mtimeMs)).toBeLessThan(5)
    expect((await svc.state()).clips.find((c) => c.name === 'product')!.pitch).toBe('current')

    // Frames 0-3 of the same timeline and size are kept (the last one may be half-written).
    const framesDir = join(kit, 'build', 'product', 'frames')
    for (const f of readdirSync(framesDir)) if (/^0000[45]\.png$/.test(f)) execFileSync('rm', [join(framesDir, f)])
    calls.length = 0
    await new Promise((r) => setTimeout(r, 20))
    await svc.render('product', 'draft')
    s = await settle(svc)
    expect(calls.find((c) => c.args[1] === 'frames')!.args).toEqual(['render.mjs', 'frames', 'product', '3', '6'])
    expect(s.clips.find((c) => c.name === 'product')!.pitch).toBe('stale')
    // A different size starts over.
    calls.length = 0
    await svc.render('product', 'final')
    await settle(svc)
    expect(calls.find((c) => c.args[1] === 'frames')!.args).toEqual(['render.mjs', 'frames', 'product', '0', '6'])
    expect(calls.find((c) => c.cmd === 'ffmpeg')!.args).toEqual(expect.arrayContaining(['-preset', 'slow']))
  })

  it('gives a clip that speaks its voice and full mix', async () => {
    const { run, calls } = fakeRun({ talks: true })
    const { svc, kit } = service({ run, browser: '/Chrome' })
    await svc.setup()
    await settle(svc)
    await svc.render('film', 'draft')
    expect((await settle(svc)).job?.status).toBe('done')
    const seq = calls.filter((c) => c.args[0] !== '-m' && c.cmd !== 'npm').map((c) => c.args.slice(0, 2).join(' '))
    expect(seq.slice(0, 3)).toEqual(['story.py film', 'voice.py', 'story.py film'])
    expect(calls.find((c) => c.args[0] === 'sound.py')!.args).toEqual(['sound.py', 'film'])
    expect(calls.find((c) => c.cmd === 'ffmpeg')!.args).toContain(join(kit, 'build', 'film', 'sound.wav'))
  })

  it('stops a render when asked, and runs one job at a time', async () => {
    const { run } = fakeRun({ delay: 150 })
    const { svc } = service({ run })
    await svc.setup()
    await settle(svc)
    await svc.render('logo', 'draft')
    await expect(svc.stills('logo')).rejects.toThrow(/Another 3D job/)
    await svc.cancel()
    expect((await settle(svc)).job).toMatchObject({ kind: 'render', status: 'cancelled', message: expect.stringContaining('picks up where it stopped') })
  })

  it('shows render progress with frames and time left', async () => {
    const { run } = fakeRun({ frames: 4, delay: 2500, slow: (c) => c.args[1] === 'frames' })
    const { svc, pushed } = service({ run })
    await svc.setup()
    await settle(svc)
    await svc.render('logo', 'draft')
    await settle(svc)
    expect(pushed.some((p) => p.job?.kind === 'render' && p.job.total === 4 && typeof p.job.done === 'number')).toBe(true)
  }, 15_000)

  it('asks Claude to write a clip for the kit, and to change one', () => {
    const p = kit3dClipPrompt('product', 'our sensor exploding to show the battery')
    expect(p).toMatch(/video\/kit3d\/story\.py/)
    expect(p).toMatch(/What it should show: our sensor exploding to show the battery/)
    expect(p).toMatch(/f\.product\(model=/)
    expect(p).toMatch(/Don't render frames: Harness renders it/)
    expect(kit3dClipPrompt('phone', '')).toMatch(/viewport = \[390, 844\]/)
    expect(kit3dChangePrompt('logo', 'slower')).toMatch(/change the clip `logo`: slower/)
    expect(clipTitle('product_hero')).toBe('Product hero')
  })
})
