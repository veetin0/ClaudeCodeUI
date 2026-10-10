// Harness team relay: holds each teammate's latest status, keyed by a shared team token.
// Plain Node, no dependencies, in memory only. Used by Harness's "host on this computer" mode and
// by server.mjs for running it anywhere (a VPS, Fly, Render, a Raspberry Pi…).
import { createHash } from 'node:crypto'

const MAX_BODY = 64 * 1024
const MAX_TEAMS = 500
const MAX_MEMBERS = 12
const EXPIRE_MS = 12 * 3600_000

/** @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
export function createRelay({ now = () => Date.now() } = {}) {
  /** @type {Map<string, Map<string, { status: unknown, seen: number }>>} */
  const teams = new Map()

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  const teamKey = (req) => {
    const m = /^Bearer\s+(\S{16,200})$/.exec(req.headers.authorization ?? '')
    return m ? createHash('sha256').update(m[1]).digest('hex') : null
  }
  const members = (team) => {
    const t = now()
    const out = []
    for (const [id, m] of team) {
      if (t - m.seen > EXPIRE_MS) team.delete(id)
      else out.push(m.status)
    }
    return out
  }
  /** Drops expired members and the teams they leave empty, so old teams don't fill the relay. */
  const sweep = () => {
    for (const [key, team] of teams) if (members(team).length === 0) teams.delete(key)
  }
  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > MAX_BODY) {
          reject(new Error('too large'))
          req.destroy()
        } else chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://relay')
      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'harness-team-relay' })
      if (!url.pathname.startsWith('/v1/team')) return send(res, 404, { error: 'not found' })
      const key = teamKey(req)
      if (!key) return send(res, 401, { error: 'missing or invalid team token' })
      let team = teams.get(key)

      if (req.method === 'GET' && url.pathname === '/v1/team') return send(res, 200, { members: team ? members(team) : [] })

      const m = /^\/v1\/team\/members\/([A-Za-z0-9_-]{4,64})$/.exec(url.pathname)
      if (!m) return send(res, 404, { error: 'not found' })
      if (req.method === 'DELETE') {
        team?.delete(m[1])
        if (team && team.size === 0) teams.delete(key)
        return send(res, 200, { ok: true })
      }
      if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
      const status = JSON.parse(await readBody(req))
      if (!status || typeof status !== 'object' || status.id !== m[1]) return send(res, 400, { error: 'status.id must match the URL' })
      if (!team) {
        if (teams.size >= MAX_TEAMS) sweep()
        if (teams.size >= MAX_TEAMS) return send(res, 503, { error: 'relay full' })
        team = new Map()
        teams.set(key, team)
      }
      if (!team.has(m[1]) && team.size >= MAX_MEMBERS) return send(res, 403, { error: 'team full' })
      team.set(m[1], { status, seen: now() })
      // One round trip: store mine, get everyone's.
      return send(res, 200, { members: members(team) })
    } catch (err) {
      return send(res, 400, { error: err instanceof Error ? err.message : 'bad request' })
    }
  }
}
