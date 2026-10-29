import { Bot, Check, CircleDashed, Crown, GitBranch, Loader2, Pause, Play, Square, TriangleAlert } from 'lucide-react'
import { formatDuration, type RunMilestone, type RunTask } from '@shared/run'
import { cn } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useCrew } from '@/stores/crew'
import { useNow } from '@/stores/event'
import { useRun, useRunStore } from '@/stores/run'
import { Inbox } from './Inbox'
import { LeadCard } from './LeadCard'
import { Card, Secondary, UsageBar, useBusy } from './parts'
import { Menu } from '@/ui/Menu'

/** Steps 9–21: the build, milestone by milestone, with everyone's work on one screen. */
export function RunBoard() {
  const run = useRun()
  const act = useRunStore((s) => s.act)
  const pausing = useBusy('pause')
  const now = useNow(15_000)
  const paused = !!run.pausedReason
  const current = run.milestones.find((m) => m.id === run.current)

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">
          {run.step === 'finishing' ? 'Finishing: pitch, verify, improve' : current ? `${current.id}: ${current.goal}` : 'Running'}
        </h1>
        {current?.startedAt && (
          <span className="text-[12px] tabular-nums text-muted">
            {formatDuration(now - current.startedAt)}
            {current.budgetMs ? ` of ${formatDuration(current.budgetMs)}` : ''}
            {current.status === 'integrating' && ' · integrating'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {paused ? (
            <Secondary busy={pausing} onClick={() => void act('pause', () => window.harness.runResume())}>
              <Play className="size-3.5" /> Resume
            </Secondary>
          ) : (
            <Secondary
              busy={pausing}
              onClick={() => void act('pause', () => window.harness.runPause())}
              title="Your Claude stops after its current step; the crew finishes what it has"
            >
              <Pause className="size-3.5" /> Pause
            </Secondary>
          )}
          <Menu
            items={[
              {
                label: 'Stop the run',
                icon: Square,
                danger: true,
                hint: 'Crew tasks stop; your Claude stops after its current step',
                onSelect: () => window.confirm('Stop the run? Crew tasks are stopped and your Claude stops after its current step.') && void act('stop', () => window.harness.runStop()),
              },
            ]}
          />
        </div>
      </div>

      {paused && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.07] px-3 py-2 text-[12.5px]">
          <TriangleAlert className="size-4 text-amber-600" />
          <span>
            {run.pausedReason}
            {run.resumeAt && ` · carries on at ${new Date(run.resumeAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
          </span>
        </div>
      )}

      <Timeline milestones={run.milestones} current={run.current} finishing={run.step === 'finishing'} />

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <People />
          <Tasks tasks={run.tasks} current={run.current} />
        </div>
        <div className="space-y-4">
          <Inbox empty="Nothing needs you. Decisions, questions and approvals show up here." />
          <Log />
        </div>
      </div>
    </div>
  )
}

function Timeline({ milestones, current, finishing }: { milestones: RunMilestone[]; current?: string; finishing: boolean }) {
  return (
    <div className="flex gap-1.5">
      {milestones.map((m) => (
        <div key={m.id} className="min-w-0 flex-1" title={`${m.id}: ${m.goal}`}>
          <div
            className={cn(
              'h-1.5 rounded-full',
              m.status === 'done'
                ? 'bg-emerald-500'
                : m.id === current
                  ? 'animate-pulse bg-[var(--accent)]'
                  : m.status === 'stuck'
                    ? 'bg-amber-500'
                    : 'bg-line',
            )}
          />
          <div className={cn('mt-1 flex items-center gap-1 truncate text-[11px]', m.id === current ? 'font-semibold' : 'text-muted')}>
            {m.status === 'done' ? <Check className="size-3 text-emerald-600" /> : m.id === current ? <Loader2 className="size-3 animate-spin" /> : null}
            {m.id}
            <span className="truncate font-normal"> {m.goal}</span>
          </div>
        </div>
      ))}
      <div className="w-28 shrink-0" title="Pitch, final verification and the improvement loop">
        <div className={cn('h-1.5 rounded-full', finishing ? 'animate-pulse bg-[var(--accent)]' : 'bg-line')} />
        <div className={cn('mt-1 truncate text-[11px]', finishing ? 'font-semibold' : 'text-muted')}>Finish</div>
      </div>
    </div>
  )
}

/** Who's doing what right now: your Claude, then each teammate's. */
function People() {
  const crew = useCrew()
  const run = useRun()
  const now = useNow(15_000)
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <LeadCard compact />
      {crew.members.map((m) => {
        const task = run.tasks.find((t) => t.assignee.kind === 'crew' && t.assignee.id === m.id && t.state === 'working')
        return (
          <div key={m.id} className={cn('rounded-xl border border-line p-3', !m.online && 'opacity-55')}>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'size-2 rounded-full',
                  !m.online ? 'bg-fg/25' : m.problem ? 'bg-amber-500' : m.current ? 'animate-pulse bg-sky-500' : 'bg-emerald-500',
                )}
              />
              <Bot className="size-3.5 text-muted" />
              <span className="font-semibold">{m.name}’s Claude</span>
              <span className="text-[11.5px] text-muted">{!m.online ? 'Offline' : m.problem ? 'Not ready' : m.current ? 'Working' : 'Free'}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <UsageBar pct={m.usage.source === 'api-key' ? 100 : m.headroom} />
              </div>
              <span className="text-[11px] tabular-nums text-muted">{m.usage.source === 'api-key' ? 'API key' : `${m.headroom}% usage left`}</span>
            </div>
            {m.problem && <div className="selectable mt-2 text-[12px] text-amber-700 dark:text-amber-300">{m.problem}</div>}
            {m.current && (
              <div className="mt-2 text-[12px]">
                <div className="truncate font-medium">{task?.id ?? m.current.title}</div>
                <div className="truncate font-mono text-[11.5px] text-muted">
                  {m.current.activity ?? 'starting'}
                  {m.current.since && ` · ${formatDuration(now - m.current.since)}`}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Tasks({ tasks, current }: { tasks: RunTask[]; current?: string }) {
  const shown = tasks.filter((t) => t.milestone === current)
  const earlier = tasks.filter((t) => t.milestone !== current)
  if (!tasks.length) return null
  return (
    <Card
      title="Tasks"
      aside={earlier.length > 0 && <span className="text-[11.5px] text-muted">{earlier.filter((t) => t.state === 'done').length} done earlier</span>}
    >
      <div className="divide-y divide-line">
        {(shown.length ? shown : earlier.slice(-8)).map((t) => (
          <div key={t.id} className="flex items-start gap-3 py-2 text-[12.5px]">
            <span className="mt-0.5">
              {t.state === 'done' ? (
                <Check className="size-4 text-emerald-600" />
              ) : t.state === 'failed' ? (
                <TriangleAlert className="size-4 text-amber-600" />
              ) : t.state === 'working' ? (
                <Loader2 className="size-4 animate-spin text-sky-600" />
              ) : (
                <CircleDashed className="size-4 text-muted" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-mono font-medium">{t.id}</span>
                {t.role && <span className="text-muted">{t.role}</span>}
                <span className="flex items-center gap-1 text-[11.5px] text-muted">
                  {t.assignee.kind === 'lead' ? <Crown className="size-3" /> : <Bot className="size-3" />}
                  {t.assignee.kind === 'lead' ? 'your Claude' : t.assignee.name}
                </span>
              </div>
              {t.owned.length > 0 && <div className="truncate font-mono text-[11px] text-muted">{t.owned.join('  ')}</div>}
              {t.note && (
                <div className="selectable mt-0.5 flex items-center gap-1 text-[11.5px] text-muted">
                  {t.note.includes('crew/') && <GitBranch className="size-3" />}
                  {t.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Log() {
  const run = useRun()
  const now = useNow(30_000)
  return (
    <Card title="What happened">
      <ol className="selectable max-h-96 space-y-1.5 overflow-y-auto text-[12px]">
        {[...run.log].reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2">
            <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted">{relativeTime(e.at, now)}</span>
            <span className={cn(e.tone === 'good' ? 'text-emerald-700 dark:text-emerald-400' : e.tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : '')}>
              {e.text}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
