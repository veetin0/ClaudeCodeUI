import type { MetricSeries } from '@/stores/reducer'
import { formatValue, LineChart } from './LineChart'

/** Latest value + trend for one metric. Each metric gets its own scale (no dual axes). */
export function MetricTile({ name, series, height = 36 }: { name: string; series: MetricSeries; height?: number }) {
  const pts = series.points
  const last = pts[pts.length - 1]
  const first = pts[0]
  const delta = pts.length > 1 ? last.value - first.value : 0
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2">
      <div className="flex items-baseline gap-1.5">
        <span className="truncate text-[11px] text-muted">{name}</span>
        <span className="ml-auto text-[13px] font-semibold tabular-nums">{last ? formatValue(last.value) : '–'}</span>
      </div>
      {pts.length > 1 && (
        <>
          <LineChart compact height={height} series={[{ name, points: pts.map((p) => [p.step, p.value]) }]} />
          <div className="text-[10.5px] tabular-nums text-muted">
            {delta >= 0 ? '▲' : '▼'} {formatValue(Math.abs(delta))} over {pts.length} pts
          </div>
        </>
      )}
    </div>
  )
}
