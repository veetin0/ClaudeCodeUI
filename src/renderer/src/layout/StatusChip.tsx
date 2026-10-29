import { BarChart3 } from 'lucide-react'
import { ContextGauge, contextTone } from '@/features/meters/ContextGauge'
import { SectorMeter } from '@/ui/Sectors'
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
            'num flex h-7 items-center gap-2 rounded-md px-2 text-[13px] hover:bg-hover',
            open && 'bg-hover',
            tone === 'hot' ? 'text-danger-ink' : tone === 'warm' ? 'text-warn-ink' : 'text-muted',
          )}
        >
          <SectorMeter value={ctx} count={8} tone={contextTone(ctx)} className="w-16" label="Context used" />
          {Math.round(ctx * 100)}%
          {plan && (plan.hot || plan.warm) && <span>· {plan.label}</span>}
          <span className="font-semibold text-fg">· {formatCost(session.totalCostUsd)}</span>
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
              <span className={cn('num', plan.hot ? 'font-semibold text-danger-ink' : plan.warm ? 'text-warn-ink' : '')}>
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
            <span className="num">{formatTokens(session.outputTokens)}</span>
          </Row>
          <Row label="Cost this session">
            <span className="num font-semibold">{formatCost(session.totalCostUsd)}</span>
          </Row>
          <button
            onClick={() => {
              close()
              useApp.getState().setUsageOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-md border border-line px-2.5 py-1.5 hover:bg-hover"
          >
            <BarChart3 className="size-3.5 text-muted" /> Usage history
            <kbd className="num ml-auto text-[12px] text-muted">{shortcut('⌘5')}</kbd>
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
