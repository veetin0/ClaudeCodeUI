import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  crewBranch,
  crewMembers,
  fitPayload,
  MAX_CREW_JSON,
  pickAssignee,
  pickCrewPayload,
  repoName,
  type CrewMemberView,
  type CrewPayload,
  type CrewState,
} from '@shared/crew'
import type { MemberStatus, TeamConfig } from '@shared/team'
import { AgentService, type QueryFactory } from '../src/main/agent/AgentService'
import { CrewDriver, type MissionEvent } from '../src/main/crew/CrewDriver'
import { CrewWorker, type CrewWorkerEvent } from '../src/main/crew/CrewWorker'
import { EventBus } from '../src/main/events/bus'
import { openCrew, sealCrew } from '../src/main/team/secrets'
import { TeamService } from '../src/main/team/TeamService'
import { createRelay } from '../relay/relay.mjs'

const sh = (cmd: string, cwd?: string) =>
  execSync(cmd, { cwd, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
    .toString()
    .trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const NOW = Date.parse('2026-11-14T12:00:00Z')

describe('crew protocol', () => {
  const member = (id: string, name: string, pct?: number, updatedAt = NOW): MemberStatus => ({
    id,
    name,
    sessions: [],
    usage: pct === undefined ? { source: 'unknown' } : { source: 'plan', fiveHour: { pct } },
    updatedAt,
  })
  const crewPayload = (patch: Partial<CrewPayload> = {}): CrewPayload => ({
    role: 'crew',
    v: 1,
    app: 'cli',
    version: '0.1.0',
    accepting: true,
    missions: [],
    asks: [],
    outbox: [],
    ...patch,
  })

  it('sanitises payloads from teammates and drops what does not fit', () => {
    expect(pickCrewPayload({ role: 'nobody' })).toBeNull()
    const d = pickCrewPayload({
      role: 'driver',
      v: 1,
      repo: { url: 'https://github.com/team/app.git', base: 'main', name: 'app', head: 'abc1234def', bundle: 'p-abc123' },
      missions: [
        { id: 'm-1', title: 'API', brief: 'do it', to: 'a', branch: 'crew/ada/m-1', createdAt: 1 },
        { id: 'bad id!', title: 'x', to: 'a', branch: 'b', createdAt: 1 },
        { id: 'm-2', title: 'x', to: 'a', branch: 'crew/../../etc passwd', createdAt: 1 },
      ],
      cancel: ['m-9', '../x'],
      answers: [{ id: 'r1', allow: true }, { id: 'r2' }],
      outbox: [],
    })
    expect(d).toMatchObject({ role: 'driver', repo: { name: 'app' }, missions: [{ id: 'm-1' }], cancel: ['m-9'], answers: [{ id: 'r1', allow: true }] })
    // A folder name that would escape the crew folder, or a file id that isn't one, is refused.
    expect(
      pickCrewPayload({
        role: 'driver',
        repo: { base: 'main', name: '..', head: 'abc1234', bundle: 'p-abc1' },
        missions: [],
        cancel: [],
        answers: [],
        outbox: [],
      }),
    ).toMatchObject({ repo: undefined })
    expect(
      pickCrewPayload({
        role: 'driver',
        repo: { base: 'main', name: 'app', head: 'abc1234', bundle: '../../x' },
        missions: [],
        cancel: [],
        answers: [],
        outbox: [],
      }),
    ).toMatchObject({ repo: undefined })
    expect(
      pickCrewPayload({
        role: 'driver',
        repo: { base: '--upload-pack=evil', name: 'app', head: 'abc1234', bundle: 'p-abc1' },
        missions: [],
        cancel: [],
        answers: [],
        outbox: [],
      }),
    ).toMatchObject({ repo: undefined })
    const big = fitPayload(
      crewPayload({ outbox: Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, from: 'a', fromName: 'A', to: '*', text: 'x'.repeat(4000), at: i })) }),
    )
    expect(JSON.stringify(big).length).toBeLessThanOrEqual(MAX_CREW_JSON)
    expect(big.outbox.at(-1)?.id).toBe('c29')
  })

  it('names branches and folders safely', () => {
    expect(crewBranch('Åsa Lind', 'm-7f3a2')).toBe('crew/asa-lind/m-7f3a2')
    expect(repoName('git@github.com:team/mini-junction.git')).toBe('mini-junction')
    expect(repoName('https://github.com/team/app/')).toBe('app')
  })

  it('gives the next mission to an idle member with the most usage left', () => {
    const payloads = new Map<string, CrewPayload>([
      ['a', crewPayload()],
      ['b', crewPayload()],
      ['c', crewPayload({ missions: [{ id: 'm-1', title: 'x', state: 'working' }] })],
      ['d', crewPayload({ problem: 'no access' })],
      ['e', crewPayload()],
    ])
    // Percent of the 5-hour window used: Ada has 70 % left, Ben 20 %, Cy 10 % (busy), Di none, Eve is offline.
    const crew = crewMembers(
      [member('a', 'Ada', 30), member('b', 'Ben', 80), member('c', 'Cy', 90), member('d', 'Di', 100), member('e', 'Eve', 10, NOW - 60_000)],
      payloads,
      new Map(),
      NOW,
    )
    expect(crew.map((c) => c.name)).toEqual(['Ada', 'Ben', 'Cy', 'Di', 'Eve'])
    expect(pickAssignee(crew)?.name).toBe('Ada')
    // One already given to Ada in this batch: the next goes to Ben (idle) rather than queueing behind her.
    expect(pickAssignee(crew, new Map([['a', 1]]))?.name).toBe('Ben')
    expect(pickAssignee(crew, new Map(), 'cy')?.name).toBe('Cy')
    expect(pickAssignee(crew, new Map(), 'Di')).toBeUndefined()
    expect(pickAssignee(crew.filter((c: CrewMemberView) => c.name === 'Eve'))).toBeUndefined()
  })

  it('seals crew traffic with the team key, separately from shared secrets', () => {
    const sealed = sealCrew('team-token-123456789', { role: 'crew', hello: 'world' })
    expect(sealed).not.toContain('world')
    expect(openCrew('team-token-123456789', sealed)).toEqual({ role: 'crew', hello: 'world' })
    expect(openCrew('another-token-12345678', sealed)).toBeNull()
  })
})

