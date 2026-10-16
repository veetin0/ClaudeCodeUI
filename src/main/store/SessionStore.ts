import { DatabaseSync } from 'node:sqlite'
import { EPHEMERAL_EVENTS, type HarnessEvent } from '@shared/events'
import type { LoadedSession, SessionSummary } from '@shared/ipc'
import { approxTokens } from '@shared/usageSaver'
import { emptyFamilies, familyOf, freshTokens, localDay, sumFamilies, usageDelta, type ModelTokens, type UsageHistory } from '@shared/usageHistory'

const FLUSH_MS = 250
const TITLE_MAX = 80

interface SessionRow {
  id: string
  cwd: string
  title: string
  created_at: number
  updated_at: number
  cost_usd: number
  model: string | null
  claude_session_id: string | null
  observed: number
}

/**
 * Saves sessions and their event logs in SQLite (Node's built-in driver; no native module).
 * Reopening a session replays its events through the same reducer as live view.
 */
export class SessionStore {
  private db: DatabaseSync
  private pending: HarnessEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private nextSeq = new Map<string, number>()
  /** Cost already accrued before the current CLI process; total_cost_usd restarts at 0 on resume. */
  private costOffset = new Map<string, number>()
  /** Each session's latest cumulative per-model usage, so each turn's share can be recorded. */
  private lastUsage = new Map<string, Record<string, ModelTokens>>()
  private lastSample: { ts: number; key: string } | null = null
  private closed = false

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        cost_usd REAL NOT NULL DEFAULT 0,
        model TEXT,
        claude_session_id TEXT,
        observed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS sessions_updated ON sessions(updated_at DESC);
      CREATE TABLE IF NOT EXISTS snapshots (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        original TEXT,
        PRIMARY KEY (session_id, path)
      );
      -- Usage history: what each turn used per model (kept when a session is deleted: it was still used).
      CREATE TABLE IF NOT EXISTS usage_turns (
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        model TEXT NOT NULL,
        input INTEGER NOT NULL,
        output INTEGER NOT NULL,
        cache_read INTEGER NOT NULL,
        cache_write INTEGER NOT NULL,
        cost REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usage_turns_ts ON usage_turns(ts);
      CREATE TABLE IF NOT EXISTS saver_log (
        session_id TEXT NOT NULL,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        model TEXT,
        tokens INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS saver_log_ts ON saver_log(ts);
      CREATE TABLE IF NOT EXISTS plan_samples (
        ts INTEGER PRIMARY KEY,
        five_pct REAL,
        seven_pct REAL
      );
    `)
    this.migrate()
  }

  private migrate() {
    const cols = (this.db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]).map((c) => c.name)
    if (!cols.includes('observed')) this.db.exec('ALTER TABLE sessions ADD COLUMN observed INTEGER NOT NULL DEFAULT 0')
  }

  /** Registers a new session, or marks a saved one as resumed. */
  open(summary: SessionSummary) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, title, created_at, updated_at, cost_usd, model, claude_session_id, observed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .run(
        summary.id,
        summary.cwd,
        summary.title,
        summary.createdAt,
        summary.updatedAt,
        summary.costUsd,
        summary.model ?? null,
        summary.claudeSessionId ?? null,
        summary.observed ? 1 : 0,
      )
  }

  record(e: HarnessEvent) {
    if (this.closed || EPHEMERAL_EVENTS.has(e.type)) return
    this.pending.push(e)
    this.timer ??= setTimeout(() => this.flush(), FLUSH_MS)
  }

  flush() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []

    const insert = this.db.prepare('INSERT INTO events (session_id, seq, ts, type, data) VALUES (?, ?, ?, ?, ?)')
    this.db.exec('BEGIN')
    try {
      for (const e of batch) {
        if (!this.exists(e.sessionId)) continue
        insert.run(e.sessionId, this.seqFor(e.sessionId), e.ts, e.type, JSON.stringify(e))
        this.updateMeta(e)
      }
      this.db.exec('COMMIT')
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  list(): SessionSummary[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as unknown as SessionRow[]
    return rows.map(toSummary)
  }

  get(id: string): SessionSummary | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as unknown as SessionRow | undefined
    return row ? toSummary(row) : null
  }

  load(id: string): LoadedSession | null {
    this.flush()
    const summary = this.get(id)
    if (!summary) return null
    const rows = this.db.prepare('SELECT data FROM events WHERE session_id = ? ORDER BY seq').all(id) as { data: string }[]
    return { summary, events: rows.map((r) => JSON.parse(r.data) as HarnessEvent) }
  }

  delete(id: string) {
    this.flush()
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    this.nextSeq.delete(id)
    this.costOffset.delete(id)
  }

  /** A plan usage reading (5-hour and weekly percent), for the usage chart. Unchanged readings are skipped. */
  recordPlanSample(fivePct: number | undefined, sevenPct: number | undefined, ts = Date.now()) {
    if (this.closed || (fivePct === undefined && sevenPct === undefined)) return
    const key = `${fivePct?.toFixed(1)}|${sevenPct?.toFixed(1)}`
    if (this.lastSample && this.lastSample.key === key && ts - this.lastSample.ts < 10 * 60_000) return
    this.lastSample = { ts, key }
    this.db.prepare('INSERT OR REPLACE INTO plan_samples (ts, five_pct, seven_pct) VALUES (?, ?, ?)').run(ts, fivePct ?? null, sevenPct ?? null)
  }

  /** Tokens per day and model family, the heaviest sessions, the saver's work and plan readings. */
  usageHistory(days = 14, now = Date.now()): UsageHistory {
    this.flush()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - (days - 1))
    const since = start.getTime()
    const list = Array.from({ length: days }, (_, i) => {
      const d = new Date(since)
      d.setDate(d.getDate() + i)
      return { day: localDay(d.getTime()), tokens: emptyFamilies(), cacheRead: 0, costUsd: 0 }
    })
    const byDay = new Map(list.map((d) => [d.day, d]))
    const totals = { tokens: emptyFamilies(), cacheRead: 0, costUsd: 0 }
    const rows = this.db
      .prepare('SELECT day, model, SUM(input) AS input, SUM(output) AS output, SUM(cache_read) AS cache_read, SUM(cache_write) AS cache_write, SUM(cost) AS cost FROM usage_turns WHERE ts >= ? GROUP BY day, model')
      .all(since) as { day: string; model: string; input: number; output: number; cache_read: number; cache_write: number; cost: number }[]
    for (const r of rows) {
      const fam = familyOf(r.model)
      const fresh = freshTokens({ input: r.input, output: r.output, cacheWrite: r.cache_write })
      const d = byDay.get(r.day)
      if (d) {
        d.tokens[fam] += fresh
        d.cacheRead += r.cache_read
        d.costUsd += r.cost
      }
      totals.tokens[fam] += fresh
      totals.cacheRead += r.cache_read
      totals.costUsd += r.cost
    }
    const topSessions = (
      this.db
        .prepare(
          `SELECT u.session_id AS id, s.title AS title, s.cwd AS cwd, SUM(u.input + u.output + u.cache_write) AS tokens, SUM(u.cost) AS cost, MAX(u.ts) AS last
           FROM usage_turns u JOIN sessions s ON s.id = u.session_id WHERE u.ts >= ? GROUP BY u.session_id ORDER BY tokens DESC LIMIT 6`,
        )
        .all(since) as { id: string; title: string; cwd: string; tokens: number; cost: number; last: number }[]
    ).map((r) => ({ id: r.id, title: r.title, cwd: r.cwd, tokens: r.tokens, costUsd: r.cost, lastTs: r.last }))
    const saver = { sonnetTurns: 0, opusTurns: 0, takeovers: 0, compactions: 0, compactedTokens: 0, skipped: 0, skippedTokens: 0 }
    for (const r of this.db.prepare('SELECT kind, model, COUNT(*) AS n, SUM(tokens) AS tokens FROM saver_log WHERE ts >= ? GROUP BY kind, model').all(since) as {
      kind: string
      model: string | null
      n: number
      tokens: number
    }[]) {
      if (r.kind === 'turn' && r.model === 'sonnet') saver.sonnetTurns += r.n
      else if (r.kind === 'turn' && r.model === 'opus') saver.opusTurns += r.n
      else if (r.kind === 'takeover') saver.takeovers += r.n
      else if (r.kind === 'compact') {
        saver.compactions += r.n
        saver.compactedTokens += r.tokens
      } else if (r.kind === 'skip') {
        saver.skipped += r.n
        saver.skippedTokens += r.tokens
      }
    }
    const samples = (this.db.prepare('SELECT ts, five_pct, seven_pct FROM plan_samples WHERE ts >= ? ORDER BY ts').all(now - 48 * 3600_000) as { ts: number; five_pct: number | null; seven_pct: number | null }[]).map(
      (r) => ({ ts: r.ts, fivePct: r.five_pct ?? undefined, sevenPct: r.seven_pct ?? undefined }),
    )
    return { days: list, totals, topSessions, saver, samples }
  }

  /** Today's tokens, for the team board. */
  usageToday(now = Date.now()): { tokens: number; costUsd: number; byModel: Record<string, number> } {
    const h = this.usageHistory(1, now)
    const t = h.totals.tokens
    return { tokens: sumFamilies(t), costUsd: h.totals.costUsd, byModel: { Sonnet: t.sonnet, Opus: t.opus, Haiku: t.haiku, Other: t.other } }
  }

  close() {
    if (this.closed) return
    this.flush()
    this.closed = true
    this.db.close()
  }

  // Snapshots: each file's content from before the session first changed it (null = didn't exist).

  getSnapshots(sessionId: string): Map<string, string | null> {
    const rows = this.db.prepare('SELECT path, original FROM snapshots WHERE session_id = ?').all(sessionId) as { path: string; original: string | null }[]
    return new Map(rows.map((r) => [r.path, r.original]))
  }

  saveSnapshot(sessionId: string, path: string, original: string | null) {
    if (this.closed || !this.exists(sessionId)) return
    this.db.prepare('INSERT OR IGNORE INTO snapshots (session_id, path, original) VALUES (?, ?, ?)').run(sessionId, path, original)
  }

  deleteSnapshot(sessionId: string, path: string) {
    if (this.closed) return
    this.db.prepare('DELETE FROM snapshots WHERE session_id = ? AND path = ?').run(sessionId, path)
  }

  private exists(id: string): boolean {
    return this.nextSeq.has(id) || this.db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(id) !== undefined
  }

  private seqFor(id: string): number {
    let seq = this.nextSeq.get(id)
    if (seq === undefined) {
      const row = this.db.prepare('SELECT COALESCE(MAX(seq), -1) AS m FROM events WHERE session_id = ?').get(id) as { m: number }
      seq = row.m + 1
    }
    this.nextSeq.set(id, seq + 1)
    return seq
  }

  private updateMeta(e: HarnessEvent) {
    const touch = this.db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
    switch (e.type) {
      case 'session.init':
        this.db.prepare('UPDATE sessions SET claude_session_id = ?, model = ? WHERE id = ?').run(e.claudeSessionId, e.model, e.sessionId)
        break
      case 'session.resumed': {
        // A new agent process: its usage counts from zero again.
        this.lastUsage.delete(e.sessionId)
        const row = this.db.prepare('SELECT cost_usd FROM sessions WHERE id = ?').get(e.sessionId) as { cost_usd: number }
        this.costOffset.set(e.sessionId, row.cost_usd)
        break
      }
      case 'user.message':
        this.db
          .prepare("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND title = ''")
          .run(makeTitle(e.text), e.ts, e.sessionId)
        touch.run(e.ts, e.sessionId)
        break
      case 'cost':
        this.db.prepare('UPDATE sessions SET cost_usd = MAX(cost_usd, ?) WHERE id = ?').run(e.totalCostUsd, e.sessionId)
        break
      case 'turn.end': {
        const cost = (this.costOffset.get(e.sessionId) ?? 0) + e.costUsd
        this.db.prepare('UPDATE sessions SET cost_usd = MAX(cost_usd, ?), updated_at = ? WHERE id = ?').run(cost, e.ts, e.sessionId)
        if (e.modelUsage) {
          const delta = usageDelta(this.lastUsage.get(e.sessionId), e.modelUsage)
          this.lastUsage.set(e.sessionId, e.modelUsage)
          const ins = this.db.prepare('INSERT INTO usage_turns (session_id, ts, day, model, input, output, cache_read, cache_write, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          for (const [model, d] of Object.entries(delta)) ins.run(e.sessionId, e.ts, localDay(e.ts), model, d.input, d.output, d.cacheRead, d.cacheWrite, d.costUsd)
        }
        break
      }
      case 'saver': {
        const n = e.note
        const ins = this.db.prepare('INSERT INTO saver_log (session_id, ts, kind, model, tokens) VALUES (?, ?, ?, ?, ?)')
        if (n.kind === 'route') ins.run(e.sessionId, e.ts, n.midTurn ? (n.model === 'opus' ? 'takeover' : 'handback') : 'turn', n.model, 0)
        else if (n.kind === 'compact') ins.run(e.sessionId, e.ts, 'compact', null, Math.max(0, n.preTokens - (n.postTokens ?? 0)))
        else if (n.kind === 'skip') ins.run(e.sessionId, e.ts, 'skip', null, approxTokens(n.bytes))
        break
      }
    }
  }
}

export function makeTitle(prompt: string): string {
  const line = prompt.replace(/\s+/g, ' ').trim()
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line
}

function toSummary(r: SessionRow): SessionSummary {
  return {
    id: r.id,
    cwd: r.cwd,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    costUsd: r.cost_usd,
    model: r.model ?? undefined,
    claudeSessionId: r.claude_session_id ?? undefined,
    observed: r.observed === 1 || undefined,
  }
}
