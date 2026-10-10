import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { audioState, defaultScript, narrationHash, parseScript, safeRelPath, sceneSeconds, totalSeconds, type PitchScript } from '@shared/pitch'
import { PitchService } from '../src/main/pitch/PitchService'

const TEMPLATE = join(import.meta.dirname, '..', 'resources', 'pitch-template')

describe('pitch script model', () => {
  it('matches the Remotion template timing (566 frames rendered for this script)', () => {
    const n1 = 'Everyone accepts that this is how it works. We asked what happens if the center moves.'
    const script: PitchScript = {
      title: 'Gravity',
      targetSeconds: 120,
      voiceId: 'v1',
      scenes: [
        { id: 's1', visual: 'title', title: 'Gravity', narration: n1, audio: 'audio/s1-test.mp3', audioSeconds: 3.268, audioHash: narrationHash(n1, 'v1') },
        { id: 's2', visual: 'bullets', title: 'x', narration: 'Today people lose hours.' },
        { id: 's3', visual: 'quote', title: 'x', narration: 'So we flipped it.' },
        { id: 's4', visual: 'screen', title: 'x', narration: 'Here it is.', media: 'demo.mp4', seconds: 4 },
        { id: 's5', visual: 'screen', title: 'x', narration: 'Placeholder.', media: 'nothere.mp4' },
        { id: 's6', visual: 'end', title: 'x', narration: 'Thank you.', audio: 'audio/stale.mp3', audioSeconds: 9, audioHash: 'deadbeef' },
      ],
    }
    expect(script.scenes.reduce((t, s) => t + Math.round(sceneSeconds(s, script.voiceId) * 30), 0)).toBe(566)
    expect(audioState(script.scenes[0], 'v1')).toBe('fresh')
    expect(audioState(script.scenes[0], 'other-voice')).toBe('stale')
    expect(audioState(script.scenes[1], 'v1')).toBe('none')
    expect(audioState({ ...script.scenes[1], narration: '  ' }, 'v1')).toBe('silent')
  })

  it('parses defensively', () => {
    const s = parseScript({
      title: 'T',
      targetSeconds: -5,
      scenes: [{ id: 'a', visual: 'nope', narration: 'Hi', media: '../../etc/passwd', audio: '/abs/../x.mp3', bullets: ['a', 3, 'b'] }, { id: 'a', title: 'dup id' }, 'junk', null],
    })!
    expect(s.targetSeconds).toBe(120)
    expect(s.scenes).toHaveLength(2)
    expect(s.scenes[0]).toMatchObject({ id: 'a', visual: 'title', media: 'etc/passwd', audio: 'abs/x.mp3', bullets: ['a', 'b'] })
    expect(s.scenes[1].id).not.toBe('a')
    expect(parseScript('nope')).toBeNull()
    expect(safeRelPath('..\\..\\x/./y.mp4')).toBe('x/y.mp4')
  })

  it('has a sensible default script', () => {
    const s = defaultScript('Junction 2026')
    expect(s.scenes.map((x) => x.visual)).toEqual(['title', 'bullets', 'quote', 'screen', 'bullets', 'bullets', 'end'])
    expect(new Set(s.scenes.map((x) => x.id)).size).toBe(s.scenes.length)
    expect(totalSeconds(s)).toBeGreaterThan(40)
    expect(totalSeconds(s)).toBeLessThan(120)
  })
})

