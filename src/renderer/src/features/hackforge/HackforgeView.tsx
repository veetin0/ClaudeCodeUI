import { AlertTriangle, CheckCircle2, Circle, CircleDot, Copy, Flame, FolderPlus, OctagonX, Play, ShieldAlert, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { HACKFORGE_PHASES, HACKFORGE_PROFILES, type HackforgeSnapshot, type LoopEntry, type RuleItem } from '@shared/hackforge'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'
import { Markdown } from '../conversation/Markdown'

const INSTALL = 'claude plugin marketplace add ./hackforge-marketplace\nclaude plugin install hackforge@veeti-tools'

/** Live dashboard over a project's .hackforge/ memory: phase, compliance, mock score, loop, rules, plan. */
export function HackforgeView({ session }: { session: SessionState }) {
  const hf = useHackforge(session.cwd)
  const send = useApp((s) => s.send)
  const setForm = useApp((s) => s.setActionForm)
  const setView = useApp((s) => s.setView)
  const run = (prompt: string) => {
    setView('chat')
    void send(prompt)
  }
  const openAction = (id: string) => {
    setView('chat')
    setForm(id)
  }

  if (!hf) return <div className="flex flex-1 items-center justify-center text-[12px] text-muted">Reading HackForge state…</div>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        <Header hf={hf} />
        {!hf.pluginInstalled && <InstallBanner />}
        {!hf.present ? (
          <Empty
            icon={FolderPlus}
            title="This project doesn't use HackForge yet"
            text="Init creates challenge/ for the brief, rules, data and assets, plus hackforge.yaml for the deadline, team and profile."
            action={{ label: 'Init HackForge', onClick: () => run('/hackforge:init') }}
          />
        ) : !hf.initialized ? (
          <Empty
            icon={Play}
            title="Ready for kickoff"
            text="Drop the brief, rules and data into challenge/, set the deadline in challenge/hackforge.yaml, then run the pipeline."
            action={{ label: 'Run HackForge…', onClick: () => openAction('hf-run') }}
          />
        ) : (
          <>
            {hf.loop?.active && session.permissionMode !== 'acceptEdits' && session.permissionMode !== 'bypassPermissions' && (
              <Note icon={ShieldAlert}>
                The improvement loop runs unattended, but every permission prompt pauses it. Switch the permission mode to <b>Accept edits</b> in the prompt box, and allow
                your build and test commands, to keep it going.
              </Note>
            )}
            <PhaseStepper index={hf.state.phaseIndex} />
            <Tiles hf={hf} />
            {hf.loop && <LoopPanel hf={hf} />}
            <div className="grid gap-4 lg:grid-cols-2">
              <RulesPanel hf={hf} />
              <div className="space-y-4">
                <MilestonesPanel hf={hf} />
                {(hf.verify?.fixOrder.length ?? 0) > 0 && (
                  <Panel title="Fix order" sub="from VERIFY.md">
                    <ol className="list-decimal space-y-1 pl-5 text-[12.5px]">
                      {hf.verify!.fixOrder.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ol>
                  </Panel>
                )}
                {hf.directives.length > 0 && (
                  <Panel title="Team directives" sub="DIRECTIVES.md">
                    <ul className="space-y-1 text-[12.5px]">
                      {hf.directives.map((d, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted">{i + 1}.</span>
                          {d}
                        </li>
                      ))}
                    </ul>
                  </Panel>
                )}
              </div>
            </div>
            {hf.decision && (
              <Panel title={hf.decision.title ? `Decision: ${hf.decision.title}` : 'Decision'} sub="DECISION.md">
                <Collapsible>
                  <Markdown text={hf.decision.text.replace(/^#\s+.*\n/, '')} className="text-[12.5px]" />
                </Collapsible>
              </Panel>
            )}
            <div className="text-[11px] text-muted">.hackforge/ · {hf.files.join(' · ')}</div>
          </>
        )}
      </div>
    </div>
  )
}

function useNow(ms = 30_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function timeLeft(deadline: string | undefined, now: number): { text: string; urgent: boolean; past: boolean } | undefined {
  const t = deadline ? Date.parse(deadline) : NaN
  if (!Number.isFinite(t)) return undefined
  const ms = t - now
  const abs = Math.abs(ms)
  const d = Math.floor(abs / 86_400_000)
  const h = Math.floor((abs % 86_400_000) / 3_600_000)
  const m = Math.floor((abs % 3_600_000) / 60_000)
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return { text: ms < 0 ? `${text} ago` : `${text} left`, urgent: ms < 3 * 3_600_000, past: ms < 0 }
}

function Header({ hf }: { hf: HackforgeSnapshot }) {
  const now = useNow()
  const deadline = hf.config.deadline ?? hf.state.deadline
  const left = timeLeft(deadline, now)
  const profile = hf.config.profile ?? hf.state.profile
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Flame className="size-5 text-orange-500" />
        <div>
          <div className="text-[15px] font-semibold">{hf.config.challenge || 'HackForge'}</div>
          <div className="text-[11.5px] text-muted">
            {[hf.config.team && `team of ${hf.config.team}`, hf.config.hours && `${hf.config.hours} h`, hf.state.milestone].filter(Boolean).join(' · ') || 'challenge/ · .hackforge/'}
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3 text-[12px]">
        {left && (
          <span
            title={deadline}
            className={cn('rounded-md px-2 py-1 font-medium tabular-nums', left.past ? 'bg-red-500/10 text-red-600' : left.urgent ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-surface-2')}
          >
            ⏱ {left.text}
          </span>
        )}
        {hf.present && (
          <label className="flex items-center gap-1.5 text-muted" title="profile: in challenge/hackforge.yaml — sets research depth, architects, judges, builders and models">
            Profile
            <select
              value={profile && (HACKFORGE_PROFILES as readonly string[]).includes(profile) ? profile : 'auto'}
              onChange={(e) => void window.harness.hackforgeSetProfile(hf.cwd, e.target.value)}
              className="rounded-md border border-line bg-surface px-1.5 py-0.5 text-fg"
            >
              {HACKFORGE_PROFILES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </div>
  )
}

function InstallBanner() {
  const [copied, setCopied] = useState(false)
  return (
    <Note icon={AlertTriangle}>
      <div>
        The HackForge plugin isn't enabled in your Claude Code settings, so <code>/hackforge:*</code> commands won't be found. From the folder that contains
        hackforge-marketplace, run:
      </div>
      <div className="mt-1.5 flex items-start gap-2">
        <pre className="selectable flex-1 rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px]">{INSTALL}</pre>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(INSTALL)
            setCopied(true)
          }}
          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] hover:bg-surface-2"
        >
          <Copy className="size-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-1 text-muted">Then start a new session here.</div>
    </Note>
  )
}

function Note({ icon: Icon, children }: { icon: typeof Flame; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3 text-[12.5px]">
      <Icon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function Empty({ icon: Icon, title, text, action }: { icon: typeof Flame; title: string; text: string; action: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <Icon className="mb-2 size-6 text-orange-500" />
      <div className="font-semibold">{title}</div>
      <p className="mt-1 max-w-md text-[12.5px] text-muted">{text}</p>
      <button onClick={action.onClick} className="mt-4 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
        {action.label}
      </button>
    </div>
  )
}

function PhaseStepper({ index }: { index: number | undefined }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-line px-3 py-2.5 [scrollbar-width:none]">
      {HACKFORGE_PHASES.map((p, i) => {
        const state = index === undefined ? 'todo' : i < index ? 'done' : i === index ? 'now' : 'todo'
        return (
          <div key={p} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className={cn('h-px w-4', state === 'todo' ? 'bg-line' : 'bg-[var(--accent)]')} />}
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px]',
                state === 'now' ? 'bg-[var(--accent)] font-medium text-white' : state === 'done' ? 'text-fg' : 'text-muted',
              )}
            >
              {state === 'done' ? <CheckCircle2 className="size-3 text-[var(--accent)]" /> : state === 'now' ? <CircleDot className="size-3" /> : <Circle className="size-3" />}
              {p}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Tile({ label, children, sub, tone }: { label: string; children: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'good' ? 'border-emerald-500/40 bg-emerald-500/[0.06]' : tone === 'bad' ? 'border-red-500/40 bg-red-500/[0.05]' : tone === 'warn' ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-line',
      )}
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{children}</div>
      {sub && <div className="text-[11.5px] text-muted">{sub}</div>}
    </div>
  )
}

function Tiles({ hf }: { hf: HackforgeSnapshot }) {
  const v = hf.verify
  const target = hf.loop?.targetScore ?? hf.config.targetScore ?? 9
  const score = v?.mockScore ?? hf.state.latestMockScore
  const failing = v?.checks.filter((c) => !c.ok).length ?? 0
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        label="Compliance"
        tone={!v?.compliance ? undefined : v.compliance === 'PASS' && !hf.verifyStale ? 'good' : v.compliance === 'FAIL' ? 'bad' : 'warn'}
        sub={!v ? 'run Verify' : hf.verifyStale ? 'stale: code changed since VERIFY.md' : failing ? `${failing} check${failing > 1 ? 's' : ''} failing` : `${v.checks.length} checks`}
      >
        {v?.compliance ?? '—'}
      </Tile>
      <Tile label="Mock score" tone={score === undefined ? undefined : score >= target ? 'good' : undefined} sub={`target ${target.toFixed(1)}`}>
        {score !== undefined ? score.toFixed(1) : '—'}
        <span className="text-[13px] font-normal text-muted"> / 10</span>
      </Tile>
      <Tile label="Gate" tone={v?.gate === 'PASS' ? 'good' : v?.gate === 'FAIL' ? 'bad' : undefined} sub="gate.sh">
        {v?.gate ?? '—'}
      </Tile>
      <Tile label="Next" sub={hf.state.milestone}>
        <span className="line-clamp-2 text-[13px] font-medium leading-snug">{hf.state.next ?? '—'}</span>
      </Tile>
    </div>
  )
}

function ScoreChart({ entries, target }: { entries: LoopEntry[]; target: number }) {
  const pts = entries.filter((e) => e.score !== undefined)
  if (pts.length === 0) return <div className="py-6 text-center text-[12px] text-muted">The score chart fills in as loop iterations finish.</div>
  const W = 640
  const H = 150
  const pad = { l: 28, r: 10, t: 10, b: 20 }
  const scores = pts.map((p) => p.score!)
  const lo = Math.max(0, Math.floor(Math.min(...scores, target) - 0.5))
  const hi = Math.min(10, Math.ceil(Math.max(...scores, target) + 0.2))
  const first = pts[0].iteration
  const span = Math.max(1, Math.max(...pts.map((p) => p.iteration)) - first)
  const x = (it: number) => pad.l + ((it - first) / span) * (W - pad.l - pad.r)
  const y = (s: number) => pad.t + (1 - (s - lo) / Math.max(0.1, hi - lo)) * (H - pad.t - pad.b)
  // Best kept score so far: what the loop actually keeps.
  let best: number | undefined
  const bestPath = pts
    .map((p) => {
      if (p.kept !== false) best = Math.max(best ?? -Infinity, p.score!)
      return `${x(p.iteration)},${y(best ?? p.score!)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mock score per loop iteration">
      {[lo, (lo + hi) / 2, hi].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
          <text x={pad.l - 4} y={y(t) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <line x1={pad.l} x2={W - pad.r} y1={y(target)} y2={y(target)} stroke="#10b981" strokeDasharray="4 3" />
      <text x={W - pad.r} y={y(target) - 3} fontSize="9" textAnchor="end" fill="#10b981">
        target {target.toFixed(1)}
      </text>
      <polyline points={bestPath} fill="none" stroke="var(--accent)" strokeWidth={2} />
      {pts.map((p) => (
        <g key={p.iteration}>
          <circle cx={x(p.iteration)} cy={y(p.score!)} r={3.5} fill={p.kept === false ? 'var(--surface)' : 'var(--accent)'} stroke={p.kept === false ? 'var(--muted)' : 'var(--accent)'} strokeWidth={1.5}>
            <title>{`#${p.iteration} ${p.change} — ${p.score} (${p.kept === false ? 'reverted' : 'kept'})`}</title>
          </circle>
          <text x={x(p.iteration)} y={H - 6} fontSize="9" textAnchor="middle" fill="var(--muted)">
            #{p.iteration}
          </text>
        </g>
      ))}
    </svg>
  )
}

function LoopPanel({ hf }: { hf: HackforgeSnapshot }) {
  const loop = hf.loop!
  const [stopping, setStopping] = useState(false)
  const stopPending = hf.stopRequested || stopping
  return (
    <Panel
      title="Improvement loop"
      sub={loop.active ? 'running' : loop.endedReason ? `ended: ${loop.endedReason}` : 'not running'}
      right={
        loop.active && (
          <button
            disabled={stopPending}
            onClick={() => {
              setStopping(true)
              void window.harness.hackforgeStopLoop(hf.cwd)
            }}
            title="Creates .hackforge/STOP_LOOP: the loop finishes its iteration, writes a summary and stops"
            className="flex items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 py-1 text-[12px] text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
          >
            <OctagonX className="size-3.5" /> {stopPending ? 'Stopping after this iteration…' : 'Stop loop'}
          </button>
        )
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
        <Stat label="Iteration" value={`${loop.iteration} / ${loop.maxIterations}`} />
        <Stat label="Best" value={loop.bestScore !== undefined ? loop.bestScore.toFixed(1) : '—'} />
        <Stat label="No-gain streak" value={`${loop.noGainStreak} / ${loop.plateauLimit}`} warn={loop.noGainStreak >= loop.plateauLimit - 1 && loop.active} />
        {loop.reserveMinutes !== undefined && <Stat label="Reserve" value={`${loop.reserveMinutes} min`} />}
        {loop.maxHours !== undefined && <Stat label="Max hours" value={String(loop.maxHours)} />}
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (loop.iteration / Math.max(1, loop.maxIterations)) * 100)}%` }} />
      </div>
      <ScoreChart entries={loop.entries} target={loop.targetScore} />
      {loop.entries.length > 0 && (
        <div className="mt-2 max-h-40 overflow-y-auto text-[12px]">
          {[...loop.entries].reverse().map((e) => (
            <div key={e.iteration} className="flex items-center gap-2 border-t border-line py-1">
              <span className="w-8 tabular-nums text-muted">#{e.iteration}</span>
              <span className="min-w-0 flex-1 truncate" title={e.change}>
                {e.change}
              </span>
              {e.compliance && <span className={cn('text-[11px]', /pass/i.test(e.compliance) ? 'text-emerald-600' : 'text-red-500')}>{e.compliance}</span>}
              <span className="w-10 text-right tabular-nums">{e.score?.toFixed(1) ?? '—'}</span>
              <span className={cn('w-16 text-right text-[11px]', e.kept === false ? 'text-muted' : 'text-emerald-600')}>{e.kept === false ? 'reverted' : e.kept ? 'kept' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span>
      <span className="text-muted">{label} </span>
      <span className={cn('font-medium tabular-nums', warn && 'text-amber-600 dark:text-amber-400')}>{value}</span>
    </span>
  )
}

function RulesPanel({ hf }: { hf: HackforgeSnapshot }) {
  const checks = new Map(hf.verify?.checks.map((c) => [c.id, c]))
  const scores = new Map(hf.verify?.criterionScores.map((c) => [c.id, c.score]))
  const groups: [string, RuleItem['kind'], string][] = [
    ['Hard rules', 'rule', 'break one = disqualified'],
    ['Deliverables', 'deliverable', ''],
    ['Judging criteria', 'criterion', ''],
  ]
  if (hf.rules.length === 0) return <Panel title="Rules & judging" sub="RULES.md">{<div className="text-[12px] text-muted">Kickoff writes the hard rules, deliverables and judging criteria here.</div>}</Panel>
  return (
    <Panel title="Rules & judging" sub="RULES.md">
      <div className="space-y-3">
        {groups.map(([title, kind, note]) => {
          const items = hf.rules.filter((r) => r.kind === kind)
          if (!items.length) return null
          return (
            <div key={kind}>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {title} {note && <span className="font-normal normal-case">· {note}</span>}
              </div>
              {items.map((r) => {
                const c = checks.get(r.id)
                const s = scores.get(r.id)
                return (
                  <div key={r.id} className="flex items-start gap-2 py-1 text-[12.5px]" title={r.detail}>
                    <span className="w-6 shrink-0 font-mono text-[11px] text-muted">{r.id}</span>
                    {kind !== 'criterion' &&
                      (c ? c.ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> : <XCircle className="mt-0.5 size-3.5 shrink-0 text-red-500" /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted" />)}
                    <div className="min-w-0 flex-1">
                      <div>{r.text}</div>
                      {(c?.note || r.detail) && <div className="truncate text-[11px] text-muted">{c && !c.ok ? c.note : r.detail}</div>}
                    </div>
                    {kind === 'criterion' && (
                      <div className="flex w-28 shrink-0 items-center gap-1.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" title={s !== undefined ? `mock score ${s}/10` : undefined}>
                          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${((s ?? 0) / 10) * 100}%` }} />
                        </div>
                        <span className="w-7 text-right tabular-nums text-[11px]">{s?.toFixed(1) ?? '—'}</span>
                        {r.weight !== undefined && <span className="w-8 text-right text-[11px] text-muted">{Math.round(r.weight * 100)}%</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}

function MilestonesPanel({ hf }: { hf: HackforgeSnapshot }) {
  const done = hf.milestones.filter((m) => m.status === 'done').length
  return (
    <Panel title="Milestones" sub={hf.milestones.length ? `${done} / ${hf.milestones.length} done` : 'PLAN.md'}>
      {hf.milestones.length === 0 ? (
        <div className="text-[12px] text-muted">Build writes the vertical-slice plan here.</div>
      ) : (
        hf.milestones.map((m) => (
          <div key={m.id} className="flex items-center gap-2 py-1 text-[12.5px]">
            {m.status === 'done' ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
            ) : m.status === 'doing' ? (
              <CircleDot className="size-3.5 shrink-0 animate-soft-pulse text-[var(--accent)]" />
            ) : (
              <Circle className="size-3.5 shrink-0 text-muted" />
            )}
            <span className="w-6 shrink-0 font-mono text-[11px] text-muted">{m.id}</span>
            <span className={cn('min-w-0 flex-1 truncate', m.status === 'done' && 'text-muted line-through decoration-muted/50')}>{m.goal}</span>
            {m.covers && <span className="shrink-0 text-[11px] text-muted">{m.covers}</span>}
          </div>
        ))
      )}
    </Panel>
  )
}

function Panel({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12.5px] font-semibold">{title}</h3>
        {sub && <span className="text-[11px] text-muted">{sub}</span>}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  )
}

function Collapsible({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className={cn('relative', !open && 'max-h-28 overflow-hidden [mask-image:linear-gradient(black_60%,transparent)]')}>{children}</div>
      <button onClick={() => setOpen(!open)} className="mt-1 text-[11.5px] text-[var(--accent)] hover:underline">
        {open ? 'Show less' : 'Show all'}
      </button>
    </div>
  )
}
