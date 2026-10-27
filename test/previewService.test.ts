import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PreviewState } from '@shared/preview'
import { createServer, type Server } from 'node:net'
import { findModels, freePort, PreviewService } from '../src/main/preview/PreviewService'
import { SERVED_EXTENSIONS } from '@shared/visuals'

let dir: string
let last: PreviewState | null
let svc: PreviewService
const until = async (cond: () => boolean, ms = 15000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 50))
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'harness-preview-'))
  last = null
  svc = new PreviewService((s) => (last = s))
})
afterEach(() => {
  svc.stopAll()
  rmSync(dir, { recursive: true, force: true })
})

describe('PreviewService', () => {
  it('detects Remotion and dev scripts from package.json', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { remotion: '4.0.0' }, scripts: { dev: 'remotion studio', build: 'remotion render' } }))
    expect(await svc.detect(dir)).toMatchObject({ remotion: true, remotionVersion: '4.0.0', devScripts: [{ name: 'dev' }] })
    expect(await svc.detect(join(dir, 'missing'))).toMatchObject({ remotion: false, devScripts: [] })
  })

  it('starts a dev script, picks up its URL, and stops the whole process group', async () => {
    const server = `require('http').createServer((q,r)=>r.end('ok')).listen(0,function(){console.log('  Local: http://localhost:'+this.address().port+'/')})`
    writeFileSync(join(dir, 'server.js'), server)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'node server.js' } }))
    const s = await svc.startScript(dir, 'dev')
    await until(() => last?.servers.find((x) => x.id === s.id)?.status === 'ready')
    const url = last!.servers.find((x) => x.id === s.id)!.url!
    expect(url).toMatch(/^http:\/\/localhost:\d+\/$/)
    expect(await (await fetch(url)).text()).toBe('ok')

    svc.stop(s.id)
    await until(() => !last!.servers.some((x) => x.id === s.id))
    await new Promise((r) => setTimeout(r, 300))
    await expect(fetch(url)).rejects.toThrow()
  })

  it('tracks render progress from the remotion CLI output', async () => {
    // A stand-in for node_modules/.bin/remotion that prints what the real CLI prints.
    mkdirSync(join(dir, 'node_modules', '.bin'), { recursive: true })
    const bin = join(dir, 'node_modules', '.bin', 'remotion')
    writeFileSync(
      bin,
      `#!/bin/sh\nif [ "$1" = "compositions" ]; then printf 'The following compositions are available:\\n\\nIntro    30      640x360        60 (2.00 sec)\\n'; exit 0; fi\nprintf 'Bundling 50%%\\rBundling 100%%\\n'; sleep 0.2; printf 'Rendered 30/60, time remaining: 1s\\n'; sleep 0.2; printf 'Encoded 60/60\\n'; touch "$3"\n`,
    )
    chmodSync(bin, 0o755)
    expect(await svc.compositions(dir)).toEqual([{ id: 'Intro', fps: 30, width: 640, height: 360, durationInFrames: 60 }])

    const job = await svc.render(dir, 'Intro')
    expect(job.output).toBe(join(dir, 'out', 'Intro.mp4'))
    const phases = new Set<string>()
    await until(() => {
      const r = last?.renders.find((x) => x.id === job.id)
      if (r?.progress) phases.add(r.progress.phase)
      return r?.status === 'done'
    })
    expect(phases.has('rendering') || phases.has('encoding')).toBe(true)
  })

  it('remembers local URLs seen in output, newest first, without duplicates', () => {
    svc.noteOutput('ready at http://localhost:5173/', 'command', dir)
    svc.noteOutput('also http://127.0.0.1:8080 and http://localhost:5173/', 'terminal', dir)
    expect(svc.state().detected.map((d) => d.url)).toEqual(['http://localhost:5173/', 'http://localhost:8080'])
  })
})

describe('freePort', () => {
  it('skips a port a dev server holds on any interface', async () => {
    const held: Server[] = []
    const hold = (port: number, host: string) =>
      new Promise<number | null>((resolve) => {
        const srv = createServer()
        // No IPv6 stack (some CI machines and containers): nothing can listen on `::` there.
        srv.once('error', () => resolve(null))
        srv.listen(port, host, () => resolve((srv.address() as { port: number }).port))
        held.push(srv)
      })
    // Next.js and Vite listen on `::` / 0.0.0.0; others on loopback only.
    const ports = [await hold(0, '::'), await hold(0, '0.0.0.0'), await hold(0, '127.0.0.1')].filter((p): p is number => p !== null)
    expect(ports.length).toBeGreaterThanOrEqual(2)
    for (const p of ports) expect(await freePort(p)).not.toBe(p)
    held.forEach((s) => s.close())
  })
})

describe('3D models for the viewer', () => {
  it('finds .glb and .gltf files in the project, skipping installs and builds', async () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-models-'))
    const put = (rel: string) => {
      mkdirSync(join(root, rel, '..'), { recursive: true })
      writeFileSync(join(root, rel), '')
    }
    put('assets/sensor.glb')
    put('assets/scene/room.gltf')
    put('assets/scene/room.bin')
    put('node_modules/three/examples/models/duck.glb')
    put('.git/x.glb')
    put('video/kit3d/build/x.glb')
    put('a/b/c/d/e/f/g/too-deep.glb')
    expect(await findModels(root)).toEqual([join(root, 'assets', 'scene', 'room.gltf'), join(root, 'assets', 'sensor.glb')])
    expect(await findModels(root, 6, 1)).toHaveLength(1)
  })

  it('serves models (and a .gltf’s .bin buffers) on the local file protocol, nothing else new', () => {
    for (const ext of ['.glb', '.gltf', '.bin', '.mp4', '.png']) expect(SERVED_EXTENSIONS).toContain(ext)
    expect(SERVED_EXTENSIONS).not.toContain('.json')
    expect(SERVED_EXTENSIONS).not.toContain('.js')
  })
})
