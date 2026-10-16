import { BarChart3, Leaf, Table2, Users, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { isOnline, type TeamState } from '@shared/team'
import { FAMILIES, FAMILY_LABEL, sumFamilies, type DayUsage, type ModelFamily, type UsageHistory } from '@shared/usageHistory'
import { basename, cn, formatCost, formatTokens } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useTeamState } from '@/stores/team'

/** Fixed: the color follows the model family, never its rank (validated palette slots 1–4). */
const COLOR: Record<ModelFamily, string> = {
  sonnet: 'var(--series-1)',
  opus: 'var(--series-2)',
  haiku: 'var(--series-3)',
  other: 'var(--series-4)',
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const dayLabel = (day: string, short = false) => {
  const d = new Date(`${day}T12:00:00`)
  return d.toLocaleDateString([], short ? { day: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Usage history: tokens per day by model, plan usage over time, the saver's work, the team today. */
export function UsageView() {
  const [days, setDays] = useState(14)
  const [data, setData] = useState<UsageHistory | null>(null)
  const [table, setTable] = useState(false)
  useEffect(() => {
    let alive = true
    const load = () => void window.harness.usageHistory(days).then((d) => alive && setData(d))
    load()
    const t = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [days])
  const team = useTeamState()
  const close = () => useApp.getState().setUsageOpen(false)
  const today = data?.days.at(-1)
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        <header className="flex items-center gap-2">
          <BarChart3 className="size-5 text-[var(--accent)]" />
          <h1 className="text-[18px] font-semibold">Usage</h1>
          <span className="text-[12px] text-muted">on this laptop</span>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-black/[0.05] p-0.5 text-[12px] dark:bg-white/[0.07]">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn('rounded-md px-2.5 py-1', days === d ? 'bg-surface font-medium shadow-sm' : 'text-muted hover:text-fg')}
              >
                {d} days
              </button>
            ))}
          </div>
          <button onClick={close} title="Close (Esc)" className="rounded p-1 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
            <X className="size-4" />
          </button>
        </header>

        {!data ? (
          <div className="text-[12px] text-muted">Loading…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Today" value={formatTokens(today ? sumFamilies(today.tokens) : 0)} sub="new tokens (input + output)" />
              <Tile
                label={`Last ${days} days`}
                value={formatTokens(sumFamilies(data.totals.tokens))}
                sub={
                  FAMILIES.filter((f) => data.totals.tokens[f])
                    .map((f) => `${FAMILY_LABEL[f]} ${formatTokens(data.totals.tokens[f])}`)
                    .join(' · ') || 'nothing yet'
                }
              />
              <Tile label="Cache re-reads" value={formatTokens(data.totals.cacheRead)} sub="the conversation re-read each step (cheaper)" />
              <Tile label="API-equivalent cost" value={formatCost(data.totals.costUsd)} sub="Claude Code’s estimate, not your plan’s bill" />
            </div>

            <section className="rounded-2xl border border-line p-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <h2 className="text-[13px] font-semibold">Tokens per day, by model</h2>
                <div className="flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
                  {FAMILIES.map((f) => (
                    <span key={f} className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm" style={{ background: COLOR[f] }} /> {FAMILY_LABEL[f]}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setTable(!table)}
                  className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
                >
                  {table ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />} {table ? 'Chart' : 'Table'}
                </button>
              </div>
              {table ? <DayTable days={data.days} /> : <DayBars days={data.days} />}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <PlanLine samples={data.samples} />
              <SaverCard s={data.saver} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <TopSessions list={data.topSessions} />
              {team?.config && <TeamToday team={team} />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function TeamToday({ team }: { team: TeamState }) {
  const now = Date.now()
  const members = (team?.members ?? []).filter((m) => m.today || isOnline(m, now))
  const max = Math.max(1, ...members.map((m) => m.today?.tokens ?? 0))
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Users className="size-3.5" /> Team today
      </h2>
      <div className="space-y-2">
        {members.map((m) => {
          const t = m.today
          const five = m.usage.fiveHour && (!m.usage.fiveHour.resetsAt || m.usage.fiveHour.resetsAt > now) ? Math.round(m.usage.fiveHour.pct) : undefined
          return (
            <div key={m.id} className="text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted">{t ? `${formatTokens(t.tokens)} tokens` : 'no reading yet'}</span>
                <span className="ml-auto tabular-nums text-muted">{m.usage.source === 'api-key' ? 'API key' : five !== undefined ? `5 h ${five}%` : ''}</span>
              </div>
              {t && t.tokens > 0 && (
                <div className="mt-1 flex h-2 gap-[2px] overflow-hidden" style={{ width: `${Math.max(4, (t.tokens / max) * 100)}%` }}>
                  {(['Sonnet', 'Opus', 'Haiku', 'Other'] as const).map((k, i) =>
                    t.byModel[k] ? (
                      <div
                        key={k}
                        title={`${k}: ${formatTokens(t.byModel[k])}`}
                        className="h-full first:rounded-l last:rounded-r"
                        style={{
                          flex: t.byModel[k],
                          background: COLOR[FAMILIES[i]],
                        }}
                      />
                    ) : null,
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line p-3">
      <div className="text-[11.5px] text-muted">{label}</div>
      <div className="mt-0.5 text-[22px] font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted" title={sub}>
        {sub}
      </div>
    </div>
  )
}

/** Stacked bars: one per day, a segment per model family, hover for the numbers. */
function DayBars({ days }: { days: DayUsage[] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = 200
  const pad = { l: 44, r: 8, t: 10, b: 22 }
  const max = Math.max(1, ...days.map((d) => sumFamilies(d.tokens)))
  const plotW = Math.max(0, width - pad.l - pad.r)
  const band = days.length ? plotW / days.length : 0
  const bar = Math.max(4, Math.min(28, band * 0.6))
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const h = hover !== null ? days[hover] : null
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Tokens per day by model">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
              <text x={pad.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted)">
                {formatTokens(Math.round(t))}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const cx = pad.l + band * i + band / 2
            let acc = 0
            const segs = FAMILIES.filter((f) => d.tokens[f] > 0)
            return (
              <g key={d.day}>
                {hover === i && <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="var(--grid)" />}
                {segs.map((f, j) => {
                  const y0 = y(acc)
                  acc += d.tokens[f]
                  const y1 = y(acc)
                  const top = j === segs.length - 1
                  // A 2px surface gap between stacked segments; the top one gets rounded ends.
                  const hgt = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0))
                  const x = cx - bar / 2
                  return top ? (
                    <path key={f} d={roundedTop(x, y1, bar, hgt, Math.min(4, hgt, bar / 2))} fill={COLOR[f]} />
                  ) : (
                    <rect key={f} x={x} y={y1} width={bar} height={hgt} fill={COLOR[f]} />
                  )
                })}
                {(band >= 22 || i % Math.ceil(22 / Math.max(1, band)) === 0) && (
                  <text x={cx} y={H - 6} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
                    {dayLabel(d.day, true)}
                  </text>
                )}
                <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            )
          })}
        </svg>
      )}
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] rounded-lg border border-line bg-surface px-2.5 py-2 text-[11.5px] shadow-lg"
          style={{
            left: Math.min(Math.max(0, pad.l + band * hover + band / 2 - 75), Math.max(0, width - 160)),
            top: 4,
          }}
        >
          <div className="mb-1 font-medium">{dayLabel(h.day)}</div>
          {FAMILIES.map((f) => (
            <div key={f} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: COLOR[f] }} />
              <span className="text-muted">{FAMILY_LABEL[f]}</span>
              <span className="ml-auto tabular-nums">{formatTokens(h.tokens[f])}</span>
            </div>
          ))}
          <div className="mt-1 flex border-t border-line pt-1">
            <span className="text-muted">Total</span>
            <span className="ml-auto font-medium tabular-nums">{formatTokens(sumFamilies(h.tokens))}</span>
          </div>
          <div className="flex text-muted">
            <span>Cache re-reads</span>
            <span className="ml-auto tabular-nums">{formatTokens(h.cacheRead)}</span>
          </div>
        </div>
      )}
      {days.every((d) => sumFamilies(d.tokens) === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted">No usage recorded in this period yet.</div>
      )}
    </div>
  )
}

/** A rectangle with its top corners rounded (the data end of a bar). */
function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`
}

function DayTable({ days }: { days: DayUsage[] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-[11.5px] tabular-nums">
        <thead className="sticky top-0 bg-surface text-muted">
          <tr>
            <th className="py-1 text-left font-medium">Day</th>
            {FAMILIES.map((f) => (
              <th key={f} className="py-1 text-right font-medium">
                {FAMILY_LABEL[f]}
              </th>
            ))}
            <th className="py-1 text-right font-medium">Total</th>
            <th className="py-1 text-right font-medium">Cache re-reads</th>
            <th className="py-1 text-right font-medium">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.day} className="border-t border-line">
              <td className="py-1">{dayLabel(d.day)}</td>
              {FAMILIES.map((f) => (
                <td key={f} className="py-1 text-right">
                  {d.tokens[f] ? formatTokens(d.tokens[f]) : '–'}
                </td>
              ))}
              <td className="py-1 text-right font-medium">{formatTokens(sumFamilies(d.tokens))}</td>
              <td className="py-1 text-right text-muted">{formatTokens(d.cacheRead)}</td>
              <td className="py-1 text-right text-muted">{formatCost(d.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The 5-hour window over the last two days: how fast the plan is being used. */
function PlanLine({ samples }: { samples: UsageHistory['samples'] }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = samples.filter((s) => s.fivePct !== undefined)
  const H = 150
  const pad = { l: 34, r: 10, t: 10, b: 20 }
  const now = Date.now()
  const t0 = now - 48 * 3600_000
  const x = (t: number) => pad.l + ((t - t0) / (now - t0)) * Math.max(0, width - pad.l - pad.r)
  const y = (p: number) => pad.t + (H - pad.t - pad.b) * (1 - p / 100)
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.fivePct!).toFixed(1)}`).join(' ')
  const h = hover !== null ? pts[hover] : null
  const latestWeek = [...samples].reverse().find((s) => s.sevenPct !== undefined)?.sevenPct
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-1 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">5-hour window used, last 48 h</h2>
        {latestWeek !== undefined && <span className="ml-auto text-[11.5px] text-muted">week: {Math.round(latestWeek)}%</span>}
      </div>
      <div
        ref={ref}
        className="relative"
        onMouseMove={(e) => {
          if (!pts.length) return
          const rx = e.clientX - e.currentTarget.getBoundingClientRect().left
          let best = 0
          for (let i = 1; i < pts.length; i++) if (Math.abs(x(pts[i].ts) - rx) < Math.abs(x(pts[best].ts) - rx)) best = i
          setHover(best)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {width > 0 && pts.length > 0 && (
          <svg width={width} height={H} role="img" aria-label="Five-hour plan usage over the last 48 hours">
            {[0, 50, 100].map((p) => (
              <g key={p}>
                <line x1={pad.l} x2={width - pad.r} y1={y(p)} y2={y(p)} stroke="var(--grid)" />
                <text x={pad.l - 6} y={y(p) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--muted)">
                  {p}%
                </text>
              </g>
            ))}
            {[-48, -24, 0].map((hrs) => (
              <text
                key={hrs}
                x={x(now + hrs * 3600_000)}
                y={H - 4}
                textAnchor={hrs === -48 ? 'start' : hrs === 0 ? 'end' : 'middle'}
                fontSize={10.5}
                fill="var(--muted)"
              >
                {hrs === 0 ? 'now' : `${-hrs} h ago`}
              </text>
            ))}
            {pts.length > 1 && <path d={path} fill="none" stroke="var(--series-7)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {pts.length === 1 && <circle cx={x(pts[0].ts)} cy={y(pts[0].fivePct!)} r={4} fill="var(--series-7)" />}
            {h && (
              <g>
                <line x1={x(h.ts)} x2={x(h.ts)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="2 3" />
                <circle cx={x(h.ts)} cy={y(h.fivePct!)} r={4} fill="var(--series-7)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {h && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-line bg-surface px-2 py-1 text-[11.5px] shadow"
            style={{
              left: Math.min(Math.max(0, x(h.ts) - 50), Math.max(0, width - 110)),
            }}
          >
            {new Date(h.ts).toLocaleString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · <b className="tabular-nums">{Math.round(h.fivePct!)}%</b>
          </div>
        )}
        {!pts.length && (
          <div className="flex items-center justify-center px-6 text-center text-[12px] text-muted" style={{ height: H }}>
            Plan readings appear once sessions run on a Claude plan (not an API key).
          </div>
        )}
      </div>
    </section>
  )
}

function SaverCard({ s }: { s: UsageHistory['saver'] }) {
  const turns = s.sonnetTurns + s.opusTurns
  const share = turns ? Math.round((s.sonnetTurns / turns) * 100) : 0
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <Leaf className="size-3.5 text-emerald-500" /> What the Usage saver did
      </h2>
      {turns || s.compactions || s.skipped ? (
        <div className="space-y-2 text-[12px]">
          {turns > 0 && (
            <div>
              <div className="flex">
                <span>
                  {s.sonnetTurns} of {turns} Auto turns on Sonnet
                </span>
                <span className="ml-auto tabular-nums text-muted">{share}%</span>
              </div>
              <div className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded">
                {s.sonnetTurns > 0 && <div style={{ flex: s.sonnetTurns, background: COLOR.sonnet }} className="h-full" title={`Sonnet: ${s.sonnetTurns}`} />}
                {s.opusTurns > 0 && <div style={{ flex: s.opusTurns, background: COLOR.opus }} className="h-full" title={`Opus: ${s.opusTurns}`} />}
              </div>
              {s.takeovers > 0 && <div className="mt-1 text-[11px] text-muted">Opus took over mid-task {s.takeovers}×</div>}
            </div>
          )}
          <div className="flex">
            <span>Compactions between tasks</span>
            <span className="ml-auto tabular-nums text-muted">
              {s.compactions}× · {formatTokens(s.compactedTokens)} tokens trimmed
            </span>
          </div>
          <div className="flex">
            <span>Generated files skipped</span>
            <span className="ml-auto tabular-nums text-muted">
              {s.skipped} · ~{formatTokens(s.skippedTokens)} tokens
            </span>
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-muted">Nothing yet: sessions on Auto show their model choices, compactions and skipped files here.</div>
      )}
    </section>
  )
}

function TopSessions({ list }: { list: UsageHistory['topSessions'] }) {
  const open = (id: string) => {
    const app = useApp.getState()
    app.setUsageOpen(false)
    if (app.sessions[id]) app.select(id)
    else void app.openSaved(id)
  }
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 text-[13px] font-semibold">Heaviest sessions</h2>
      {list.length === 0 ? (
        <div className="text-[12px] text-muted">None in this period.</div>
      ) : (
        <div className="space-y-1">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => open(s.id)}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 truncate">
                {s.title || 'Untitled'} <span className="text-muted">· {basename(s.cwd)}</span>
              </span>
              <span className="shrink-0 tabular-nums">{formatTokens(s.tokens)}</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted">{formatCost(s.costUsd)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