describe('crew driver bookkeeping', () => {
  const member = (id: string, name: string, updatedAt: number): MemberStatus => ({ id, name, sessions: [], usage: { source: 'unknown' }, updatedAt })
  const crewPayload = (patch: Partial<CrewPayload> = {}): CrewPayload => ({
    role: 'crew',
    v: 1,
    app: 'cli',
    version: '0.1.0',
    accepting: true,
    missions: [],
    asks: [],
    outbox: [],
    ...patch,
  })
  /** A small committed project, and an in-memory team server. */
  const project = () => {
    const dir = mkdtempSync(join(tmpdir(), 'crew-lead-'))
    sh('git init -q -b main && git config user.name Veeti && git config user.email v@example.com', dir)
    writeFileSync(join(dir, 'README.md'), '# app\n')
    sh('git add -A && git commit -q -m init', dir)
    return dir
  }
  const memoryFiles = () => {
    const stored = new Map<string, Buffer>()
    return { stored, put: async (id: string, d: Buffer) => void stored.set(id, d), get: async (id: string) => stored.get(id) ?? null }
  }
  const setup = () => {
    let now = NOW
    const delivered: string[] = []
    const dir = project()
    const files = memoryFiles()
    const driver = new CrewDriver({
      me: () => ({ id: 'me', name: 'Veeti' }),
      myUsage: () => ({ source: 'unknown' }),
      nudge: () => {},
      push: () => {},
      deliver: (_s, text) => (delivered.push(text), true),
      autoReports: () => true,
      joinCommand: () => undefined,
      files,
      tmpDir: mkdtempSync(join(tmpdir(), 'crew-tmp-')),
      now: () => now,
    })
    return { driver, delivered, dir, files, tick: (ms: number) => (now += ms), at: () => now }
  }

  it('hands a mission on when its crew member vanishes, and tells them to stop if they come back', async () => {
    const { driver, delivered, dir, tick, at } = setup()
    driver.received([
      { member: member('a', 'Ada', at()), payload: crewPayload() },
      { member: member('b', 'Ben', at()), payload: crewPayload() },
    ])
    const out = await driver.dispatch('s1', dir, [{ title: 'API', brief: 'build it', to: 'Ada' }])
    const id = /✓ (m-[0-9a-f]+)/.exec(out)![1]
    expect(driver.payload()!.missions.map((m) => m.id)).toEqual([id])
    // Ada picks it up (it leaves the driver's payload), then her laptop goes quiet.
    driver.received([
      { member: member('a', 'Ada', at()), payload: crewPayload({ missions: [{ id, title: 'API', state: 'working', branch: `crew/ada/${id}` }] }) },
      { member: member('b', 'Ben', at()), payload: crewPayload() },
    ])
    expect(driver.payload()!.missions).toEqual([])
    const adaLastSeen = at()
    tick(11 * 60_000)
    driver.received([
      { member: member('a', 'Ada', adaLastSeen), payload: crewPayload({ missions: [{ id, title: 'API', state: 'working' }] }) },
      { member: member('b', 'Ben', at()), payload: crewPayload() },
    ])
    await sleep(50)
    const st = driver.state()
    expect(st.missions.find((m) => m.id === id)).toMatchObject({ state: 'stopped', movedTo: 'Ben' })
    expect(st.missions.find((m) => m.continues === id)).toMatchObject({ toName: 'Ben', state: 'queued', from: 'main' })
    expect(delivered.at(-1)).toMatch(/Ada's Claude stopped .* → given to Ben/)
    expect(driver.payload()!.cancel).toEqual([id])
    // Ada is back and stops it as told: the cancel is done.
    driver.received([
      { member: member('a', 'Ada', at()), payload: crewPayload({ missions: [{ id, title: 'API', state: 'stopped' }] }) },
      { member: member('b', 'Ben', at()), payload: crewPayload() },
    ])
    expect(driver.payload()!.cancel).toEqual([])
  })

  it('cancels a mission nobody picked up yet', async () => {
    const { driver, dir, tick, at } = setup()
    driver.received([{ member: member('a', 'Ada', NOW), payload: crewPayload() }])
    const id = /✓ (m-[0-9a-f]+)/.exec(await driver.dispatch('s1', dir, [{ title: 'API', brief: 'x' }]))![1]
    expect(driver.stop(id)).toBe(`Cancelled ${id} before it started.`)
    // Off the payload at once; the cancel stays a little in case Ada's harness-crew had already seen it.
    expect(driver.payload()).toMatchObject({ missions: [], cancel: [id] })
    expect(driver.stop(id)).toMatch(/already ended/)
    tick(3 * 60_000)
    driver.received([{ member: member('a', 'Ada', at()), payload: crewPayload() }])
    expect(driver.payload()!.cancel).toEqual([])
  })

  it('shares the committed project through the team server, and says what is in the way', async () => {
    const files = memoryFiles()
    let inTeam = false
    const driver = new CrewDriver({
      me: () => (inTeam ? { id: 'me', name: 'Veeti' } : null),
      myUsage: () => ({ source: 'unknown' }),
      nudge: () => {},
      push: () => {},
      deliver: () => false,
      autoReports: () => true,
      joinCommand: () => undefined,
      files,
      tmpDir: mkdtempSync(join(tmpdir(), 'crew-tmp-')),
    })
    await driver.setProject(undefined)
    expect(driver.state().projectNote).toMatchObject({ tone: 'info', text: expect.stringMatching(/Create the project/) })
    await driver.setProject(mkdtempSync(join(tmpdir(), 'not-git-')))
    expect(driver.state()).toMatchObject({ project: undefined, projectNote: { tone: 'warn', text: expect.stringMatching(/isn’t a git repository/) } })
    const dir = project()
    await driver.setProject(dir)
    expect(driver.state().projectNote).toMatchObject({ text: expect.stringMatching(/Start the team/) })
    inTeam = true
    await driver.setProject(dir)
    const shared = driver.state().project!
    expect(shared).toMatchObject({ base: 'main', name: expect.stringMatching(/^crew-lead-/), head: sh('git rev-parse HEAD', dir) })
    expect([...files.stored.keys()]).toEqual([shared.bundle])
    // Crew members get it in the lead's status right away; nothing new is uploaded until a branch moves.
    expect(driver.payload()?.repo).toEqual(shared)
    await driver.setProject(dir)
    expect(files.stored.size).toBe(1)
    writeFileSync(join(dir, 'README.md'), '# app, edited\n')
    await driver.setProject(dir)
    expect(driver.state().projectNote).toMatchObject({ tone: 'info', text: expect.stringMatching(/Uncommitted changes reach the crew once they’re committed/) })
    sh('git commit -qam edit', dir)
    await driver.setProject(dir)
    expect(files.stored.size).toBe(2)
    expect(driver.state().project!.head).toBe(sh('git rev-parse HEAD', dir))
  })

  it('explains what to do when there is no team or no crew yet', async () => {
    const lonely = new CrewDriver({
      me: () => null,
      myUsage: () => ({ source: 'unknown' }),
      nudge: () => {},
      push: () => {},
      files: memoryFiles(),
      deliver: () => false,
      autoReports: () => true,
      joinCommand: () => undefined,
    })
    expect(lonely.statusText()).toMatch(/Not in a team yet/)
    await expect(lonely.dispatch('s1', '/p', [{ title: 'x', brief: 'y' }])).rejects.toThrow(/create one on the Team board/)
    const { driver, dir } = setup()
    await expect(driver.dispatch('s1', dir, [{ title: 'x', brief: 'y' }])).rejects.toThrow(/No crew members yet/)
  })
})

// ---------- end to end: relay + a lead with no git remote + two crew members on a fake Claude ----------

/** Calls a tool on an in-process SDK MCP server the way Claude Code would (test-only: reaches into the MCP server). */
async function callTool(server: unknown, name: string, args: Record<string, unknown>) {
  const tools = (
    server as { instance: { _registeredTools: Record<string, { handler: (a: unknown, extra: unknown) => Promise<{ content: { text: string }[] }> }> } }
  ).instance._registeredTools
  const r = await tools[name].handler(args, { signal: new AbortController().signal })
  return r.content[0].text
}

const result = (isError = false, text = 'Done.') => ({
  type: 'result',
  subtype: isError ? 'error_during_execution' : 'success',
  is_error: isError,
  result: text,
  total_cost_usd: 0.02,
  duration_ms: 5,
  num_turns: 1,
  usage: { output_tokens: 10 },
  modelUsage: { 'claude-sonnet': { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.02 } },
  session_id: 'fake',
  uuid: 'u',
})

type Behaviour = (o: { cwd: string; crew: unknown; text: string; canUseTool: Function }) => Promise<{ limited?: boolean } | void>

function fakeClaude(behave: Behaviour): QueryFactory {
  return (({ prompt, options }: { prompt: AsyncIterable<{ message: { content: unknown } }>; options: Record<string, unknown> }) => {
    async function* run() {
      for await (const msg of prompt) {
        const text = typeof msg.message.content === 'string' ? msg.message.content : ''
        const r = await behave({
          cwd: options.cwd as string,
          crew: (options.mcpServers as Record<string, unknown>).crew,
          text,
          canUseTool: options.canUseTool as Function,
        })
        if (r?.limited) {
          yield {
            type: 'rate_limit_event',
            rate_limit_info: { status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 3600, rateLimitType: 'five_hour', utilization: 1 },
            uuid: 'r',
            session_id: 'fake',
          }
          yield result(true, 'Claude AI usage limit reached')
        } else yield result()
      }
    }
    return Object.assign(run(), { interrupt: async () => {}, setPermissionMode: async () => {}, setModel: async () => {} })
  }) as unknown as QueryFactory
}

describe('crew mode end to end', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-crew-'))
  const driverDir = join(root, 'driver')
  const token = 'crew-test-token-0123456789'
  let server: Server
  let relayUrl = ''
  const teams: TeamService[] = []
  const delivered: { sessionId: string; text: string }[] = []
  let driver: CrewDriver
  let driverState: CrewState | undefined
  const workers: { name: string; worker: CrewWorker; events: CrewWorkerEvent[]; team: TeamService }[] = []
  let pushDecision: { behavior: string; message?: string } | undefined

  const makeTeam = (id: string, name: string, crew: ConstructorParameters<typeof TeamService>[0]['crew'], usage?: () => void) => {
    let cfg: TeamConfig | null = { relayUrl, token, memberId: id, memberName: name, hosting: false }
    const t = new TeamService({
      getConfig: () => cfg,
      setConfig: (c) => (cfg = c),
      memberId: () => id,
      usesApiKey: () => false,
      planUsage: async () => undefined,
      projectDir: () => undefined,
      hackforge: async () => undefined,
      push: () => usage?.(),
      crew,
    })
    teams.push(t)
    return t
  }

  const addCrew = (id: string, name: string, behave: Behaviour) => {
    const bus = new EventBus()
    const events: CrewWorkerEvent[] = []
    // eslint-disable-next-line prefer-const
    let team: TeamService
    let worker: CrewWorker
    const agents = new AgentService({
      bus,
      getEnv: () => ({}),
      queryFactory: fakeClaude(behave),
      onRateLimit: (info) => (team.onRateLimit(info), worker.onRateLimit(info)),
    })
    worker = new CrewWorker({
      me: () => ({ id, name }),
      agents,
      bus,
      home: join(root, `home-${name}`),
      app: 'cli',
      version: 'test',
      nudge: () => {},
      files: { get: (fid) => team.getFile(fid), put: (fid, data) => team.putFile(fid, data) },
      stateFile: join(root, `state-${name}.json`),
      onEvent: (e) => events.push(e),
    })
    team = makeTeam(id, name, { payload: () => worker.payload(), received: (e) => worker.received(e), fast: () => worker.fast() })
    workers.push({ name, worker, events, team })
    return worker
  }

  /** One sync round for everyone, until `done()` or the timeout. */
  const until = async (done: () => boolean, ms = 20_000) => {
    const end = Date.now() + ms
    while (!done()) {
      if (Date.now() > end) throw new Error('timed out')
      for (const t of teams) await t.sync()
      await sleep(30)
    }
  }

  beforeAll(async () => {
    // No GitHub, no remote at all: the project and the work travel through the team server.
    sh(`git init -q -b main "${driverDir}"`)
    sh('git config user.name Veeti && git config user.email v@example.com', driverDir)
    writeFileSync(join(driverDir, 'README.md'), '# Mini\n')
    sh('git add -A && git commit -q -m init', driverDir)
    server = createServer(createRelay())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    relayUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    // eslint-disable-next-line prefer-const
    let driverTeam: TeamService
    driver = new CrewDriver({
      me: () => ({ id: 'drv00001', name: 'Veeti' }),
      myUsage: () => ({ source: 'plan', fiveHour: { pct: 80 } }),
      nudge: () => {},
      push: (s) => (driverState = s),
      deliver: (sessionId, text) => (delivered.push({ sessionId, text }), true),
      autoReports: () => true,
      joinCommand: () => 'npx harness-crew HT1.test',
      files: { put: (fid, data) => driverTeam.putFile(fid, data), get: (fid) => driverTeam.getFile(fid) },
      tmpDir: join(root, 'lead-tmp'),
    })
    driverTeam = makeTeam('drv00001', 'Veeti', { payload: () => driver.payload(), received: (e) => driver.received(e), fast: () => driver.fast() })
    void driverTeam

    addCrew('anna0001', 'Anna', async ({ cwd, crew, text, canUseTool }) => {
      if (text.startsWith('Mission') && text.includes('Feature')) {
        // Something outside the allowlist: the driver decides.
        const decision = await canUseTool('Bash', { command: 'rm -rf build' }, { signal: new AbortController().signal, toolUseID: 't1', requestId: 'ask-1' })
        // Pushing is harness-crew's job: declined on the spot, with a pointer to the report.
        pushDecision = await canUseTool(
          'Bash',
          { command: 'git push -u origin HEAD' },
          { signal: new AbortController().signal, toolUseID: 't2', requestId: 'ask-2' },
        )
        writeFileSync(join(cwd, 'feature.txt'), `built by Anna (${decision.behavior})\n`)
        sh('git add -A && git commit -m feature', cwd)
        await callTool(crew, 'message', { to: 'lead', text: 'Feature is exported from feature.txt' })
        await callTool(crew, 'report', { status: 'done', summary: 'Added feature.txt; checks pass.' })
      }
      if (text.startsWith('Mission') && text.includes('Big job')) {
        writeFileSync(join(cwd, 'half.txt'), 'first half\n')
        sh('git add -A && git commit -m half', cwd)
        return { limited: true }
      }
    })
    addCrew('ben00001', 'Ben', async ({ cwd, crew, text }) => {
      if (text.startsWith('Mission')) {
        writeFileSync(join(cwd, 'second-half.txt'), 'second half\n')
        // No report: harness-crew nudges once, then finishes it with Claude's last words.
        if (text.includes('Continuing')) return
        await callTool(crew, 'report', { status: 'done', summary: 'ok' })
      }
    })
  })

  afterAll(() => {
    for (const t of teams) t.dispose()
    server?.close()
  })

  it('copies the lead’s project to every crew laptop before any mission, through the team server', async () => {
    // The relay only accepts files from a team that exists: sync once first, as Harness does on Start.
    for (const t of teams) await t.sync()
    await driver.setProject(driverDir)
    await until(() => workers.every((w) => w.events.some((e) => e.kind === 'repo' && e.state === 'ready')))
    expect(readFileSync(join(root, 'home-Anna', 'driver', 'README.md'), 'utf8')).toBe('# Mini\n')
    await until(() => (driverState?.members.length ?? 0) === 2 && driverState!.members.every((m) => m.accepting))
    expect(driver.statusText()).toMatch(/Crew: 2 of 2 ready/)
    expect(driver.statusText()).toMatch(/Your own plan: 20% usage left/)
  })

  it('runs a mission: dispatch → approval → messages → branch back in the lead’s repo → report', async () => {
    const out = await driver.dispatch('s1', driverDir, [{ title: 'Feature', brief: 'Add feature.txt', to: 'anna' }])
    expect(out).toMatch(/^✓/)
    const id = /✓ (m-[0-9a-f]+)/.exec(out)![1]
    expect(out).toMatch(/→ Anna/)
    expect(out).toMatch(new RegExp(`branch crew/anna/${id}`))

    // Anna's Claude asks to run something outside its allowlist; the question shows on the driver's board.
    await until(() => (driverState?.asks.length ?? 0) === 1)
    expect(driverState!.asks[0]).toMatchObject({ fromName: 'Anna', summary: 'Bash: rm -rf build', missionTitle: 'Feature' })
    const waiting = driver.wait('s1', { timeoutSec: 30 })
    driver.answer(driverState!.asks[0].id, true)

    let first = ''
    void waiting.then((t) => (first = t))
    await until(() => !!first)
    // The waiting crew_wait gets the message (sent before the work)…
    expect(first).toMatch(new RegExp(`Message from Anna \\(about ${id}\\):\nFeature is exported from feature.txt`))

    // …and the report, with nobody waiting, arrives in the session as a "[crew]" turn.
    await until(() => driverState?.missions.find((m) => m.id === id)?.state === 'done')
    const report = delivered.find((d) => d.sessionId === 's1' && d.text.includes('finished'))?.text ?? ''
    expect(report).toMatch(new RegExp(`Anna's Claude finished ${id} "Feature"`))
    expect(report).toMatch(new RegExp(`Branch crew/anna/${id} is in your repository \\(1 commit, 1 file: feature.txt\\)`))
    expect(report).toMatch(/Report: Added feature.txt; checks pass./)
    expect(report).toMatch(new RegExp(`git merge crew/anna/${id}`))
    expect(sh(`git show crew/anna/${id}:feature.txt`, driverDir)).toBe('built by Anna (allow)')
    expect(pushDecision).toMatchObject({ behavior: 'deny', message: expect.stringMatching(/harness-crew pushes crew\/anna\/m-[0-9a-f]+ for you/) })
    expect(driverState!.asks).toEqual([])
    // Anna's terminal saw the whole story.
    const kinds = workers[0].events.map((e) => e.kind)
    expect(kinds).toEqual(expect.arrayContaining(['driver', 'repo', 'mission', 'ask', 'answer', 'message']))
  })

  it('moves a mission to someone with usage left when a plan runs out, continuing from the work that arrived', async () => {
    const out = await driver.dispatch('s1', driverDir, [{ title: 'Big job', brief: 'Write both halves', to: 'Anna' }])
    const id = /✓ (m-[0-9a-f]+)/.exec(out)![1]
    await until(() => driverState?.missions.some((m) => m.continues === id && m.state === 'done') ?? false, 30_000)
    const moved = driverState!.missions.find((m) => m.continues === id)!
    expect(moved.toName).toBe('Ben')
    expect(moved.from).toBe(`crew/anna/${id}`)
    expect(driverState!.missions.find((m) => m.id === id)).toMatchObject({ state: 'limited', movedTo: 'Ben' })
    expect(delivered.some((d) => d.sessionId === 's1' && /ran out of plan usage on .*→ given to Ben/.test(d.text))).toBe(true)
    // Ben ended without reporting: harness-crew nudged once, then reported for him.
    expect(moved.progress).toMatchObject({ auto: true, commits: 1 })
    expect(sh(`git show ${moved.branch}:half.txt`, driverDir)).toBe('first half')
    expect(sh(`git show ${moved.branch}:second-half.txt`, driverDir)).toBe('second half')
    // Anna is out of usage now, so she isn't offered missions until it resets.
    expect(driverState!.members.find((m) => m.name === 'Anna')).toMatchObject({ headroom: 0 })
  })

  it('starts each mission from the lead’s latest commit, and refuses a branch that doesn’t exist', async () => {
    writeFileSync(join(driverDir, 'later.txt'), 'committed after the first share\n')
    sh('git add -A && git commit -q -m later', driverDir)
    const out = await driver.dispatch('s1', driverDir, [
      { title: 'Second half again', brief: 'Write the second half', to: 'Ben' },
      { title: 'Nowhere', brief: 'x', from: 'no-such-branch' },
    ])
    expect(out).toMatch(/✗ "Nowhere": there's no branch no-such-branch/)
    const id = /✓ (m-[0-9a-f]+)/.exec(out)![1]
    expect(driver.payload()!.missions.find((m) => m.id === id)?.at).toBe(sh('git rev-parse HEAD', driverDir))
    await until(() => driverState?.missions.find((m) => m.id === id)?.state === 'done', 30_000)
    expect(sh(`git show crew/ben/${id}:later.txt`, driverDir)).toBe('committed after the first share')
    expect(sh(`git show crew/ben/${id}:second-half.txt`, driverDir)).toBe('second half')
  })

  it('runs a team run’s silent missions: the result goes to the run, not into the lead’s session', async () => {
    const events: MissionEvent[] = []
    const off = driver.onMission((e) => events.push(e))
    const before = delivered.length
    // Anna is out of usage and Ben is avoided: nobody can take it.
    const [none] = await driver.assign('lead', driverDir, [{ title: 'M1 M1.2', brief: 'x' }], { silent: true, avoid: ['ben00001'] })
    expect(none.error).toMatch(/nobody can take it/)
    const [r] = await driver.assign('lead', driverDir, [{ title: 'M1 M1.1 (backend)', brief: 'Write the second half', to: 'Ben' }], { silent: true })
    expect(r).toMatchObject({ toName: 'Ben', branch: `crew/ben/${r.id}` })
    await until(() => events.some((e) => e.id === r.id), 30_000)
    const e = events.find((x) => x.id === r.id)!
    expect(e).toMatchObject({ state: 'done', imported: true, silent: true })
    expect(e.report).toMatch(new RegExp(`Ben's Claude finished ${r.id}`))
    expect(driver.settled(r.id!)).toBe(true)
    expect(driver.mission(r.id!)?.progress?.commits).toBe(1)
    expect(sh(`git show crew/ben/${r.id}:second-half.txt`, driverDir)).toBe('second half')
    expect(delivered.slice(before)).toEqual([])
    off()
  })

  it('keeps missions and seen messages across a restart of harness-crew', () => {
    const saved = JSON.parse(readFileSync(join(root, 'state-Anna.json'), 'utf8')) as { missions: unknown[]; seen: string[]; known: string[] }
    expect(saved.missions.length).toBe(2)
    expect(saved.known.length).toBe(2)
  })
})
