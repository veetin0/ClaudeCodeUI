import { formatTokens } from '@/lib/format'
import { SectorMeter, type SectorTone } from '@/ui/Sectors'

/** How full the context window is, as sectors that turn yellow, then red, before auto-compact. */
export function contextTone(pct: number): SectorTone {
  return pct > 0.85 ? 'fail' : pct > 0.65 ? 'wait' : 'best'
}

export function ContextGauge({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(1, used / total) : 0
  return (
    <div className="flex items-center gap-2" title={`Context: ${used.toLocaleString()} / ${total.toLocaleString()} tokens`}>
      <SectorMeter value={pct} tone={contextTone(pct)} className="w-24" label="Context used" />
      <span className="num">
        {Math.round(pct * 100)}%<span className="text-muted"> · {formatTokens(used)}</span>
      </span>
    </div>
  )
}
