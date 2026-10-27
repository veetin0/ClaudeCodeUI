import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CrewMemberView, MissionView } from '@shared/crew'
import type { HarnessEvent, SessionStatus } from '@shared/events'
import type { PermissionDecision } from '@shared/ipc'
import { PLAN_PROMPT, RUN_ALLOW, pickContract, taskBrief, type Contract, type RunState } from '@shared/run'
import type { PlanUsage } from '@shared/team'
import type { AssignResult, MissionEvent, MissionSpec } from '../src/main/crew/CrewDriver'
import { addFiles, createProject, hasChallenge, hasPrivateGuard, prepareProject, privateGuard, projectSlug, readContracts } from '../src/main/run/project'
import { RunService } from '../src/main/run/RunService'

const sh = (cmd: string, cwd?: string) => execSync(cmd, { cwd, stdio: 'pipe' }).toString().trim()
const NOW = Date.parse('2026-11-14T10:00:00Z')

describe('team run project', () => {
  it('creates a project: git on main, the challenge folders, HackForge settings, one commit', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'hrun-'))
    const dir = await createProject({ name: 'Grid Pulse!', parent, deadline: '2026-11-15T12:00:00+02:00', plan: 'pro', team: 4, now: NOW })
    expect(dir).toBe(join(parent, 'grid-pulse'))
    expect(sh('git rev-parse --abbrev-ref HEAD', dir)).toBe('main')
    expect(sh('git log --oneline', dir).split('\n')).toHaveLength(1)
    const yaml = readFileSync(join(dir, 'challenge', 'hackforge.yaml'), 'utf8')
    expect(yaml).toContain('checkpoints: [plan]')
    expect(yaml).toContain('plan: pro')
    expect(yaml).toMatch(/hours: 24/)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('private/')
    expect(hasChallenge(dir)).toBe(false)
    writeFileSync(join(dir, 'challenge', 'brief', 'CHALLENGE.md'), '# The challenge\n\nBuild a grid balancing app.')
    expect(hasChallenge(dir)).toBe(true)
    await expect(createProject({ name: 'Grid Pulse', parent, plan: 'pro', team: 1 })).rejects.toThrow(/isn't empty/)
    expect(projectSlug('Ääkkönen  App')).toBe('aakkonen-app')
  })

  it('makes an existing folder ready without losing what is there', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hrun-existing-'))
    writeFileSync(join(dir, 'notes.txt'), 'hello')
    writeFileSync(join(dir, '.gitignore'), 'node_modules/')
    await prepareProject(dir, { name: 'Old', plan: 'max', team: 1 })
    expect(sh('git log --oneline', dir)).toContain('Start Old')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('node_modules/\n# Files Claude must not read (Harness → Setup → Private files)\nprivate/\n')
    expect(existsSync(join(dir, 'challenge', 'hackforge.yaml'))).toBe(true)
    // Again: nothing changes, no new commit.
    await prepareProject(dir, { name: 'Old', plan: 'max', team: 1 })
    expect(sh('git log --oneline', dir).split('\n')).toHaveLength(1)
  })

  it('keeps private files out of git and away from Claude', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'hrun-'))
    const dir = await createProject({ name: 'Secret', parent, plan: 'pro', team: 1 })
    const src = join(parent, 'matches.csv')
    writeFileSync(src, 'a,b\n1,2\n')
    expect(addFiles(dir, 'private', [src, join(parent, 'missing.csv')])).toEqual(['matches.csv'])
    expect(sh('git status --porcelain', dir)).not.toContain('private')
    const settings = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))
    expect(settings.permissions.deny).toContain('Read(./private/**)')
    privateGuard(dir)
    const again = JSON.parse(readFileSync(join(dir, '.claude', 'settings.json'), 'utf8'))
    expect(again.hooks.PreToolUse).toHaveLength(1)
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8').match(/Private files \(set up by Harness\)/g)).toHaveLength(1)
    const hook = join(dir, '.claude', 'hooks', 'protect_private.py')
    const run = (input: object) => {
      try {
        return execSync(`python3 "${hook}"`, { input: JSON.stringify(input), stdio: 'pipe' }).toString()
      } catch (err) {
        return String(err)
      }
    }
    expect(run({ tool_name: 'Bash', tool_input: { command: 'cat private/matches.csv' } })).toContain('"deny"')
    expect(run({ tool_name: 'Read', tool_input: { file_path: `${dir}/private/matches.csv` } })).toContain('"deny"')
    expect(run({ tool_name: 'Grep', tool_input: { pattern: 'x', path: 'private' } })).toContain('"deny"')
    expect(run({ tool_name: 'Bash', tool_input: { command: 'python3 score.py private/matches.csv' } })).toBe('')
    expect(run({ tool_name: 'Read', tool_input: { file_path: `${dir}/src/app.ts` } })).toBe('')
    // REA (reverse engineering) reads whatever path it's handed, so it's guarded too.
    expect(again.hooks.PreToolUse[0].matcher).toMatch(/mcp__rea__\.\*/)
    expect(run({ tool_name: 'mcp__rea__analyze_javascript_application', tool_input: { path: `${dir}/private/app.asar` } })).toContain('"deny"')
    expect(run({ tool_name: 'mcp__rea__open_binary', tool_input: { source_paths: ['private/matches.bin'] } })).toContain('"deny"')
    expect(run({ tool_name: 'mcp__rea__analyze_javascript_application', tool_input: { path: `${dir}/challenge/partner-app` } })).toBe('')
    expect(hasPrivateGuard(dir)).toBe(true)
    expect(hasPrivateGuard(mkdtempSync(join(tmpdir(), 'hrun-none-')))).toBe(false)
  })

  it('lets the lead’s Claude run routine dev and HackForge commands without asking, nothing crew-only', () => {
    expect(RUN_ALLOW).toEqual(expect.arrayContaining(['Bash(npm *)', 'Bash(git commit *)', 'Bash(bash *)', 'Bash(git worktree *)', 'WebSearch']))
    expect(RUN_ALLOW).not.toContain('mcp__crew')
    expect(RUN_ALLOW.some((r) => /push|sudo|^Bash\(rm /.test(r))).toBe(false)
  })

  it('reads HackForge contracts in milestone order, skipping half-written ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hrun-c-'))
    mkdirSync(join(dir, '.hackforge', 'contracts'), { recursive: true })
    const write = (f: string, body: string) => writeFileSync(join(dir, '.hackforge', 'contracts', f), body)
    write('M10.json', JSON.stringify({ milestone: 'M10', goal: 'ten', tasks: [] }))
    write(
      'M2.json',
      JSON.stringify({ milestone: 'M2', goal: 'two', tasks: [{ id: 'M2.1', role: 'backend', owned: ['api/**'] }], validation_commands: ['npm test'] }),
    )
    write('M3.json', '{"milestone": "M3", "goal": ')
    const cs = await readContracts(dir)
    expect(cs.map((c) => c.milestone)).toEqual(['M2', 'M10'])
    expect(cs[1].tasks).toEqual([{ id: 'M10.1', owned: [] }])
    const brief = taskBrief(cs[0], cs[0].tasks[0])
    expect(brief).toContain('Owned paths (change only these): api/**')
    expect(brief).toContain('`npm test`')
    expect(brief).toContain('mcp__crew__report')
  })
})

