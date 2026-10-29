import { CalendarClock, Check, ChevronRight, ExternalLink, FolderOpen, FolderPlus, MapPin, MessageSquare, Moon, Square, SquareCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  checklistDue,
  currentChecklistGroup,
  eventClock,
  formatInZone,
  formatSpan,
  zonedTime,
  zoneLabel,
  type ChecklistGroup,
  type EventState,
  type TimedMilestone,
} from '@shared/event'
import { basename, cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useEvent, useNow } from '@/stores/event'
import { sessionIn } from '@/lib/projects'
import { TeamPanel } from './TeamPanel'
import { Segmented } from '@/ui/Segmented'

/** Hackathon › Schedule: the clock, the team, the weekend timeline, project setup, checklists, partners. */
export function EventSchedule({ state }: { state: EventState }) {
  const now = useNow(1000)
  const { config } = state
  const clock = eventClock(config, now)
  return (
    <>
        <header className="flex flex-wrap items-start gap-x-6 gap-y-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-5 text-accent-ink" />
              <h1 className="text-[18px] font-semibold">{config.name}</h1>
              {config.theme && <span className="rounded-sm bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-ink">{config.theme}</span>}
            </div>
            {config.tagline && <div className="mt-0.5 text-[13px] italic text-muted">“{config.tagline}”</div>}
            {config.location && (
              <div className="mt-1 flex items-center gap-1 text-[12px] text-muted" title={config.address}>
                <MapPin className="size-3" /> {config.location}
              </div>
            )}
          </div>
          <div className="ml-auto text-right text-[12px] text-muted">
            <div className="text-[13px] font-medium num text-fg">
              {formatInZone(now, config.timezone, { weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })}
            </div>
            {config.timezone.split('/').at(-1)?.replace('_', ' ')} · {zoneLabel(now, config.timezone)}
            {clock.stage === 'before' && zoneLabel(now, config.timezone) !== zoneLabel(clock.start, config.timezone) && (
              <div title="Daylight saving changes before the event; all event times here already account for it">
                {zoneLabel(clock.start, config.timezone)} during the event
              </div>
            )}
          </div>
        </header>

        {config.invalidTimezone && (
          <div className="selectable rounded-lg border border-warn/50 bg-warn/[0.08] px-3 py-2 text-[12px]">
            <code>challenge/event.yaml</code> names the time zone “{config.invalidTimezone}”, which this computer doesn't know, so all times are shown in UTC. Use an IANA
            name such as <code>Europe/Helsinki</code>.
          </div>
        )}
        <Countdown state={state} now={now} />
        <TeamPanel timezone={config.timezone} now={now} suggestedNames={config.team} />
        <Weekend state={state} now={now} />
        <ProjectCard state={state} />
        <Checklists state={state} now={now} />
        <Partners state={state} />
        <p className="pb-2 text-[11px] text-muted">
          Settings come from {state.source === 'project' ? <code>challenge/event.yaml</code> : 'the built-in preset'}. Checklist ticks are saved to{' '}
          <code>challenge/event-checklist.json</code>: commit and pull it so the whole team sees the same progress.
        </p>
    </>
  )
}

