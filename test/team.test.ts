import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { headroom, makeJoinCode, parseJoinCode, pickMember, usageAdvice, type MemberStatus, type TeamConfig, type TeamState } from '@shared/team'
import { createRelay } from '../relay/relay.mjs'
import { TeamService, type TeamDeps } from '../src/main/team/TeamService'

const NOW = Date.parse('2026-11-14T10:00:00Z')
const member = (name: string, usage: MemberStatus['usage'], updatedAt = NOW): MemberStatus => ({ id: name.toLowerCase(), name, sessions: [], usage, updatedAt })

describe('team model', () => {
  it('round-trips join codes and rejects junk', () => {
    const code = makeJoinCode('https://relay.example.com/', 'abcdefghijklmnopqrstuvwx')
    expect(parseJoinCode(`Join us: ${code} `)).toEqual({ relayUrl: 'https://relay.example.com', token: 'abcdefghijklmnopqrstuvwx' })
    expect(parseJoinCode('HT1.nope')).toBeNull()
    expect(parseJoinCode(makeJoinCode('ftp://x', 'abcdefghijklmnopqrstuvwx'))).toBeNull()
  })

  it('ranks headroom and warns before limits', () => {
    const team = [
      member('Ada', { source: 'plan', fiveHour: { pct: 85, resetsAt: NOW + 3600_000 } }),
      member('Bo', { source: 'plan', fiveHour: { pct: 20 }, sevenDay: { pct: 40 } }),
      member('Cy', { source: 'plan', status: 'rejected', resetsAt: NOW + 7200_000 }),
      member('Di', { source: 'plan', fiveHour: { pct: 5 } }, NOW - 120_000), // offline
    ]
    expect(headroom(team[1].usage, NOW)).toBe(60)
    expect(headroom(team[2].usage, NOW)).toBe(0)
    expect(headroom({ source: 'plan', fiveHour: { pct: 99, resetsAt: NOW - 1 } }, NOW)).toBe(100) // window already reset
    const advice = usageAdvice(team, NOW, () => '13:00')
    expect(advice.best?.name).toBe('Bo')
    expect(advice.warnings.map((w) => [w.member.name, w.severity])).toEqual([
      ['Ada', 'warn'],
      ['Cy', 'stop'],
    ])
  })

  it('sanitises statuses from the relay', () => {
    expect(pickMember({ id: 'x' })).toBeNull()
    const m = pickMember({ id: 'abcd', name: 'A'.repeat(100), updatedAt: 1, usage: { source: 'evil', fiveHour: { pct: 300 } }, sessions: [{ title: 't', status: 'running' }, 'bad'] })
    expect(m).toMatchObject({ name: 'A'.repeat(40), usage: { source: 'unknown', fiveHour: { pct: 100 } }, sessions: [{ title: 't', status: 'running', subagents: 0 }] })
  })
})

