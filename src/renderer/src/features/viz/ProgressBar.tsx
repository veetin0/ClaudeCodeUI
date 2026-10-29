import { formatDuration } from '@/lib/format'
import type { ProgressState } from '@/stores/reducer'
import { SectorMeter } from '@/ui/Sectors'

/** Progress as sectors, with a rate-based ETA once there's enough signal. */
export function ProgressBar({ p, compact }: { p: ProgressState; compact?: boolean }) {
  const pct = Math.max(0, Math.min(1, p.current / p.total))
  const done = p.current >= p.total
  const elapsed = p.updatedAt - p.startedAt
  const eta = !done && p.current > 0 && elapsed > 1500 ? (elapsed / p.current) * (p.total - p.current) : null

  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2 text-[12px]">
        <span className="truncate font-medium capitalize">{p.label}</span>
        <span className="num text-muted">
          {fmt(p.current)}/{fmt(p.total)}
          {p.unit ? ` ${p.unit}` : ''}
        </span>
        <span className="num ml-auto text-muted">
          <span className="font-semibold text-fg">{Math.round(pct * 100)}%</span>
          {!compact && eta !== null && ` · ~${formatDuration(eta)} left`}
        </span>
      </div>
      <SectorMeter value={pct} count={compact ? 16 : 24} tone={done ? 'done' : 'live'} label={p.label} />
    </div>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)
}