// ---------- the run itself, with fakes for the crew, the lead's Claude and HackForge ----------

const member = (id: string, name: string, headroom: number): CrewMemberView =>
  ({ id, name, online: true, accepting: true, headroom, usage: { source: 'plan' }, queued: 0, waiting: false }) as unknown as CrewMemberView

function harness(o: { crew?: CrewMemberView[]; usage?: PlanUsage } = {}) {
  let now = NOW
  const sent: string[] = []
  const responses: { requestId: string; d: PermissionDecision }[] = []
  let status: SessionStatus = 'idle'
  let listener: ((e: MissionEvent) => void) | undefined
  const assigned: { specs: MissionSpec[]; avoid?: string[] }[] = []
  const missions = new Map<string, MissionView>()
  const crew = { list: o.crew ?? [member('a', 'Anna', 80), member('b', 'Ben', 60)] }
  const nextResults: (AssignResult[] | Error)[] = []
  let milestones: { id: string; goal: string; status: 'todo' }[] = []
  let contracts: Contract[] = []
  const usage = { value: o.usage ?? ({ source: 'plan', fiveHour: { pct: 30 } } as PlanUsage) }
  const states: RunState[] = []
  let n = 0
  const run = new RunService({
    now: () => now,
    push: (s) => states.push(structuredClone(s)),
    team: { me: () => ({ id: 'lead', name: 'Veeti' }), start: async () => undefined, myUsage: () => usage.value },
    crew: {
      assign: async (_sid, _cwd, specs, opts) => {
        assigned.push({ specs, avoid: opts.avoid })
        const queued = nextResults.shift()
        if (queued instanceof Error) throw queued
        if (queued) return queued
        return specs.map((s) => {
          const m = crew.list.find((c) => c.name === s.to && !opts.avoid?.includes(c.id)) ?? crew.list.find((c) => !opts.avoid?.includes(c.id))
          if (!m) return { title: s.title, error: 'nobody can take it right now' }
          const id = `m-${++n}`
          missions.set(id, {
            id,
            title: s.title,
            brief: s.brief,
            to: m.id,
            toName: m.name,
            from: 'main',
            branch: `crew/${m.name.toLowerCase()}/${id}`,
            createdAt: now,
            state: 'queued',
          })
          return { title: s.title, id, to: m.id, toName: m.name, branch: `crew/${m.name.toLowerCase()}/${id}`, headroom: m.headroom }
        })
      },
      onMission: (fn) => {
        listener = fn
        return () => (listener = undefined)
      },
      mission: (id) => missions.get(id),
      members: () => crew.list,
      stop: (id) => `stopped ${id}`,
    },
    lead: {
      send: (_id, text) => {
        sent.push(text)
        status = 'running'
      },
      status: () => status,
      respond: (_sid, requestId, d) => void responses.push({ requestId, d }),
      interrupt: () => undefined,
    },
    hackforge: async () => ({ milestones, config: { loopEnabled: true }, loop: undefined, decision: { title: 'Grid Pulse', text: '' } }),
    contracts: async () => contracts,
  })
  const ev = <T extends HarnessEvent['type']>(type: T, body: Omit<Extract<HarnessEvent, { type: T }>, 'type' | 'sessionId' | 'ts'>) =>
    ({ type, sessionId: 'lead-session', ts: now, ...body }) as unknown as HarnessEvent
  const endTurn = async (o: { error?: boolean; result?: string; text?: string } = {}) => {
    status = 'idle'
    run.onEvents([
      ...(o.text ? [ev('assistant.text', { id: 'x', agentId: null, text: o.text })] : []),
      ev('turn.end', { isError: !!o.error, result: o.result ?? '', costUsd: 0, durationMs: 1, numTurns: 1, outputTokens: 1 }),
    ])
    await run.whenIdle()
  }
  const finish = async (missionId: string, state: MissionEvent['state'], extra: Partial<MissionEvent> = {}) => {
    const m = missions.get(missionId)!
    const view: MissionView = {
      ...m,
      state,
      progress: { id: m.id, title: m.title, state, branch: m.branch, commits: state === 'done' ? 2 : 0, summary: `${state} summary` },
    }
    listener!({ id: missionId, state, view, imported: state === 'done', report: `${m.toName}'s Claude ${state} ${missionId}`, silent: true, ...extra })
    await run.whenIdle()
  }
  const contract = (id: string, tasks: number, status?: string) =>
    pickContract({
      milestone: id,
      goal: `${id} goal`,
      status,
      tasks: Array.from({ length: tasks }, (_, i) => ({ id: `${id}.${i + 1}`, role: i === 0 ? 'backend' : 'frontend', owned: [`src/${id}/${i + 1}/**`] })),
    })!
  return {
    run,
    sent,
    responses,
    assigned,
    missions,
    crew,
    usage,
    nextResults,
    states,
    ev,
    endTurn,
    finish,
    contract,
    setMilestones: (m: typeof milestones) => (milestones = m),
    setContracts: (c: Contract[]) => (contracts = c),
    advance: (ms: number) => (now += ms),
    get now() {
      return now
    },
  }
}

