import { formatDuration } from '@/lib/format'
import type { ProgressState } from '@/stores/reducer'

/** Progress with rate-based ETA once there's enough signal. */
export function ProgressBar({ p, compact }: { p: ProgressState; compact?: boolean }) {
  const pct = Math.max(0, Math.min(1, p.current / p.total))
  const done = p.current >= p.total
  const elapsed = p.updatedAt - p.startedAt
  const eta = !done && p.current > 0 && elapsed > 1500 ? (elapsed / p.current) * (p.total - p.current) : null

  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2 text-[11.5px]">
        <span className="truncate font-medium capitalize">{p.label}</span>
        <span className="tabular-nums text-muted">
          {fmt(p.current)}/{fmt(p.total)}
          {p.unit ? ` ${p.unit}` : ''}
        </span>
        <span className="ml-auto tabular-nums text-muted">
          {Math.round(pct * 100)}%{!compact && eta !== null && ` · ~${formatDuration(eta)} left`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={p.current} aria-valuemax={p.total} aria-label={p.label}>
        <div
          className={done ? 'h-full rounded-full bg-emerald-500' : 'h-full rounded-full bg-[var(--accent)]'}
          style={{ width: `${pct * 100}%`, transition: 'width 400ms ease' }}
        />
      </div>
    </div>
  )
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1)
}
