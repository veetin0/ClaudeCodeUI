import type { SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import type { PlanUsage } from '@shared/planUsage'
import type { PlanUsageReading } from '../agent/AgentService'

const POLL_MS = 120_000
const toMs = (t?: number) => (t === undefined ? undefined : t < 1e12 ? t * 1000 : t)
const toPct = (u?: number | null) => (u === undefined || u === null ? undefined : u <= 1 ? u * 100 : u)

export interface UsageMonitorDeps {
  /** Billed per token: no plan limits to watch. */
  usesApiKey(): boolean
  /** The CLI's usage call, from any running session. */
  planUsage(): Promise<PlanUsageReading | undefined>
  push(usage: PlanUsage): void
  onLimitReached?(resetsAt?: number): void
}

/**
 * This laptop's Claude plan usage (5-hour and weekly windows): from the rate-limit events sessions
 * report, plus a poll of the CLI's usage call. The status chip, usage history, the limit banner and
 * run-at-reset all read it.
 */
export class UsageMonitor {
  private usage: PlanUsage = { source: 'unknown' }
  private timer?: NodeJS.Timeout

  constructor(private readonly deps: UsageMonitorDeps) {}

  start() {
    this.timer = setInterval(() => void this.poll(), POLL_MS)
  }

  dispose() {
    clearInterval(this.timer)
  }

  state(): PlanUsage {
    return this.deps.usesApiKey() ? { source: 'api-key', at: Date.now() } : this.usage
  }

  onRateLimit(info: SDKRateLimitInfo) {
    const was = this.usage.status
    const resetsAt = toMs(info.resetsAt)
    const pct = toPct(info.utilization)
    const u: PlanUsage = { ...this.usage, source: 'plan', status: info.status, resetsAt, at: Date.now() }
    if (pct !== undefined && info.rateLimitType === 'five_hour') u.fiveHour = { pct, resetsAt }
    if (pct !== undefined && info.rateLimitType === 'seven_day') u.sevenDay = { pct, resetsAt }
    this.usage = u
    this.deps.push(this.state())
    if (info.status === 'rejected' && was !== 'rejected') this.deps.onLimitReached?.(resetsAt)
  }

  async poll() {
    const r = await this.deps.planUsage()
    if (!r) return
    const win = (w?: { utilization: number | null; resetsAt: string | null } | null) => {
      // Already a percentage: 0.5 means half a percent, not 50 %.
      const pct = typeof w?.utilization === 'number' ? Math.max(0, Math.min(100, w.utilization)) : undefined
      return pct === undefined ? undefined : { pct, resetsAt: w?.resetsAt ? Date.parse(w.resetsAt) : undefined }
    }
    this.usage = {
      ...this.usage,
      source: r.available ? 'plan' : this.usage.source,
      subscription: r.subscription ?? undefined,
      fiveHour: win(r.fiveHour) ?? this.usage.fiveHour,
      sevenDay: win(r.sevenDay) ?? this.usage.sevenDay,
      at: Date.now(),
    }
    this.deps.push(this.state())
  }
}
