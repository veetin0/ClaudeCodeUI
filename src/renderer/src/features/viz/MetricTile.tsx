import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { MetricSeries } from '@/stores/reducer'
import { formatValue, LineChart } from './LineChart'

/** Latest value + trend for one metric. Each metric gets its own scale (no dual axes). */
export function MetricTile({ name, series, height = 36 }: { name: string; series: MetricSeries; height?: number }) {
  const pts = series.points
  const last = pts[pts.length - 1]
  const first = pts[0]
  const delta = pts.length > 1 ? last.value - first.value : 0
  return (
    <div className="min-w-0 rounded-md border border-line bg-surface-2/60 px-2.5 py-2">
      <div className="flex items-baseline gap-1.5">
        <span className="truncate text-[12px] text-muted">{name}</span>
        <span className="num ml-auto text-[16px] font-semibold">{last ? formatValue(last.value) : '–'}</span>
      </div>
      {pts.length > 1 && (
        <>
          <LineChart compact height={height} series={[{ name, points: pts.map((p) => [p.step, p.value]) }]} />
          <div className="num flex items-center gap-1 text-[12px] text-muted">
            {delta >= 0 ? <ArrowUpRight className="size-3" aria-label="up" /> : <ArrowDownRight className="size-3" aria-label="down" />}
            {formatValue(Math.abs(delta))} over {pts.length} pts
          </div>
        </>
      )}
    </div>
  )
}