describe('relay + TeamService', () => {
  const services: TeamService[] = []
  const servers: Server[] = []
  afterEach(() => {
    services.splice(0).forEach((s) => s.dispose())
    servers.splice(0).forEach((s) => s.close())
  })

  const laptop = (id: string, port: number, extra: Partial<TeamDeps> = {}) => {
    let config: TeamConfig | null = null
    const pushed: TeamState[] = []
    const svc = new TeamService({
      getConfig: () => config,
      setConfig: (c) => (config = c),
      memberId: () => id,
      usesApiKey: () => false,
      planUsage: async () => undefined,
      projectDir: () => undefined,
      hackforge: async () => undefined,
      push: (s) => pushed.push(s),
      port,
      ...extra,
    })
    services.push(svc)
    return { svc, pushed, config: () => config }
  }

  it('relay rejects missing tokens and mismatched ids', async () => {
    const server = createServer(createRelay()).listen(0)
    servers.push(server)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    expect((await fetch(`${base}/health`).then((r) => r.json())).service).toBe('harness-team-relay')
    expect((await fetch(`${base}/v1/team`)).status).toBe(401)
    const auth = { authorization: 'Bearer 0123456789abcdef0123' }
    expect((await fetch(`${base}/v1/team/members/aaaa`, { method: 'PUT', headers: auth, body: JSON.stringify({ id: 'bbbb' }) })).status).toBe(400)
    const put = await fetch(`${base}/v1/team/members/aaaa`, { method: 'PUT', headers: auth, body: JSON.stringify({ id: 'aaaa', name: 'A' }) }).then((r) => r.json())
    expect(put.members).toEqual([{ id: 'aaaa', name: 'A' }])
    // Another team's token sees nothing.
    expect((await fetch(`${base}/v1/team`, { headers: { authorization: 'Bearer zzzzzzzzzzzzzzzzzzzz' } }).then((r) => r.json())).members).toEqual([])
  })

  it('relay frees the slots of teams whose members all expired', async () => {
    let t = 0
    const server = createServer(createRelay({ now: () => t })).listen(0)
    servers.push(server)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const put = (token: string) =>
      fetch(`${base}/v1/team/members/m001`, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ id: 'm001', name: 'A' }) })
    for (let i = 0; i < 500; i++) await put(`old-team-${String(i).padStart(10, '0')}`)
    expect((await put('one-team-too-many-0001')).status).toBe(503)
    // Half a day later every old team has expired; a new team must fit again.
    t = 13 * 3600_000
    expect((await put('new-team-after-expiry1')).status).toBe(200)
  })

  it('one laptop hosts, another joins with the code, both see each other', async () => {
    const port = 47000 + Math.floor(Math.random() * 1000)
    const host = laptop('host0001', port)
    const created = await host.svc.create({ name: 'Ada', host: true })
    expect(created.connected).toBe(true)
    expect(created.config).toMatchObject({ memberName: 'Ada', hosting: true })

    // The joiner reaches the host over loopback here (on a real network it's the LAN URL).
    const code = makeJoinCode(`http://127.0.0.1:${port}`, host.config()!.token)
    const guest = laptop('guest001', port + 1)
    guest.svc.setLocal({ sessions: [{ title: 'Build API', project: 'junction', status: 'running', activity: 'Bash: npm test', subagents: 2 }] })
    guest.svc.onRateLimit({ status: 'allowed_warning', rateLimitType: 'five_hour', utilization: 0.82, resetsAt: Math.floor(NOW / 1000) })
    guest.svc.update({ focus: 'M2 backend' })
    const joined = await guest.svc.join(code, 'Bo')
    expect(joined.members.map((m) => m.name).sort()).toEqual(['Ada', 'Bo'])

    await host.svc.sync()
    const bo = host.svc.state().members.find((m) => m.name === 'Bo')!
    expect(bo).toMatchObject({ focus: 'M2 backend', sessions: [{ title: 'Build API', activity: 'Bash: npm test', subagents: 2 }] })
    expect(bo.usage).toMatchObject({ source: 'plan', status: 'allowed_warning', fiveHour: { pct: 82, resetsAt: NOW } })

    await guest.svc.leave()
    await host.svc.sync()
    expect(host.svc.state().members.map((m) => m.name)).toEqual(['Ada'])
  })

  it('leaving while a sync is in flight really leaves', async () => {
    const relay = createRelay()
    let slow = false
    const server = createServer(async (req, res) => {
      if (slow && req.method === 'PUT') await new Promise((r) => setTimeout(r, 200))
      relay(req, res)
    }).listen(0)
    servers.push(server)
    await new Promise((r) => server.once('listening', r))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    const token = 'abcdefghijklmnopqrstuvwx'
    const l = laptop('leaver01', 1)
    await l.svc.join(makeJoinCode(base, token), 'Cy')
    slow = true
    const running = l.svc.sync()
    await new Promise((r) => setTimeout(r, 30))
    const left = await l.svc.leave()
    await running
    expect(left).toMatchObject({ config: null, connected: false, members: [] })
    // The in-flight sync must neither revive the local board nor re-add me on the relay.
    expect(l.svc.state()).toMatchObject({ connected: false, members: [] })
    expect(l.pushed.at(-1)).toMatchObject({ config: null, members: [] })
    const onRelay = await fetch(`${base}/v1/team`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json())
    expect(onRelay.members).toEqual([])
  })

  it('reports a wrong code or unreachable relay clearly', async () => {
    const l = laptop('solo0001', 1)
    await expect(l.svc.join('hello', 'X')).rejects.toThrow(/not a valid join code/)
    await expect(l.svc.join(makeJoinCode('http://127.0.0.1:9', 'abcdefghijklmnopqrstuvwx'), 'X')).rejects.toThrow(/No Harness team relay/)
  })
})
