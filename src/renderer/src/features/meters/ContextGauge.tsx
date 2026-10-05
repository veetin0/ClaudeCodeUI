import { formatTokens } from '@/lib/format'

/** Ring that fills as the main agent's context window fills; turns amber/red before auto-compact. */
export function ContextGauge({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0
  const r = 7
  const c = 2 * Math.PI * r
  const color = pct > 0.85 ? '#ef4444' : pct > 0.65 ? '#f59e0b' : 'var(--accent)'
  return (
    <div className="flex items-center gap-1.5" title={`Context: ${used.toLocaleString()} / ${total.toLocaleString()} tokens`}>
      <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          style={{ transition: 'stroke-dasharray 400ms ease' }}
        />
      </svg>
      <span className="tabular-nums">
        {Math.round(pct * 100)}%<span className="text-muted"> · {formatTokens(used)}</span>
      </span>
    </div>
  )
}
