import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PHONE_ALERTS, newAlertTopic, subscribeUrl } from '@shared/alerts'
import type { HarnessEvent } from '@shared/events'
import { ENV_BLOCK_START, ensureEnvIgnored, envLine, envNameFor, findKnownKit, kitIndex, kitNote, mergeEnvFile, PARTNER_KITS, parsePartnerNote } from '@shared/partners'
import { nextRunAt, RESET_GRACE_MS, type QueuedPrompt } from '@shared/resetQueue'
import { AgentService, type QueryFactory } from '../src/main/agent/AgentService'
import { checkKit, PartnerService } from '../src/main/event/PartnerService'
import type { EventBus } from '../src/main/events/bus'
import { PhoneAlerts } from '../src/main/system/phone'
import { ResetQueue } from '../src/main/system/resetQueue'

const tmp = () => mkdtempSync(join(tmpdir(), 'harness-tools-'))
const NOW = Date.parse('2026-11-14T12:00:00Z')

describe('run when the limit resets', () => {
  const item = (createdAt = NOW): QueuedPrompt => ({ id: 'q1', sessionId: 's1', cwd: '/p', title: 'API', text: 'continue', createdAt })

  it('runs at the reset of the limit that was hit, else at the end of the 5-hour window', () => {
    expect(nextRunAt({ source: 'plan', status: 'rejected', resetsAt: NOW + 3600_000 }, [item()], NOW)).toEqual({ at: NOW + 3600_000 + RESET_GRACE_MS, limited: true })
    expect(nextRunAt({ source: 'plan', fiveHour: { pct: 85, resetsAt: NOW + 600_000 } }, [item()], NOW)).toEqual({ at: NOW + 600_000 + RESET_GRACE_MS, limited: false })
    // No reading at all: five hours after it was queued.
    expect(nextRunAt({ source: 'unknown' }, [item(NOW - 1000)], NOW).at).toBe(NOW - 1000 + 5 * 3600_000 + RESET_GRACE_MS)
    expect(nextRunAt({ source: 'plan', status: 'rejected', resetsAt: NOW + 1 }, [], NOW)).toEqual({ limited: true })
  })

  it('hands due messages to the window once, keeps them across restarts, and respects the switch', () => {
    const dir = tmp()
    let now = NOW
    let enabled = true
    const fired: string[][] = []
    const blocks: string[] = []
    const make = () =>
      new ResetQueue({
        file: join(dir, 'queue.json'),
        settings: () => ({ enabled, keepAwake: true }),
        usage: () => ({ source: 'plan', status: 'rejected', resetsAt: NOW + 60_000 }),
        push: () => {},
        fire: (items) => (fired.push(items.map((i) => i.text)), true),
        block: () => (blocks.push('on'), 7),
        unblock: () => blocks.push('off'),
        now: () => now,
      })
    const q = make()
    q.add({ sessionId: 's1', cwd: '/p', title: 'API', text: 'run the tests' })
    expect(blocks).toEqual(['on'])
    q.check()
    expect(fired).toEqual([])
    now = NOW + 60_000 + RESET_GRACE_MS
    enabled = false
    q.check()
    expect(fired).toEqual([])
    enabled = true
    q.check()
    q.check()
    expect(fired).toEqual([['run the tests']])
    // Saved: a restart still has it until the window confirms it was sent.
    const again = make()
    expect(again.state().items.map((i) => i.text)).toEqual(['run the tests'])
    again.done(again.state().items[0].id)
    expect(make().state().items).toEqual([])
    q.dispose()
    again.dispose()
  })
})