async function planned(h: ReturnType<typeof harness>) {
  const parent = mkdtempSync(join(tmpdir(), 'hrun-flow-'))
  await h.run.createProject({ name: 'Grid Pulse', parent, deadline: new Date(NOW + 30 * 3600_000).toISOString(), plan: 'pro' })
  h.run.setChallenge('# The challenge\n\nBalance the grid.')
  await h.run.plan('lead-session')
  return parent
}

describe('team run', () => {
  it('goes from the challenge to a plan, asking the lead when Claude stops early', async () => {
    const h = harness()
    await planned(h)
    expect(h.run.state().stage).toBe('plan')
    expect(h.sent).toEqual([PLAN_PROMPT])
    // Claude stopped with a question and no plan yet: the lead gets it in the inbox.
    await h.endTurn({ text: 'Which track should we pick, energy or health?' })
    const [item] = h.run.state().inbox
    expect(item.kind).toBe('reply')
    expect(item.detail).toContain('energy or health')
    await h.run.answer(item.id, { text: 'Energy.' })
    expect(h.sent.at(-1)).toBe('Energy.')
    h.setMilestones([
      { id: 'M1', goal: 'walking skeleton', status: 'todo' },
      { id: 'M2', goal: 'the demo path', status: 'todo' },
    ])
    await h.endTurn()
    expect(h.run.state().step).toBe('plan-ready')
    expect(h.run.state().inbox).toHaveLength(0)
    await h.run.revisePlan('Drop the mobile app.')
    expect(h.sent.at(-1)).toContain('Drop the mobile app.')
    await h.endTurn()
    expect(h.run.state().step).toBe('plan-ready')
    // Back to Setup to add a file, then Continue with the same Claude: it updates the plan.
    await h.run.goTo('setup')
    h.run.setChallenge('# The challenge\n\nBalance the grid. Judged on impact.')
    await h.run.plan('lead-session')
    expect(h.sent.at(-1)).toMatch(/The lead changed the challenge/)
    expect(h.sent.filter((t) => t === PLAN_PROMPT)).toHaveLength(1)
    await h.endTurn()
    expect(h.run.state()).toMatchObject({ stage: 'plan', step: 'plan-ready' })
  })

  it('runs milestones: crew first by usage left, failures move on, integration until green, then finish', async () => {
    const h = harness()
    await planned(h)
    h.setMilestones([{ id: 'M1', goal: 'a', status: 'todo' }])
    await h.endTurn()
    await h.run.acceptPlan()
    expect(h.sent.at(-1)).toContain('freeze CONTRACTS.md')
    h.setContracts([h.contract('M1', 3), h.contract('M2', 1)])
    await h.endTurn()
    const s = h.run.state()
    expect(s.stage).toBe('run')
    expect(s.milestones.map((m) => m.id)).toEqual(['M1', 'M2'])
    expect(s.milestones[0].budgetMs).toBeGreaterThan(10 * 3600_000)
    // One task each for Anna (most usage left) and Ben; the third is the lead's.
    expect(h.assigned[0].specs.map((x) => x.to)).toEqual(['Anna', 'Ben'])
    expect(h.assigned[0].specs[0].brief).toContain('src/M1/1/**')
    expect(s.tasks.map((t) => (t.assignee.kind === 'crew' ? t.assignee.name : 'lead'))).toEqual(['Anna', 'Ben', 'lead'])
    const build = h.sent.at(-1)!
    expect(build).toContain('Milestone M1')
    expect(build).toContain('M1.1 → Anna, M1.2 → Ben')
    expect(build).toContain('Your tasks: M1.3')

    // A crew message waits for the lead's turn to end, then gets its own.
    h.run.deliver('[crew] Message from Anna: which port?')
    await h.run.whenIdle()
    expect(h.sent.at(-1)).toBe(build)
    await h.endTurn()
    expect(h.sent.at(-1)).toContain('which port?')
    expect(h.run.state().tasks[2].state).toBe('done')
    await h.endTurn()
    expect(h.run.state().step).toBe('building')

    // Anna finishes; Ben fails, nobody else can take it, so it goes to the lead's Claude.
    await h.finish('m-1', 'done')
    expect(h.run.state().tasks[0].state).toBe('done')
    h.nextResults.push([{ title: 'x', error: 'nobody can take it' }])
    await h.finish('m-2', 'failed')
    expect(h.assigned.at(-1)!.avoid).toEqual(['b'])
    expect(h.run.state().tasks[1].assignee.kind).toBe('lead')
    expect(h.sent.at(-1)).toContain('M1.2 (frontend) is yours now')
    await h.endTurn()

    // Everything's in: integrate with Anna's branch and report.
    const integrate = h.sent.at(-1)!
    expect(integrate).toContain('All of M1')
    expect(integrate).toContain('crew/anna/m-1')
    expect(integrate).toContain("Anna's Claude done m-1")
    expect(h.run.state().milestones[0].status).toBe('integrating')
    // Not green yet: a round of fixes.
    await h.endTurn()
    expect(h.sent.at(-1)).toContain("M1 isn't marked done")
    h.setContracts([h.contract('M1', 3, 'done'), h.contract('M2', 1)])
    await h.endTurn()
    expect(h.run.state().milestones[0].status).toBe('done')
    // M2: one task, Anna has the most usage left.
    expect(h.assigned.at(-1)!.specs.map((x) => x.to)).toEqual(['Anna'])
    expect(h.sent.at(-1)).toContain('You have no build tasks')
    await h.endTurn()
    await h.finish('m-3', 'done')
    expect(h.sent.at(-1)).toContain('All of M2')
    h.setContracts([h.contract('M1', 3, 'done'), h.contract('M2', 1, 'done')])
    await h.endTurn()
    expect(h.run.state().step).toBe('finishing')
    expect(h.sent.at(-1)).toContain('hackforge:perfect')
    await h.endTurn()
    expect(h.run.state().stage).toBe('done')
  })

  it('carries on with a continuation when a crew member runs out of usage', async () => {
    const h = harness()
    await planned(h)
    h.setMilestones([{ id: 'M1', goal: 'a', status: 'todo' }])
    await h.endTurn()
    await h.run.acceptPlan()
    h.setContracts([h.contract('M1', 1)])
    await h.endTurn()
    h.missions.set('m-9', { ...h.missions.get('m-1')!, id: 'm-9', to: 'b', toName: 'Ben' })
    await h.finish('m-1', 'limited', { continuation: 'm-9' })
    const t = h.run.state().tasks[0]
    expect(t.assignee).toMatchObject({ kind: 'crew', name: 'Ben', mission: 'm-9' })
    expect(t.state).toBe('working')
  })

  it('gives everything to the crew when the lead is low on usage, and the lead everything without a crew', async () => {
    const low = harness({ usage: { source: 'plan', fiveHour: { pct: 90 } } })
    await planned(low)
    low.setMilestones([{ id: 'M1', goal: 'a', status: 'todo' }])
    await low.endTurn()
    await low.run.acceptPlan()
    low.setContracts([low.contract('M1', 3)])
    await low.endTurn()
    expect(low.assigned[0].specs.map((x) => x.to)).toEqual(['Anna', 'Ben', 'Anna'])

    const solo = harness({ crew: [] })
    await planned(solo)
    solo.setMilestones([{ id: 'M1', goal: 'a', status: 'todo' }])
    await solo.endTurn()
    await solo.run.acceptPlan()
    solo.setContracts([solo.contract('M1', 2)])
    await solo.endTurn()
    expect(solo.assigned).toHaveLength(0)
    expect(solo.sent.at(-1)).toContain('Your tasks: M1.1 (backend)')
  })

  it('pauses at the plan limit, sends the cut-off turn again at the reset, and handles the inbox', async () => {
    const h = harness()
    await planned(h)
    h.usage.value = { source: 'plan', status: 'rejected', resetsAt: h.now + 3600_000 }
    await h.endTurn({ error: true, result: 'Claude AI usage limit reached' })
    expect(h.run.state().pausedReason).toMatch(/limit/)
    expect(h.run.state().resumeAt).toBe(h.now + 3600_000)
    const count = h.sent.length
    h.advance(3600_001)
    h.usage.value = { source: 'plan', fiveHour: { pct: 1 } }
    await (h.run as unknown as { serial(fn: () => unknown): Promise<void>; tick(): Promise<void> }).serial(() =>
      (h.run as unknown as { tick(): Promise<void> }).tick(),
    )
    expect(h.run.state().pausedReason).toBeUndefined()
    expect(h.sent).toHaveLength(count + 1)
    expect(h.sent.at(-1)).toBe(PLAN_PROMPT)

    // A permission request and a question from the lead's Claude go to the inbox.
    h.run.onEvents([
      h.ev('permission.request', {
        requestId: 'r1',
        toolUseId: 't',
        agentId: null,
        toolName: 'Bash',
        input: { command: 'docker compose up' },
        canAlwaysAllow: true,
      }),
      h.ev('permission.request', {
        requestId: 'r2',
        toolUseId: 't2',
        agentId: null,
        toolName: 'AskUserQuestion',
        input: { questions: [{ question: 'Which stack?', options: [{ label: 'Next.js' }, { label: 'SvelteKit' }] }] },
        canAlwaysAllow: false,
      }),
    ])
    await h.run.whenIdle()
    const [approval, question] = h.run.state().inbox
    expect(approval.detail).toBe('Bash: docker compose up')
    expect(question.questions?.[0].options).toEqual(['Next.js', 'SvelteKit'])
    await h.run.answer(approval.id, { allow: true, always: true })
    await h.run.answer(question.id, { answers: { 'Which stack?': 'Next.js' } })
    expect(h.responses).toEqual([
      { requestId: 'r1', d: { behavior: 'allow', always: true } },
      { requestId: 'r2', d: { behavior: 'allow', updatedInput: { questions: expect.any(Array), answers: { 'Which stack?': 'Next.js' } } } },
    ])
    expect(h.run.state().inbox).toHaveLength(0)

    // A decision the lead's Claude asks for comes back as a [run] turn once it's free.
    expect(h.run.ask({ question: 'Cut the leaderboard?', suggestion: 'Yes, it is not judged.' })).toMatch(/Asked the lead/)
    await h.run.whenIdle()
    const decision = h.run.state().inbox[0]
    expect(decision).toMatchObject({ kind: 'decision', suggestion: 'Yes, it is not judged.' })
    await h.run.answer(decision.id, {})
    await h.endTurn({ text: 'still planning' })
    expect(h.sent.at(-1)).toContain('The lead answered your question "Cut the leaderboard?": Yes, it is not judged.')
  })

  it('remembers the run across a restart, and needs the lead’s session reconnected', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'hrun-save-')), 'run.json')
    const h = harness()
    const parent = mkdtempSync(join(tmpdir(), 'hrun-flow-'))
    const svc = new RunService({
      file,
      push: () => undefined,
      team: { me: () => null, start: async () => undefined, myUsage: () => ({ source: 'unknown' }) },
      crew: { assign: async () => [], onMission: () => () => undefined, mission: () => undefined, members: () => [], stop: () => '' },
      lead: { send: () => undefined, status: () => 'idle', respond: () => undefined, interrupt: () => undefined },
      hackforge: async () => ({ milestones: [], config: {}, loop: undefined, decision: undefined }),
    })
    await svc.createProject({ name: 'Keep', parent, plan: 'pro' })
    svc.setChallenge('Build it')
    await svc.plan('s1')
    expect(svc.state().sessionLive).toBe(true)
    const again = new RunService({
      file,
      push: () => undefined,
      team: { me: () => null, start: async () => undefined, myUsage: () => ({ source: 'unknown' }) },
      crew: { assign: async () => [], onMission: () => () => undefined, mission: () => undefined, members: () => [], stop: () => '' },
      lead: { send: () => undefined, status: () => undefined, respond: () => undefined, interrupt: () => undefined },
      hackforge: async () => ({ milestones: [], config: {}, loop: undefined, decision: undefined }),
    })
    expect(again.state()).toMatchObject({ stage: 'plan', step: 'planning', sessionId: 's1', sessionLive: false })
    expect(again.isRunProject(join(parent, 'keep'))).toBe(true)
    expect(h.run.state().stage).toBe('team')
  })
})
