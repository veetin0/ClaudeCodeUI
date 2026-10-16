import type { PhoneAlertKind, PhoneAlertSettings } from '@shared/alerts'

export interface PhoneDeps {
  settings(): PhoneAlertSettings
  /** You're away from the laptop (screen locked or idle). */
  away(): boolean
  fetch?: typeof fetch
  now?(): number
}

/** The same kind of alert at most this often, so a busy run doesn't buzz your phone nonstop. */
const MIN_GAP_MS = 20_000

/** Sends short alerts to your phone through ntfy. */
export class PhoneAlerts {
  private last = new Map<string, number>()

  constructor(private readonly deps: PhoneDeps) {}

  /** Sends if alerts are on, this kind is wanted, and (if set) you're away. Never throws. */
  async alert(kind: PhoneAlertKind, title: string, message: string, opts: { priority?: 1 | 2 | 3 | 4 | 5; tags?: string[] } = {}): Promise<boolean> {
    const s = this.deps.settings()
    if (!s.enabled || !s.topic || !s[kind]) return false
    if (s.onlyWhenAway && !this.deps.away()) return false
    const now = this.deps.now?.() ?? Date.now()
    const key = `${kind}:${title}`
    if (now - (this.last.get(key) ?? 0) < MIN_GAP_MS) return false
    this.last.set(key, now)
    try {
      await this.publish(s, title, message, opts)
      return true
    } catch {
      return false
    }
  }

  /** "Send test": always sends, and reports what went wrong. */
  async test(): Promise<void> {
    const s = this.deps.settings()
    if (!s.topic) throw new Error('No topic yet.')
    await this.publish(s, 'Harness is connected', 'Phone alerts work. You’ll get one when Claude needs you or finishes while you’re away.', { tags: ['white_check_mark'] })
  }

  private async publish(s: PhoneAlertSettings, title: string, message: string, opts: { priority?: number; tags?: string[] }) {
    const f = this.deps.fetch ?? fetch
    // JSON publishing (POST to the server root) keeps non-ASCII titles intact.
    const res = await f(s.server.replace(/\/+$/, '') + '/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: s.topic, title: title.slice(0, 120), message: message.slice(0, 600), priority: opts.priority ?? 3, tags: opts.tags ?? [] }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => {
      throw new Error(`Can’t reach ${s.server}`)
    })
    if (!res.ok) throw new Error(`${s.server} answered ${res.status}`)
  }
}
