// Harness team relay: holds each teammate's latest status, keyed by a shared team token, plus the
// files crew mode moves between laptops (the project and each mission's work, as git bundles).
// Plain Node, no dependencies, in memory only. Used by Harness's "host on this computer" mode and
// by server.mjs for running it anywhere (Render, a VPS, Fly, a Raspberry Pi…).
// Everything teammates put here is encrypted with the team key on their side; the relay only stores it.
import { createHash } from 'node:crypto'

const MAX_BODY = 256 * 1024
const MAX_TEAMS = 500
const MAX_MEMBERS = 12
const EXPIRE_MS = 12 * 3600_000
/** One file (a git bundle of a hackathon project, assets included). */
const MAX_BLOB = 40 * 1024 * 1024
/** Per team, and for the whole relay (Render's free plan has 512 MB): oldest files go first. */
const TEAM_BLOB_BYTES = 200 * 1024 * 1024
const TOTAL_BLOB_BYTES = 320 * 1024 * 1024

/** @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void} */
export function createRelay({ now = () => Date.now(), maxBlob = MAX_BLOB, teamBlobBytes = TEAM_BLOB_BYTES, totalBlobBytes = TOTAL_BLOB_BYTES } = {}) {
  /** @type {Map<string, Map<string, { status: unknown, seen: number }>>} */
  const teams = new Map()
  /** @type {Map<string, Map<string, { data: Buffer, at: number }>>} team key → blob id → file */
  const blobs = new Map()

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
      // How long ago, on the relay's clock: laptops' clocks can disagree by minutes.
      else out.push({ ...m.status, seenMsAgo: t - m.seen })
    }
    return out
  }
  /** Drops expired members and the teams they leave empty, so old teams don't fill the relay. */
  const sweep = () => {
    for (const [key, team] of teams) if (members(team).length === 0) teams.delete(key)
  }
  const readBody = (req, limit) =>
    new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > limit) {
          // Answer first, then drop the connection (see the catch below).
          req.pause()
          reject(Object.assign(new Error('too large'), { code: 413 }))
        } else chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })

  // ---------- files ----------
  const bytesOf = (files) => [...files.values()].reduce((n, f) => n + f.data.length, 0)
  const expireBlobs = () => {
    const t = now()
    for (const [key, files] of blobs) {
      for (const [id, f] of files) if (t - f.at > EXPIRE_MS) files.delete(id)
      if (!files.size) blobs.delete(key)
    }
  }
  /** Makes room for `size` more bytes: the team's oldest files first, then the relay's oldest. */
  const makeRoom = (key, size) => {
    const files = blobs.get(key)
    const oldest = (map) => [...map.entries()].sort((a, b) => a[1].at - b[1].at)
    if (files) for (const [id] of oldest(files)) if (bytesOf(files) + size > teamBlobBytes) files.delete(id)
    const all = () => [...blobs.values()].reduce((n, f) => n + bytesOf(f), 0)
    while (all() + size > totalBlobBytes) {
      let victim = null
      for (const [k, map] of blobs) for (const [id, f] of map) if (!victim || f.at < victim.at) victim = { k, id, at: f.at }
      if (!victim) break
      blobs.get(victim.k)?.delete(victim.id)
    }
  }

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://relay')
      if (url.pathname === '/health') return send(res, 200, { ok: true, service: 'harness-team-relay', blobs: true })
      if (!url.pathname.startsWith('/v1/team')) return send(res, 404, { error: 'not found' })
      const key = teamKey(req)
      if (!key) return send(res, 401, { error: 'missing or invalid team token' })
      let team = teams.get(key)

      if (req.method === 'GET' && url.pathname === '/v1/team') return send(res, 200, { members: team ? members(team) : [] })

      const b = /^\/v1\/team\/blobs\/([A-Za-z0-9_-]{4,80})$/.exec(url.pathname)
      if (b) {
        expireBlobs()
        if (req.method === 'GET') {
          const f = blobs.get(key)?.get(b[1])
          if (!f) return send(res, 404, { error: 'no such file (it may have expired)' })
          res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': f.data.length, 'cache-control': 'no-store' })
          return res.end(f.data)
        }
        if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
        // Only a team that exists (a member has reported) may store files.
        if (!team) return send(res, 403, { error: 'join the team first' })
        if (Number(req.headers['content-length']) > maxBlob) throw Object.assign(new Error('too large'), { code: 413 })
        const data = await readBody(req, maxBlob)
        makeRoom(key, data.length)
        if (!blobs.has(key)) blobs.set(key, new Map())
        blobs.get(key).set(b[1], { data, at: now() })
        return send(res, 200, { ok: true, bytes: data.length })
      }

      const m = /^\/v1\/team\/members\/([A-Za-z0-9_-]{4,64})$/.exec(url.pathname)
      if (!m) return send(res, 404, { error: 'not found' })
      if (req.method === 'DELETE') {
        team?.delete(m[1])
        if (team && team.size === 0) teams.delete(key)
        return send(res, 200, { ok: true })
      }
      if (req.method !== 'PUT') return send(res, 405, { error: 'method not allowed' })
      const status = JSON.parse((await readBody(req, MAX_BODY)).toString('utf8'))
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
      const code = err && typeof err === 'object' && err.code === 413 ? 413 : 400
      if (code === 413) {
        res.setHeader('connection', 'close')
        res.on('finish', () => req.destroy())
      }
      if (!res.headersSent) return send(res, code, { error: err instanceof Error ? err.message : 'bad request' })
    }
  }
}