describe('PitchService', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))
  const setup = (fetchImpl?: typeof fetch, key: string | undefined = 'k') => {
    const root = mkdtempSync(join(tmpdir(), 'pitch-'))
    dirs.push(root)
    const pushed: unknown[] = []
    const svc = new PitchService({
      projectDir: () => root,
      elevenLabsKey: () => key,
      templateDir: TEMPLATE,
      push: (s) => pushed.push(s),
      fetch: fetchImpl,
      runInstall: async (_cwd, line) => {
        line('added 120 packages')
        return 0
      },
    })
    return { root, svc, pushed }
  }
  const settle = async (svc: PitchService) => {
    for (let i = 0; i < 100 && (await svc.state()).job?.status === 'running'; i++) await new Promise((r) => setTimeout(r, 10))
    return svc.state()
  }

  it('scaffolds from the template without overwriting, and saves scripts', async () => {
    const { root, svc } = setup()
    let s = await svc.scaffold('Junction 2026')
    expect(s).toMatchObject({ exists: true, installed: false })
    expect(s.script?.team).toBe('Built at Junction 2026')
    for (const f of ['package.json', 'src/Root.tsx', 'src/Pitch.tsx', 'src/timing.ts', 'public/audio/.gitkeep', '.gitignore']) expect(existsSync(join(root, 'pitch', f))).toBe(true)
    writeFileSync(join(root, 'pitch', 'src', 'Pitch.tsx'), '// customised')
    writeFileSync(join(root, 'pitch', 'public', 'demo.mp4'), 'x')
    s = await svc.scaffold('Junction 2026')
    expect(readFileSync(join(root, 'pitch', 'src', 'Pitch.tsx'), 'utf8')).toBe('// customised')
    expect(s.media).toEqual(['demo.mp4'])
    s = await svc.saveScript({ ...s.script!, title: 'Gravity' })
    expect(JSON.parse(readFileSync(join(root, 'pitch', 'script.json'), 'utf8')).title).toBe('Gravity')
    writeFileSync(join(root, 'pitch', 'script.json'), '{ broken')
    expect((await svc.state()).scriptError).toMatch(/isn't valid JSON/)
    svc.dispose()
  })

  it('narrates missing and stale scenes once, caching by content', async () => {
    const calls: string[] = []
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url} ${init?.body ?? ''}`)
      return new Response(new Uint8Array(32000), { status: 200, headers: { 'content-type': 'audio/mpeg' } }) // 2 s at 128 kbps
    }) as typeof fetch
    const { root, svc } = setup(fakeFetch)
    let s = await svc.scaffold('J')
    await expect(svc.narrate()).rejects.toThrow(/Pick a narrator voice/)
    const script = { ...s.script!, voiceId: 'voice1', scenes: s.script!.scenes.slice(0, 2) }
    script.scenes[1].narration = ''
    await svc.saveScript(script)
    await svc.narrate()
    s = await settle(svc)
    expect(s.job).toMatchObject({ kind: 'narrate', status: 'done', done: 1, total: 1 })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('POST https://api.elevenlabs.io/v1/text-to-speech/voice1?output_format=mp3_44100_128')
    expect(calls[0]).toContain('eleven_multilingual_v2')
    const first = s.script!.scenes[0]
    expect(first).toMatchObject({ audioSeconds: 2, audioHash: narrationHash(first.narration, 'voice1') })
    expect(existsSync(join(root, 'pitch', 'public', first.audio!))).toBe(true)

    // Nothing changed → no new request.
    await svc.narrate()
    expect((await settle(svc)).job?.message).toMatch(/up to date/)
    expect(calls).toHaveLength(1)

    // Text changed → new take, old take deleted; changing it back reuses nothing billed twice for the same text.
    await svc.saveScript({ ...s.script!, scenes: [{ ...first, narration: 'A new opening line.' }, s.script!.scenes[1]] })
    await svc.narrate()
    s = await settle(svc)
    expect(calls).toHaveLength(2)
    expect(existsSync(join(root, 'pitch', 'public', first.audio!))).toBe(false)
    expect(audioState(s.script!.scenes[0], 'voice1')).toBe('fresh')
    svc.dispose()
  })

  it('reports ElevenLabs errors clearly and keeps edits made during narration', async () => {
    const { svc } = setup((async () => new Response(JSON.stringify({ detail: { message: 'Invalid API key' } }), { status: 401 })) as unknown as typeof fetch)
    const s = await svc.scaffold('J')
    await svc.saveScript({ ...s.script!, voiceId: 'v' })
    await svc.narrate()
    expect((await settle(svc)).job).toMatchObject({ status: 'error', message: 'ElevenLabs rejected the API key: Invalid API key' })
    await expect(svc.voices()).rejects.toThrow(/rejected the API key/)
    svc.dispose()

    const { svc: noKey } = setup(undefined, '')
    await noKey.scaffold('J')
    await expect(noKey.narrate()).rejects.toThrow(/ElevenLabs API key/)
    noKey.dispose()
  })

  it('keeps script edits made while narration runs', async () => {
    let root = ''
    const fakeFetch = (async () => {
      // Someone edits script.json mid-request: renames scene 1, rewrites scene 2's narration.
      const file = join(root, 'pitch', 'script.json')
      const cur = JSON.parse(readFileSync(file, 'utf8'))
      cur.scenes[0].title = 'Renamed meanwhile'
      cur.scenes[1].narration = 'Rewritten meanwhile.'
      writeFileSync(file, JSON.stringify(cur))
      return new Response(new Uint8Array(16000), { status: 200 })
    }) as unknown as typeof fetch
    const t = setup(fakeFetch)
    root = t.root
    const s = await t.svc.scaffold('J')
    await t.svc.saveScript({ ...s.script!, voiceId: 'v', scenes: s.script!.scenes.slice(0, 2) })
    await t.svc.narrate()
    const after = (await settle(t.svc)).script!
    expect(after.scenes[0]).toMatchObject({ title: 'Renamed meanwhile', audioSeconds: 1 })
    expect(audioState(after.scenes[0], 'v')).toBe('fresh')
    // Scene 2's text changed after its request went out, so that take isn't attached.
    expect(after.scenes[1].narration).toBe('Rewritten meanwhile.')
    expect(audioState(after.scenes[1], 'v')).toBe('none')
    t.svc.dispose()
  })

  it("doesn't drop narration attached while the editor had unsaved edits", async () => {
    const t = setup((async () => new Response(new Uint8Array(16000), { status: 200 })) as unknown as typeof fetch)
    const s = await t.svc.scaffold('J')
    const draft = { ...s.script!, voiceId: 'v', scenes: s.script!.scenes.slice(0, 2) }
    await t.svc.saveScript(draft)
    await t.svc.narrate()
    expect((await settle(t.svc)).script!.scenes.every((x) => audioState(x, 'v') === 'fresh' || audioState(x, 'v') === 'silent')).toBe(true)
    // The editor still holds its pre-narration draft (no audio fields) and autosaves a title change.
    const after = (await t.svc.saveScript({ ...draft, title: 'Typed meanwhile' })).script!
    expect(after.title).toBe('Typed meanwhile')
    expect(audioState(after.scenes[0], 'v')).toBe('fresh')
    // A real narration change still makes the take stale.
    const edited = (await t.svc.saveScript({ ...draft, scenes: [{ ...draft.scenes[0], narration: 'Different words.' }, draft.scenes[1]] })).script!
    expect(audioState(edited.scenes[0], 'v')).toBe('none')
    t.svc.dispose()
  })

  it('installs dependencies in the background', async () => {
    const { svc } = setup()
    await svc.scaffold('J')
    await svc.install()
    expect((await settle(svc)).job).toMatchObject({ kind: 'install', status: 'done' })
    svc.dispose()
  })
})