describe('phone alerts', () => {
  const sent: { url: string; body: Record<string, unknown> }[] = []
  const fakeFetch = (async (url: string, init: { body: string }) => {
    sent.push({ url, body: JSON.parse(init.body) })
    return new Response('{}', { status: 200 })
  }) as unknown as typeof fetch

  it('makes a long random topic and a subscribe link', () => {
    const topic = newAlertTopic((n) => new Uint8Array(n).map((_, i) => i * 7))
    expect(topic).toMatch(/^harness-[a-z2-9]{26}$/)
    expect(subscribeUrl({ server: 'https://ntfy.sh/', topic })).toBe(`https://ntfy.sh/${topic}`)
  })

  it('sends only when on, wanted and away, and not twice in a row', async () => {
    let away = false
    let settings = { ...DEFAULT_PHONE_ALERTS, topic: 'harness-test' }
    let now = NOW
    const p = new PhoneAlerts({ settings: () => settings, away: () => away, fetch: fakeFetch, now: () => now })
    expect(await p.alert('approvals', 'Claude needs your approval', 'Bash')).toBe(false) // alerts are off by default
    settings = { ...settings, enabled: true }
    expect(await p.alert('approvals', 'Claude needs your approval', 'Bash')).toBe(false) // at the laptop
    away = true
    expect(await p.alert('approvals', 'Claude needs your approval', 'Bash')).toBe(true)
    expect(await p.alert('approvals', 'Claude needs your approval', 'Bash')).toBe(false) // too soon
    now += 30_000
    settings = { ...settings, approvals: false }
    expect(await p.alert('approvals', 'Claude needs your approval', 'Bash')).toBe(false)
    expect(sent).toEqual([{ url: 'https://ntfy.sh/', body: { topic: 'harness-test', title: 'Claude needs your approval', message: 'Bash', priority: 3, tags: [] } }])
  })
})

