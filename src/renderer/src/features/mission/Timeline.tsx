import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn, formatDuration } from '@/lib/format'
import { KIND_COLOR, KIND_LABEL, toolDisplayName, toolKind, toolSummary, type ToolKind } from '@/lib/tools'
import { useApp } from '@/stores/app'
import type { SessionState, ToolCall } from '@/stores/reducer'
import { agentViews, isActive } from '../agents/model'
import { useElapsed } from '../meters/useElapsed'
import { formatOffset, packRows, tickStep } from './layout'

const LABEL_W = 170
const ROW_H = 14
const ROW_GAP = 2
const LANE_PAD = 8
const WINDOW_MS = 120_000

/**
 * Swim lanes, one per agent; a bar per tool call (colour = kind, length = duration).
 * Parallel calls stack within a lane. Hover for details, click to open the call in its agent.
 */
export function Timeline({ session }: { session: SessionState }) {
  const openAgent = useApp((s) => s.openAgent)
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [follow, setFollow] = useState(false)
  const [hover, setHover] = useState<{ tool: ToolCall; lane: string; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const agents = agentViews(session)
  const allTools = Object.values(session.tools)
  const anyRunning = agents.some(isActive) || allTools.some((t) => t.status === 'running')
  const first = Math.min(...allTools.map((t) => t.startedAt), ...agents.map((a) => a.startedAt ?? Infinity))
  const live = useElapsed(anyRunning && Number.isFinite(first) ? first : undefined, 500)
  const replayT = useApp((s) => (s.replay?.sessionId === session.id ? s.replay.t : undefined))
  const now = replayT ?? (anyRunning ? first + live : Math.max(...allTools.map((t) => t.endedAt ?? t.startedAt), first + 1000))

  const t1 = now
  const t0 = follow ? Math.max(first, t1 - WINDOW_MS) : first
  const span = Math.max(1000, t1 - t0)
  const plotW = Math.max(100, width - LABEL_W - 12)
  const x = (t: number) => LABEL_W + ((t - t0) / span) * plotW

  const lanes = useMemo(
    () =>
      agents.map((a) => {
        const rows = packRows(a.tools, now)
        const rowCount = Math.max(1, ...[...rows.values()].map((r) => r + 1))
        return { agent: a, rows, height: rowCount * (ROW_H + ROW_GAP) + LANE_PAD * 2 }
      }),
    [agents.map((a) => `${a.key}:${a.tools.length}:${a.tools.filter((t) => t.status === 'running').length}`).join(), Math.floor(now / 1000)],
  )

  const kinds = [...new Set(allTools.map((t) => toolKind(t.name)))] as ToolKind[]
  const step = tickStep(span)
  const ticks: number[] = []
  for (let t = Math.ceil((t0 - first) / step) * step; first + t <= t1; t += step) ticks.push(first + t)

  if (!Number.isFinite(first) || allTools.length === 0) {
    return <div className="flex h-full items-center justify-center text-[12px] text-muted">The timeline fills in as agents call tools.</div>
  }

  let y = 24
  return (
    <div ref={ref} className="relative h-full overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-3 py-1.5 text-[11px] text-muted">
        <span className="font-semibold uppercase tracking-wide">Timeline</span>
        {kinds.map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <div className="ml-auto flex overflow-hidden rounded-md border border-line">
          {(['All', 'Last 2 min'] as const).map((label) => (
            <button
              key={label}
              onClick={() => setFollow(label !== 'All')}
              className={cn('px-2 py-0.5', (label !== 'All') === follow ? 'bg-surface-2 text-fg' : 'hover:text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <svg width={width} height={lanes.reduce((h, l) => h + l.height, 0) + 28} className="block" onMouseLeave={() => setHover(null)}>
        {/* time axis */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={18} y2="100%" stroke="var(--grid)" />
            <text x={x(t)} y={12} fontSize="10" textAnchor="middle" fill="var(--muted)" className="tabular-nums">
              {formatOffset(t - first)}
            </text>
          </g>
        ))}
        {anyRunning && <line x1={x(now)} x2={x(now)} y1={16} y2="100%" stroke="var(--accent)" strokeDasharray="3 3" />}

        {lanes.map(({ agent: a, rows, height }) => {
          const laneY = y
          y += height
          const start = Math.max(t0, a.startedAt ?? first)
          const end = a.endedAt ?? (isActive(a) ? now : Math.max(start, ...a.tools.map((t) => t.endedAt ?? t.startedAt)))
          return (
            <g key={a.key}>
              <line x1={0} x2={width} y1={laneY + height} y2={laneY + height} stroke="var(--line)" />
              <foreignObject x={8} y={laneY} width={LABEL_W - 16} height={height}>
                <button
                  onClick={() => openAgent(a.key)}
                  className="flex h-full w-full flex-col justify-center text-left text-[11.5px] hover:text-[var(--accent)]"
                  title={a.name}
                >
                  <span className="truncate font-medium">{a.name}</span>
                  <span className="truncate text-[10.5px] text-muted">{a.tools.length} calls</span>
                </button>
              </foreignObject>
              {/* agent lifetime */}
              {a.id !== null && end > start && (
                <rect x={x(start)} y={laneY + 3} width={Math.max(2, x(end) - x(start))} height={height - 6} rx={4} fill="var(--series-5)" opacity={0.07} />
              )}
              {a.tools
                .filter((t) => (t.endedAt ?? now) >= t0)
                .map((t) => {
                  const bx = x(Math.max(t.startedAt, t0))
                  const bw = Math.max(3, x(t.endedAt ?? now) - bx - ROW_GAP)
                  const by = laneY + LANE_PAD + (rows.get(t.id) ?? 0) * (ROW_H + ROW_GAP)
                  return (
                    <rect
                      key={t.id}
                      x={bx}
                      y={by}
                      width={bw}
                      height={ROW_H}
                      rx={3}
                      fill={KIND_COLOR[toolKind(t.name)]}
                      stroke={t.status === 'error' ? '#e34948' : hover?.tool.id === t.id ? 'var(--fg)' : 'none'}
                      strokeWidth={t.status === 'error' || hover?.tool.id === t.id ? 2 : 0}
                      className={cn('cursor-pointer', t.status === 'running' && 'animate-soft-pulse')}
                      onMouseEnter={(e) => {
                        const r = ref.current!.getBoundingClientRect()
                        setHover({ tool: t, lane: a.name, x: e.clientX - r.left, y: e.clientY - r.top + ref.current!.scrollTop })
                      }}
                      onClick={() => openAgent(a.key, t.id)}
                    />
                  )
                })}
            </g>
          )
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] shadow-lg"
          style={{ left: Math.min(hover.x + 12, width - 270), top: hover.y + 12 }}
        >
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: KIND_COLOR[toolKind(hover.tool.name)] }} />
            <span className="font-medium">{toolDisplayName(hover.tool.name)}</span>
            <span className={cn('ml-auto tabular-nums', hover.tool.status === 'error' ? 'text-red-500' : 'text-muted')}>
              {hover.tool.status === 'running' ? 'running' : hover.tool.status === 'error' ? 'failed' : formatDuration((hover.tool.endedAt ?? now) - hover.tool.startedAt)}
            </span>
          </div>
          {toolSummary(hover.tool.name, hover.tool.input) && <div className="mt-0.5 truncate">{toolSummary(hover.tool.name, hover.tool.input)}</div>}
          <div className="mt-0.5 truncate text-muted">
            {hover.lane} · at {formatOffset(hover.tool.startedAt - first)}
          </div>
        </div>
      )}
    </div>
  )
}