function Countdown({ state, now }: { state: EventState; now: number }) {
  const { config } = state
  const clock = eventClock(config, now)
  const { done } = state.progress
  const prep = config.checklist.filter((c) => c.group === 'prep')
  const prepDone = prep.filter((c) => done[c.id]).length
  const nextPrep = prep.find((c) => !done[c.id])
  const big =
    clock.stage === 'before'
      ? { label: 'Doors open in', at: clock.start, tone: 'normal' as const }
      : clock.stage === 'during' && clock.nextDeadline
        ? {
            label: `${clock.nextDeadline.label} in`,
            at: clock.nextDeadline.t,
            tone: clock.nextDeadline.t - now < 3_600_000 ? ('urgent' as const) : clock.nextDeadline.t - now < 3 * 3_600_000 ? ('warn' as const) : ('normal' as const),
          }
        : undefined
  return (
    <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
      <div
        className={cn(
          'rounded-2xl border p-4',
          big?.tone === 'urgent' ? 'border-danger/50 bg-danger/[0.06]' : big?.tone === 'warn' ? 'border-warn/50 bg-warn/[0.06]' : 'border-line bg-surface-2/40',
        )}
      >
        {big ? (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{big.label}</div>
            <div className={cn('mt-1 text-[34px] font-semibold leading-none num', big.tone === 'urgent' && 'text-danger-ink')}>{formatSpan(big.at - now)}</div>
            <div className="mt-1.5 text-[12px] text-muted">{formatInZone(big.at, config.timezone, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</div>
          </>
        ) : clock.stage === 'after' ? (
          <div className="text-[20px] font-semibold">The event is over. 🎉</div>
        ) : (
          <div className="text-[20px] font-semibold">All deadlines passed — judging and finals</div>
        )}
        {clock.stage === 'during' && clock.next && clock.next.id !== clock.nextDeadline?.id && (
          <div className="mt-2 text-[13px]">
            <span className="text-muted">Next: </span>
            <span className="font-medium">{clock.next.label}</span>
            <span className="num text-muted"> · in {formatSpan(clock.next.t - now)}</span>
          </div>
        )}
        {clock.ongoing.map((m) => (
          <div key={m.id} className="mt-1 flex items-center gap-1.5 text-[12px] text-(--series-7)">
            <Moon className="size-3.5" /> {m.label} until {formatInZone(m.tEnd!, config.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
          </div>
        ))}
      </div>
      <Tile label="Preparation" value={`${prepDone} / ${prep.length}`} sub={nextPrep ? `Next: ${nextPrep.label}` : 'All prep done'} />
      <Tile
        label="Build time"
        value={(() => {
          const opening = clock.milestones.find((m) => m.id === 'opening')
          const final = clock.milestones.find((m) => m.id === 'final')
          return opening && final ? `${Math.round((final.t - opening.t) / 3_600_000)} h` : '—'
        })()}
        sub="opening → final submission"
      />
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-[22px] font-semibold num">{value}</div>
      {sub && <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

/** The event weekend on one axis: nights shaded, deadlines red, plan dots, sleep shifts, now. */
function Weekend({ state, now }: { state: EventState; now: number }) {
  const { config } = state
  const clock = eventClock(config, now)
  const ms = clock.milestones
  const t0 = clock.start - 3_600_000
  const t1 = clock.end + 1_800_000
  const pct = (t: number) => `${((Math.min(Math.max(t, t0), t1) - t0) / (t1 - t0)) * 100}%`
  const tz = config.timezone

  // Hour ticks every 6 h on the local clock, and night bands 22:00–07:00.
  const { ticks, nights } = useMemo(() => {
    const ticks: number[] = []
    const nights: [number, number][] = []
    const day0 = formatInZone(t0, tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')
    for (let d = -1; d < 5; d++) {
      const base = zonedTime(`${day0} 00:00`, tz) + d * 86_400_000
      const date = formatInZone(base + 12 * 3_600_000, tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-')
      for (const h of [0, 6, 12, 18]) ticks.push(zonedTime(`${date} ${String(h).padStart(2, '0')}:00`, tz))
      nights.push([zonedTime(`${date} 22:00`, tz), zonedTime(`${date} 07:00`, tz) + 86_400_000])
    }
    return { ticks: ticks.filter((t) => t > t0 && t < t1), nights }
  }, [t0, t1, tz])

  const next = clock.next
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[13px] font-semibold">The weekend</h2>
        <span className="text-[11px] text-muted">{zoneLabel(clock.start, tz)} · hover a marker for details</span>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted">
          <Legend className="bg-danger" label="Deadline" />
          <Legend className="bg-fg/50" label="Official" />
          <Legend className="bg-accent" label="Our plan" />
          <Legend className="bg-(--series-7)/60" label="Sleep" />
        </span>
      </div>
      <div className="relative h-[92px] select-none">
        {nights.map(([a, b]) => (
          <div key={a} className="absolute inset-y-0 bg-(--series-7)/[0.05]" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />
        ))}
        {ticks.map((t) => (
          <div key={t} className="absolute inset-y-0 border-l border-[var(--grid)]" style={{ left: pct(t) }}>
            <span className="absolute -bottom-0.5 left-1 text-[12px] num text-muted">
              {formatInZone(t, tz, { hour: '2-digit', hourCycle: 'h23' }) === '00' ? formatInZone(t, tz, { weekday: 'short' }) : formatInZone(t, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}
            </span>
          </div>
        ))}
        {/* lane 1: official + deadlines */}
        {ms
          .filter((m) => m.kind === 'official' || m.kind === 'deadline')
          .map((m) => (
            <Marker key={m.id} m={m} tz={tz} left={pct(m.t)} top={6} className={m.kind === 'deadline' ? 'h-5 w-1 bg-danger' : 'h-3.5 w-0.5 bg-fg/50'} label={m.kind === 'deadline' ? m.label : undefined} />
          ))}
        {/* lane 2: plan */}
        {ms
          .filter((m) => m.kind === 'plan')
          .map((m) =>
            m.tEnd ? (
              <div key={m.id} title={tip(m, tz)} className="absolute top-[40px] h-2 rounded-full bg-accent/40" style={{ left: pct(m.t), width: `calc(${pct(m.tEnd)} - ${pct(m.t)})` }} />
            ) : (
              <Marker key={m.id} m={m} tz={tz} left={pct(m.t)} top={38} className={cn('size-2.5 rounded-[2px] bg-accent', next?.id === m.id && 'ring-4 ring-accent-ink/25')} />
            ),
          )}
        {/* lane 3: sleep */}
        {ms
          .filter((m) => m.kind === 'sleep' && m.tEnd)
          .map((m) => (
            <div key={m.id} title={tip(m, tz)} className="absolute top-[58px] flex h-3 items-center overflow-hidden rounded bg-(--series-7)/40 px-1 text-[8.5px] text-white" style={{ left: pct(m.t), width: `calc(${pct(m.tEnd!)} - ${pct(m.t)})` }}>
              {m.label.replace('Sleep: ', '')}
            </div>
          ))}
        {now > t0 && now < t1 && (
          <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: pct(now) }}>
            <span className="absolute -top-1 left-1 rounded bg-accent px-1 text-[9px] font-semibold text-white">now</span>
          </div>
        )}
      </div>
      <Agenda state={state} now={now} />
    </section>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('size-2 rounded-sm', className)} />
      {label}
    </span>
  )
}

const tip = (m: TimedMilestone, tz: string) =>
  `${m.label}\n${formatInZone(m.t, tz)}${m.tEnd ? `–${formatInZone(m.tEnd, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}` : ''}${m.note ? `\n${m.note}` : ''}`

function Marker({ m, tz, left, top, className, label }: { m: TimedMilestone; tz: string; left: string; top: number; className: string; label?: string }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left, top }} title={tip(m, tz)}>
      <div className={className} />
      {label && <div className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-danger-ink">{label.split(' ')[0]}</div>}
    </div>
  )
}

function Agenda({ state, now }: { state: EventState; now: number }) {
  const { config } = state
  const clock = eventClock(config, now)
  const tz = config.timezone
  const days = new Map<string, TimedMilestone[]>()
  for (const m of clock.milestones) {
    const day = formatInZone(m.t, tz, { weekday: 'long', day: 'numeric', month: 'short' })
    days.set(day, [...(days.get(day) ?? []), m])
  }
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {[...days].map(([day, items]) => (
        <div key={day}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{day}</div>
          {items.map((m) => {
            const past = (m.tEnd ?? m.t) < now
            const isNext = clock.next?.id === m.id
            return (
              <div key={m.id} title={m.note} className={cn('flex items-start gap-2 rounded px-1 py-0.5 text-[12px]', past && 'opacity-45', isNext && 'bg-accent/10')}>
                <span className="w-10 shrink-0 num text-muted">{formatInZone(m.t, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>
                <span
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-[2px]',
                    m.kind === 'deadline' ? 'bg-danger' : m.kind === 'official' ? 'bg-fg/50' : m.kind === 'sleep' ? 'bg-(--series-7)/60' : 'bg-accent',
                  )}
                />
                <span className={cn('min-w-0 flex-1', m.kind === 'deadline' && 'font-semibold', m.kind === 'sleep' && 'text-muted')}>
                  {m.label}
                  {m.tEnd && <span className="text-muted"> → {formatInZone(m.tEnd, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</span>}
                </span>
                {isNext && <span className="shrink-0 text-[12px] num text-accent-ink">in {formatSpan(m.t - now)}</span>}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ProjectCard({ state }: { state: EventState }) {
  const { setupProject, linkExisting } = useEvent()
  const dir = state.projectDir
  if (!dir) {
    return (
      <section className="rounded-2xl border border-dashed border-accent-ink/50 p-4">
        <div className="flex items-start gap-3">
          <FolderPlus className="mt-0.5 size-5 shrink-0 text-accent-ink" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold">Set up the team's event project</h2>
            <p className="mt-1 text-[12px] text-muted">
              Creates <code>challenge/</code> with this event's config, the event brief and a strategy directive for HackForge, and HackForge settings for the
              event (40 h, team of 4, final deadline, the loop freezing 4 h before it, cheaper models for builders and stronger ones for the architect and
              judges). Make the folder a git repo and share it, so all four laptops work on the same project.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void setupProject()} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
                <FolderPlus className="size-3.5" /> Create or pick a folder…
              </button>
              <button onClick={() => void linkExisting()} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2">
                <FolderOpen className="size-3.5" /> Link an existing event project…
              </button>
            </div>
          </div>
        </div>
      </section>
    )
  }
  return (
    <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-4">
      <FolderOpen className="size-5 shrink-0 text-accent-ink" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{basename(dir)}</div>
        <div className="truncate text-[12px] text-muted" title={dir}>
          {dir}
          {state.projectReady ? ' · set up for the event' : ' · not set up for the event yet'}
        </div>
      </div>
      {!state.projectReady && (
        <button onClick={() => void setupProject(dir)} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
          <FolderPlus className="size-3.5" /> Apply {state.config.name} setup
        </button>
      )}
      <button onClick={() => void sessionIn(dir)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2">
        <MessageSquare className="size-3.5" /> Open in a session
      </button>
    </section>
  )
}

const GROUP_TAB: Record<ChecklistGroup, string> = { prep: 'Preparation', logistics: 'Event day', preliminary: 'Preliminary', final: 'Final' }

/**
 * The checklists as one card: the group that matters now (the open item due soonest), its open
 * items, and the done ones folded away. The other groups are a tab away.
 */
function Checklists({ state, now }: { state: EventState; now: number }) {
  const update = useEvent((s) => s.update)
  const [picked, setPicked] = useState<ChecklistGroup | null>(null)
  const [showDone, setShowDone] = useState(false)
  const all = state.config.checklist
  if (!all.length) return null
  const groups = (Object.keys(GROUP_TAB) as ChecklistGroup[]).filter((g) => all.some((c) => c.group === g))
  const group = picked ?? currentChecklistGroup(state.config, state.progress)
  const items = all.filter((c) => c.group === group)
  const isDone = (id: string) => !!state.progress.done[id]
  const open = items.filter((c) => !isDone(c.id))
  const done = items.filter((c) => isDone(c.id))
  const tz = state.config.timezone
  const linked = !!state.projectDir
  const totalDone = all.filter((c) => isDone(c.id)).length
  const row = (c: (typeof items)[number]) => {
    const ticked = isDone(c.id)
    const due = checklistDue(c, tz)
    const overdue = !ticked && due !== undefined && now > due
    const Icon = ticked ? SquareCheck : Square
    return (
      <button
        key={c.id}
        disabled={!linked}
        onClick={() => void update({ done: { [c.id]: !ticked } })}
        title={linked ? c.note : 'Set up or link the event project to tick items (they are shared with the team through git)'}
        className="flex w-full items-start gap-2 rounded px-1 py-1 text-left text-[13px] hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <Icon className={cn('mt-0.5 size-3.5 shrink-0', ticked ? 'text-ok-ink' : 'text-muted')} />
        <span className={cn('min-w-0 flex-1', ticked && 'text-muted line-through decoration-muted/50')}>
          {c.label}
          {c.note && !ticked && <span className="block text-[11px] text-muted">{c.note}</span>}
        </span>
        {due !== undefined && (
          <span className={cn('shrink-0 text-[12px] num', overdue ? 'font-medium text-danger-ink' : 'text-muted')}>
            {/\d\d:\d\d/.test(c.due!)
              ? formatInZone(due, tz, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
              : formatInZone(due, tz, { day: 'numeric', month: 'short' })}
          </span>
        )}
      </button>
    )
  }
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-[13px] font-semibold">Checklists</h2>
        <span className="text-[12px] num text-muted">
          {totalDone} / {all.length} done
        </span>
        <Segmented
          className="ml-auto"
          label="Checklist"
          value={group}
          onChange={(g) => {
            setPicked(g)
            setShowDone(false)
          }}
          options={groups.map((g) => ({ id: g, label: GROUP_TAB[g], badge: all.filter((c) => c.group === g && !isDone(c.id)).length || undefined }))}
        />
      </div>
      {open.length ? open.map(row) : <div className="px-1 py-2 text-[13px] text-ok-ink">All done here.</div>}
      {done.length > 0 && (
        <>
          <button onClick={() => setShowDone(!showDone)} className="mt-1 flex items-center gap-1 px-1 text-[12px] text-muted hover:text-fg">
            <ChevronRight className={cn('size-3.5 transition-transform', showDone && 'rotate-90')} />
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && done.map(row)}
        </>
      )}
    </section>
  )
}

function Partners({ state }: { state: EventState }) {
  const update = useEvent((s) => s.update)
  const linked = !!state.projectDir
  const groups = new Map<string, typeof state.config.partners>()
  for (const p of state.config.partners) groups.set(p.category, [...(groups.get(p.category) ?? []), p])
  const ready = state.config.partners.filter((p) => state.progress.partners[p.name]?.keys && state.progress.partners[p.name]?.kit).length
  const [open, setOpen] = useState(false)
  if (!state.config.partners.length) return null
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-[13px] font-semibold hover:text-accent-ink">
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
          Partners
        </button>
        <span className="text-[11px] text-muted">
          {ready} / {state.config.partners.length} ready (keys + tested starter kit)
        </span>
        <button onClick={() => useApp.getState().openHackathon('challenges')} className="ml-auto text-[12px] font-medium text-accent-ink hover:underline">
          Paste API keys under Challenges →
        </button>
      </div>
      {open && (
      <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {[...groups].map(([cat, ps]) => (
          <div key={cat}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{cat}</div>
            {ps.map((p) => {
              const st = state.progress.partners[p.name] ?? {}
              return (
                <div key={p.name} className="flex items-center gap-2 py-1 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{p.name}</span>
                      {p.url && (
                        <button onClick={() => void window.harness.openExternal(p.url!)} className="text-muted hover:text-fg" title={p.url}>
                          <ExternalLink className="size-3" />
                        </button>
                      )}
                    </div>
                    {p.note && <div className="truncate text-[11px] text-muted">{p.note}</div>}
                  </div>
                  {(['keys', 'kit'] as const).map((k) => (
                    <button
                      key={k}
                      disabled={!linked}
                      onClick={() => void update({ partner: { name: p.name, [k]: !st[k] } })}
                      title={k === 'keys' ? 'Account and API key ready' : 'Starter kit tested'}
                      className={cn(
                        'flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] disabled:opacity-60',
                        st[k] ? 'border-ok/50 bg-ok/10 text-ok-ink' : 'border-line text-muted hover:text-fg',
                      )}
                    >
                      {st[k] && <Check className="size-3" />}
                      {k === 'keys' ? 'Keys' : 'Kit'}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      )}
    </section>
  )
}
