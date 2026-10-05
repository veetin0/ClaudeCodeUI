import { DatabaseSync } from 'node:sqlite'
import { EPHEMERAL_EVENTS, type HarnessEvent } from '@shared/events'
import type { LoadedSession, SessionSummary } from '@shared/ipc'

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
        claude_session_id TEXT
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
    `)
  }

  /** Registers a new session, or marks a saved one as resumed. */
  open(summary: SessionSummary) {
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, title, created_at, updated_at, cost_usd, model, claude_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .run(summary.id, summary.cwd, summary.title, summary.createdAt, summary.updatedAt, summary.costUsd, summary.model ?? null, summary.claudeSessionId ?? null)
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

  close() {
    if (this.closed) return
    this.flush()
    this.closed = true
    this.db.close()
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
      case 'turn.end': {
        const cost = (this.costOffset.get(e.sessionId) ?? 0) + e.costUsd
        this.db.prepare('UPDATE sessions SET cost_usd = MAX(cost_usd, ?), updated_at = ? WHERE id = ?').run(cost, e.ts, e.sessionId)
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
  }
}