describe('partner kits', () => {
  it('keeps everything else in .env and replaces only Harness’s block', () => {
    const before = 'PORT=3000\n# mine\nSECRET=abc\n'
    const once = mergeEnvFile(before, { EXA_API_KEY: 'k1' }, ['EXA_API_KEY'])
    expect(once).toBe(`PORT=3000\n# mine\nSECRET=abc\n\n${ENV_BLOCK_START}\nEXA_API_KEY="k1"\n# <<< Harness partner keys\n`)
    const twice = mergeEnvFile(once, { EXA_API_KEY: 'k2', OPENAI_API_KEY: 'o' }, ['OPENAI_API_KEY', 'EXA_API_KEY'])
    expect(twice).toContain('PORT=3000\n# mine\nSECRET=abc\n')
    expect(twice.match(/Harness partner keys \(managed/g)).toHaveLength(1)
    expect(twice).toMatch(/OPENAI_API_KEY="o"\nEXA_API_KEY="k2"/)
    expect(mergeEnvFile(twice, {}, [])).toBe('PORT=3000\n# mine\nSECRET=abc\n')
    expect(envLine('X', 'a"b\\c\nd')).toBe('X="a\\"b\\\\c\\nd"')
  })

  it('makes sure .env is ignored by git', () => {
    expect(ensureEnvIgnored('node_modules\n')).toBe('node_modules\n.env\n')
    expect(ensureEnvIgnored('')).toBe('.env\n')
    expect(ensureEnvIgnored('node_modules\n.env\n')).toBeNull()
    expect(ensureEnvIgnored('.env.*\n')).toBe('.env.*\n.env\n')
  })

  it('writes kit notes for Claude without any key values', () => {
    const exa = PARTNER_KITS.find((k) => k.id === 'exa')!
    const note = kitNote(exa, ['EXA_API_KEY'])
    expect(note).toMatch(/`EXA_API_KEY`: API key \(set\)/)
    expect(note).toMatch(/npm install exa-js/)
    expect(kitIndex(PARTNER_KITS, ['EXA_API_KEY'])).toMatch(/\| Exa \| yes \|/)
    // Every API kit has env names; partners without an API are info only.
    for (const k of PARTNER_KITS) for (const key of k.keys) expect(key.env).toMatch(/^[A-Z][A-Z0-9_]+$/)
  })

  it('stores keys, writes them into the event project, and gives them to its sessions only', () => {
    const project = tmp()
    const worktree = tmp()
    writeFileSync(join(project, '.env'), 'PORT=3000\n')
    const pushed: unknown[] = []
    const svc = new PartnerService({
      file: join(tmp(), 'keys.json'),
      encrypt: (v) => Buffer.from(v).toString('base64'),
      decrypt: (e) => Buffer.from(e, 'base64').toString(),
      projectDir: () => project,
      extraDirs: () => [worktree],
      push: (s) => pushed.push(s),
    })
    svc.setKey('EXA_API_KEY', 'exa-mine-1234')
    svc.setKey('CLOUDINARY_CLOUD_NAME', 'demo')
    svc.setKey('CLOUDINARY_API_KEY', '111')
    svc.setKey('CLOUDINARY_API_SECRET', 'shh')
    svc.setTeamKeys({ EXA_API_KEY: { value: 'exa-teams', from: 'Bo' }, OPENAI_API_KEY: { value: 'sk-team', from: 'Bo' } })
    svc.write()
    const env = readFileSync(join(project, '.env'), 'utf8')
    expect(env).toMatch(/^PORT=3000\n/)
    // Your own key wins over a teammate's; Cloudinary's URL is built for the SDKs.
    expect(env).toMatch(/EXA_API_KEY="exa-mine-1234"/)
    expect(env).toMatch(/OPENAI_API_KEY="sk-team"/)
    expect(env).toMatch(/CLOUDINARY_URL="cloudinary:\/\/111:shh@demo"/)
    expect(readFileSync(join(project, '.gitignore'), 'utf8')).toBe('.env\n')
    expect(existsSync(join(worktree, '.env'))).toBe(true)
    expect(readFileSync(join(project, 'challenge', 'partners', 'exa.md'), 'utf8')).not.toContain('exa-mine')
    expect(svc.envFor(join(project, 'src'))).toMatchObject({ EXA_API_KEY: 'exa-mine-1234' })
    expect(svc.envFor(worktree)).toMatchObject({ OPENAI_API_KEY: 'sk-team' })
    expect(svc.envFor(tmp())).toEqual({})
    // The UI only ever sees masked previews.
    const st = svc.state()
    expect(st.keys.EXA_API_KEY).toMatchObject({ source: 'me', share: true, preview: 'exa…1234' })
    expect(st.keys.OPENAI_API_KEY).toMatchObject({ source: 'team', from: 'Bo' })
    expect(JSON.stringify(st)).not.toContain('exa-mine-1234')
    expect(svc.sharedSecrets()).toMatchObject({ EXA_API_KEY: 'exa-mine-1234' })
    svc.setShare('EXA_API_KEY', false)
    expect(svc.sharedSecrets().EXA_API_KEY).toBeUndefined()
    svc.dispose()
  })

  it('starts empty; a key for a known service gets its kit, anything else waits for Claude', () => {
    const svc = new PartnerService({ file: join(tmp(), 'k.json'), encrypt: (v) => v, decrypt: (e) => e, projectDir: () => undefined, extraDirs: () => [], push: () => {} })
    expect(svc.state().kits).toEqual([])
    expect(svc.state().known).toContain('Exa')
    expect(() => svc.setKey('lower_case', 'x')).toThrow(/valid variable name/)
    expect(() => svc.addKey({ key: 'two words' })).toThrow(/one line without spaces/)

    const exa = svc.addKey({ key: 'exa-key-1234', name: 'exa.ai' })
    expect(exa).toMatchObject({ kitId: 'exa', known: true })
    expect(svc.values()).toMatchObject({ EXA_API_KEY: 'exa-key-1234' })

    const acme = svc.addKey({ key: 'ak_live_5678', name: 'Acme Maps' })
    expect(acme).toMatchObject({ kitId: 'custom-acme-maps', known: false })
    const unnamed = svc.addKey({ key: 'zzz-0001' })
    const again = svc.addKey({ key: 'zzz-0002' })
    expect(svc.state().kits.map((k) => [k.id, k.keys[0].env, k.research])).toEqual([
      ['exa', 'EXA_API_KEY', undefined],
      ['custom-acme-maps', 'ACME_MAPS_API_KEY', 'pending'],
      [unnamed.kitId, 'NEW_API_KEY', 'pending'],
      [again.kitId, 'NEW_API_KEY_2', 'pending'],
    ])
    expect(unnamed.kitId).toBe('custom-key')
    expect(again.kitId).toBe('custom-key-2')
    // Keys Harness doesn't know are masked like any secret.
    expect(svc.state().keys.ACME_MAPS_API_KEY.preview).toBe('ak_…5678')
    svc.dispose()
  })

  it('picks up what Claude found out, renames the variable, and keeps Claude’s note', () => {
    const project = tmp()
    const svc = new PartnerService({ file: join(tmp(), 'k.json'), encrypt: (v) => v, decrypt: (e) => e, projectDir: () => project, extraDirs: () => [], push: () => {} })
    const { kitId } = svc.addKey({ key: 'ak_live_5678', name: 'Acme Maps' })
    svc.write()
    const notePath = join(project, 'challenge', 'partners', `${kitId}.md`)
    const pending = readFileSync(notePath, 'utf8')
    expect(pending).toMatch(/^---\nstatus: pending\nname: "Acme Maps"\nenv: ACME_MAPS_API_KEY\n---/)
    expect(pending).not.toContain('ak_live')
    expect(svc.readNotes()).toBe(false)

    // Claude replaces the note with what it found.
    const claude = [
      '---',
      'status: ready',
      'name: Acme Maps API',
      'env: ACME_API_KEY',
      'docs: https://docs.acme.dev',
      'works: true',
      'what: Geocoding and routing; we could route deliveries on the map.',
      '---',
      '## How to use it',
      'npm install @acme/maps',
      '',
    ].join('\n')
    writeFileSync(notePath, claude)
    expect(svc.readNotes()).toBe(true)
    const kit = svc.state().kits.find((k) => k.id === kitId)!
    expect(kit).toMatchObject({ name: 'Acme Maps API', research: 'done', docs: 'https://docs.acme.dev', keys: [{ env: 'ACME_API_KEY' }] })
    expect(kit.what).toMatch(/^Geocoding/)
    expect(svc.state().checks[kitId]).toMatchObject({ ok: true, message: 'Works (Claude checked it)' })
    expect(svc.values()).toEqual({ ACME_API_KEY: 'ak_live_5678' })
    // Reading the same note again changes nothing.
    expect(svc.readNotes()).toBe(false)
    svc.write()
    const env = readFileSync(join(project, '.env'), 'utf8')
    expect(env).toContain('ACME_API_KEY="ak_live_5678"')
    expect(env).not.toContain('ACME_MAPS_API_KEY')
    expect(readFileSync(notePath, 'utf8')).toBe(claude)
    expect(readFileSync(join(project, 'challenge', 'partners', 'README.md'), 'utf8')).toMatch(/\| Acme Maps API \| yes \| `ACME_API_KEY` \|/)

    // Removing the key takes it out of .env and deletes its note.
    svc.remove(kitId)
    svc.write()
    expect(existsSync(notePath)).toBe(false)
    expect(readFileSync(join(project, '.env'), 'utf8')).not.toContain('ACME')
    expect(svc.state().kits).toEqual([])
    svc.dispose()
  })

  it('never reuses a note left in the project, and clears Harness’s old notes for services not in use', () => {
    const project = tmp()
    const notes = join(project, 'challenge', 'partners')
    mkdirSync(notes, { recursive: true })
    writeFileSync(join(notes, 'custom-key.md'), '---\nstatus: ready\nname: Old\nwhat: an old key\n---\n')
    const exa = PARTNER_KITS.find((k) => k.id === 'exa')!
    writeFileSync(join(notes, 'exa.md'), kitNote(exa, []))
    writeFileSync(join(notes, 'openai.md'), '# My own notes about OpenAI\n')
    const svc = new PartnerService({ file: join(tmp(), 'k.json'), encrypt: (v) => v, decrypt: (e) => e, projectDir: () => project, extraDirs: () => [], push: () => {} })
    expect(svc.addKey({ key: 'zz-1' }).kitId).toBe('custom-key-2')
    svc.write()
    expect(svc.state().kits[0]).toMatchObject({ name: 'New API key', research: 'pending' })
    expect(existsSync(join(notes, 'exa.md'))).toBe(false)
    expect(existsSync(join(notes, 'openai.md'))).toBe(true)
    svc.dispose()
  })

  it('reads Claude’s verdict when a key didn’t work, and ignores broken or pending notes', () => {
    expect(parsePartnerNote('no front matter')).toBeNull()
    expect(parsePartnerNote('---\n: : bad\n---')).toBeNull()
    expect(parsePartnerNote('---\nstatus: ready\nworks: false\nproblem: 401 unauthorized\nwhat: x\ndocs: javascript:alert(1)\n---\n')).toEqual({
      status: 'ready',
      name: undefined,
      env: undefined,
      docs: undefined,
      works: false,
      problem: '401 unauthorized',
      what: 'x',
    })
    expect(envNameFor('Acme Maps')).toBe('ACME_MAPS_API_KEY')
    expect(envNameFor('github token')).toBe('GITHUB_TOKEN')
    expect(envNameFor('42 labs')).toBe('K_42_LABS_API_KEY')
    expect(envNameFor('!!!')).toBeUndefined()
    expect(findKnownKit('Featherless.ai')?.id).toBe('featherless')
    expect(findKnownKit('OpenAI')?.id).toBe('openai')
    expect(findKnownKit('Acme')).toBeUndefined()
  })

  it('checks keys with the right request and reads the answer', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const answer = (status: number) =>
      (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return new Response('{}', { status })
      }) as unknown as typeof fetch
    const kit = (id: string) => PARTNER_KITS.find((k) => k.id === id)!
    expect(await checkKit(kit('exa'), { EXA_API_KEY: 'bad' }, answer(401))).toMatchObject({ ok: false, message: expect.stringMatching(/rejected/) })
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('bad')
    expect(await checkKit(kit('exa'), { EXA_API_KEY: 'k' }, answer(402))).toMatchObject({ ok: false, message: expect.stringMatching(/out of credits/) })
    expect(await checkKit(kit('cloudinary'), { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'a', CLOUDINARY_API_SECRET: 'b' }, answer(200))).toEqual({ ok: true, message: 'Key works' })
    expect(calls.at(-1)!.url).toBe('https://api.cloudinary.com/v1_1/demo/ping')
    expect((calls.at(-1)!.init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from('a:b').toString('base64')}`)
    expect(await checkKit(kit('aiven'), { AIVEN_TOKEN: 't' }, answer(200))).toMatchObject({ ok: true })
    expect((calls.at(-1)!.init.headers as Record<string, string>).authorization).toBe('aivenv1 t')
    expect(await checkKit(kit('openai'), {}, answer(200))).toMatchObject({ ok: false, message: 'Paste OPENAI_API_KEY first.' })
  })
})

describe('team radar inside a session', () => {
  it('tells Claude once per file before it edits a file a teammate changed', async () => {
    const proj = tmp()
    mkdirSync(join(proj, 'src'))
    let options: { hooks?: { PreToolUse?: { matcher: string; hooks: ((i: unknown, id?: string) => Promise<Record<string, unknown>>)[] }[] } } = {}
    const factory = ((args: { options: typeof options }) => {
      options = args.options
      return Object.assign((async function* () {})(), { interrupt: async () => {} })
    }) as unknown as QueryFactory
    const events: HarnessEvent[] = []
    const bus = { emit: (e: HarnessEvent | HarnessEvent[]) => events.push(...(Array.isArray(e) ? e : [e])) } as unknown as EventBus
    const svc = new AgentService({
      bus,
      getEnv: () => ({}),
      queryFactory: factory,
      teamRadar: (abs) => (abs.endsWith('src/api.ts') ? { text: 'Heads-up: Ada is changing src/api.ts', names: ['Ada'] } : undefined),
    })
    const { id } = svc.start({ cwd: proj })
    const radar = options.hooks!.PreToolUse!.find((m) => m.matcher.includes('Edit'))!
    const edit = (file: string) => radar.hooks[0]({ hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file } }, 't')
    expect(await edit(join(proj, 'src/api.ts'))).toEqual({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'Heads-up: Ada is changing src/api.ts' } })
    expect(await edit('src/api.ts')).toEqual({})
    expect(await edit(join(proj, 'src/other.ts'))).toEqual({})
    expect(events.filter((e) => e.type === 'notice').map((e) => e.type === 'notice' && e.text)).toEqual([expect.stringMatching(/^Team radar: Ada is also changing api\.ts/)])
    svc.close(id)
  })
})
