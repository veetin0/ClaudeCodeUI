import { BarChart3 } from 'lucide-react'
import { ContextGauge } from '@/features/meters/ContextGauge'
import { cn, formatCost, formatTokens } from '@/lib/format'
import { shortcut } from '@/lib/keys'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useTeamState } from '@/stores/team'
import { Popover } from '@/ui/Popover'

/** This laptop's Claude plan usage (5-hour window), once a reading exists. */
export function usePlanUsage() {
  const usage = useTeamState()?.myUsage
  const w = usage?.fiveHour
  if (!usage || usage.source !== 'plan' || (!w && !usage.status)) return null
  const pct = w && (!w.resetsAt || w.resetsAt > Date.now()) ? Math.round(w.pct) : w ? 0 : undefined
  return {
    pct,
    week: usage.sevenDay ? Math.round(usage.sevenDay.pct) : undefined,
    resetsAt: w?.resetsAt,
    limited: usage.status === 'rejected',
    hot: usage.status === 'rejected' || (pct ?? 0) >= 90,
    warm: usage.status === 'allowed_warning' || (pct ?? 0) >= 70,
    label: usage.status === 'rejected' ? 'limit reached' : pct !== undefined ? `5h ${pct}%` : 'near limit',
  }
}

/**
 * One chip for the meters: context ring and cost, turning amber or red when context or plan
 * usage runs high. The details (tokens, model, plan windows, usage history) are one click away.
 */
export function StatusChip({ session }: { session: SessionState }) {
  const plan = usePlanUsage()
  const ctx = session.contextWindow > 0 ? session.contextTokens / session.contextWindow : 0
  const tone = plan?.hot || ctx > 0.85 ? 'hot' : plan?.warm || ctx > 0.65 ? 'warm' : null
  return (
    <Popover
      className="w-72 p-3"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          title="Context, plan usage and cost"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2 py-1 tabular-nums hover:bg-black/5 dark:hover:bg-white/10',
            open && 'bg-black/5 dark:bg-white/10',
            tone === 'hot' ? 'text-red-500' : tone === 'warm' ? 'text-amber-600 dark:text-amber-400' : 'text-muted',
          )}
        >
          <Ring pct={ctx} />
          {Math.round(ctx * 100)}%
          {plan && (plan.hot || plan.warm) && <span>· {plan.label}</span>}
          <span className="font-medium text-fg">· {formatCost(session.totalCostUsd)}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-2.5 text-[12px]">
          <Row label="Context">
            <ContextGauge used={session.contextTokens} total={session.contextWindow} />
          </Row>
          {plan && (
            <Row label="Plan usage">
              <span className={cn('tabular-nums', plan.hot ? 'font-medium text-red-500' : plan.warm ? 'text-amber-600 dark:text-amber-400' : '')}>
                {plan.label}
                {plan.week !== undefined && <span className="text-muted"> · week {plan.week}%</span>}
                {plan.resetsAt && (
                  <span className="block text-right text-[11px] text-muted">resets {new Date(plan.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                )}
              </span>
            </Row>
          )}
          {session.model && <Row label="Model">{session.saver?.auto ? `Auto · ${session.model}` : session.model}</Row>}
          <Row label="Output tokens">
            <span className="tabular-nums">{formatTokens(session.outputTokens)}</span>
          </Row>
          <Row label="Cost this session">
            <span className="font-medium tabular-nums">{formatCost(session.totalCostUsd)}</span>
          </Row>
          <button
            onClick={() => {
              close()
              useApp.getState().setUsageOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 hover:bg-surface-2"
          >
            <BarChart3 className="size-3.5 text-muted" /> Usage history
            <kbd className="ml-auto text-[11px] text-muted">{shortcut('⌘5')}</kbd>
          </button>
        </div>
      )}
    </Popover>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 5.5
  const c = 2 * Math.PI * r
  const color = pct > 0.85 ? '#ef4444' : pct > 0.65 ? '#f59e0b' : 'var(--accent)'
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="-rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" stroke="var(--line)" strokeWidth="2.2" />
      <circle cx="7" cy="7" r={r} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeDasharray={`${c * Math.min(1, pct)} ${c}`} />
    </svg>
  )
}
