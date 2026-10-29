import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/format'

export interface Series {
  name: string
  points: [number, number][]
}

/** Categorical slots in validated order; a 9th series is never generated (callers cap at 8). */
export const seriesColor = (i: number) => `var(--series-${(i % 8) + 1})`

function niceTicks(min: number, max: number, count = 3): number[] {
  if (min === max) return [min]
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, i) => min + step * i)
}

export function formatValue(v: number): string {
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (Number.isInteger(v)) return v.toLocaleString()
  if (a >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (a >= 10) return v.toFixed(1)
  if (a >= 0.01) return v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return v.toExponential(1)
}

/**
 * Line chart with a crosshair + tooltip. `compact` drops the axes for card-sized sparklines.
 * One y-scale only: callers chart differently-scaled metrics separately (small multiples).
 */
export function LineChart({
  series,
  height = 160,
  compact = false,
  xLabel,
  yLabel,
}: {
  series: Series[]
  height?: number
  compact?: boolean
  xLabel?: string
  yLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  const [hoverX, setHoverX] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(80, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const shown = series.slice(0, 8).filter((s) => s.points.length > 0)
  const pad = compact ? { l: 2, r: 2, t: 4, b: 4 } : { l: 44, r: shown.length <= 4 ? 64 : 12, t: 8, b: xLabel ? 30 : 20 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xs = shown.flatMap((s) => s.points.map((p) => p[0]))
    const ys = shown.flatMap((s) => s.points.map((p) => p[1]))
    let yMin = Math.min(...ys)
    let yMax = Math.max(...ys)
    if (yMin === yMax) {
      yMin -= Math.abs(yMin) * 0.1 || 1
      yMax += Math.abs(yMax) * 0.1 || 1
    }
    const span = yMax - yMin
    return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: yMin - span * 0.05, yMax: yMax + span * 0.05 }
  }, [shown])

  if (shown.length === 0) return <div ref={ref} style={{ height }} />

  const sx = (x: number) => pad.l + (xMax === xMin ? w / 2 : ((x - xMin) / (xMax - xMin)) * w)
  const sy = (y: number) => pad.t + h - ((y - yMin) / (yMax - yMin)) * h
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('')

  // Nearest point per series to the hovered x.
  const hovered =
    hoverX === null
      ? null
      : shown.map((s) => s.points.reduce((best, p) => (Math.abs(sx(p[0]) - hoverX) < Math.abs(sx(best[0]) - hoverX) ? p : best)))
  const hx = hovered ? sx(hovered[0][0]) : 0

  return (
    <div ref={ref} className="relative select-none">
      <svg
        width={width}
        height={height}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setHoverX(Math.min(pad.l + w, Math.max(pad.l, e.clientX - r.left)))
        }}
        onMouseLeave={() => setHoverX(null)}
        role="img"
        aria-label={`Line chart of ${shown.map((s) => s.name).join(', ')}`}
      >
        {!compact &&
          niceTicks(yMin, yMax).map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + w} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" />
              <text x={pad.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--muted)" className="num">
                {formatValue(t)}
              </text>
            </g>
          ))}
        {!compact && (
          <>
            <text x={pad.l} y={height - (xLabel ? 16 : 4)} fontSize="10" fill="var(--muted)">
              {formatValue(xMin)}
            </text>
            <text x={pad.l + w} y={height - (xLabel ? 16 : 4)} fontSize="10" fill="var(--muted)" textAnchor="end">
              {formatValue(xMax)}
            </text>
            {xLabel && (
              <text x={pad.l + w / 2} y={height - 3} fontSize="10" fill="var(--muted)" textAnchor="middle">
                {xLabel}
              </text>
            )}
            {yLabel && (
              <text x={10} y={pad.t + h / 2} fontSize="10" fill="var(--muted)" textAnchor="middle" transform={`rotate(-90 10 ${pad.t + h / 2})`}>
                {yLabel}
              </text>
            )}
          </>
        )}
        {shown.map((s, i) => (
          <path key={s.name} d={path(s.points)} fill="none" stroke={seriesColor(i)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {/* Direct labels at line ends (≤4 series) so identity is never color-alone. */}
        {!compact &&
          shown.length <= 4 &&
          shown.map((s) => {
            const last = s.points[s.points.length - 1]
            return (
              <text key={s.name} x={sx(last[0]) + 6} y={sy(last[1])} dy="0.32em" fontSize="10" fill="var(--fg)">
                {s.name}
              </text>
            )
          })}
        {hovered && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + h} stroke="var(--muted)" strokeDasharray="2 3" />
            {hovered.map((p, i) => (
              <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r="4" fill={seriesColor(i)} stroke="var(--surface)" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hovered && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-lg"
          style={{ left: Math.min(hx + 10, width - 130) }}
        >
          <div className="text-muted">
            {xLabel ?? 'step'} {formatValue(hovered[0][0])}
          </div>
          {hovered.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5 num">
              <span className="size-2 rounded-[2px]" style={{ background: seriesColor(i) }} />
              <span className="text-muted">{shown[i].name}</span>
              <span className="ml-auto pl-2 font-medium">{formatValue(p[1])}</span>
            </div>
          ))}
        </div>
      )}
      {shown.length >= 2 && (
        <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted', compact ? 'mt-1' : 'mt-2 pl-11')}>
          {shown.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full" style={{ background: seriesColor(i) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
