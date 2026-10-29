import { Bot, ChevronRight, Sparkles } from 'lucide-react'
import { cn, formatDuration, formatTokens } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useElapsed } from '../meters/useElapsed'
import { MetricTile } from '../viz/MetricTile'
import { ProgressBar } from '../viz/ProgressBar'
import { ShowView } from '../viz/ShowView'
import { ActivityStrip } from './ActivityStrip'
import { currentActivity, isActive, type AgentRunState, type AgentView } from './model'
import { NowWidget } from './NowWidget'

const STATE_STYLE: Record<AgentRunState, { label: string; dot: string; border: string }> = {
  running: { label: 'Working', dot: 'bg-ok animate-soft-pulse', border: 'border-ok/40' },
  waiting: { label: 'Needs you', dot: 'bg-warn animate-soft-pulse', border: 'border-warn/50' },
  idle: { label: 'Idle', dot: 'bg-idle', border: 'border-line' },
  completed: { label: 'Done', dot: 'bg-idle', border: 'border-line' },
  failed: { label: 'Failed', dot: 'bg-danger', border: 'border-danger/40' },
  stopped: { label: 'Stopped', dot: 'bg-idle', border: 'border-line' },
}

/**
 * A live tile for one agent: what it's doing now, its progress bars and metric trends,
 * the latest thing it showed, and a strip of its tool calls. Click for the full detail view.
 */
export function AgentCard({ agent, compact = false }: { agent: AgentView; compact?: boolean }) {
  const openAgent = useApp((s) => s.openAgent)
  const activity = currentActivity(agent)
  const st = STATE_STYLE[agent.state]
  const live = useElapsed(isActive(agent) ? agent.startedAt : undefined, 1000)
  const duration = agent.endedAt && agent.startedAt ? agent.endedAt - agent.startedAt : live
  const progress = Object.values(agent.visuals.progress).sort((a, b) => b.updatedAt - a.updatedAt)
  const metrics = Object.entries(agent.visuals.metrics).filter(([, m]) => m.points.length > 0)
  const latestShow = agent.visuals.shows.at(-1)
  const Icon = agent.id === null ? Sparkles : Bot

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openAgent(agent.key)}
      onKeyDown={(e) => e.key === 'Enter' && openAgent(agent.key)}
      className={cn(
        'group flex w-full min-w-0 cursor-default flex-col gap-2.5 rounded-lg border bg-surface p-3 text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent-ink/40 hover:shadow-[0_8px_24px_-10px_rgb(21_22_29/0.25)]',
        st.border,
        !isActive(agent) && agent.state !== 'idle' && 'opacity-85',
      )}
    >
      <div className="flex w-full items-center gap-2">
        <Icon className={cn('size-4 shrink-0', agent.id === null ? 'text-accent-ink' : 'text-info-ink')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{agent.name}</div>
          {!compact && (
            <div className="truncate text-[12px] text-muted">
              {agent.role}
              {agent.background && ' · background'}
            </div>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
          <span className={cn('size-2 rounded-[2px]', st.dot)} />
          {st.label}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
      </div>

      <div className="w-full truncate text-[13px] font-medium">{agent.visuals.status && activity.kind !== 'waiting' ? agent.visuals.status : activity.title}</div>
      {(!compact || isActive(agent)) && <NowWidget agent={agent} activity={activity} lines={compact ? 3 : 6} />}

      {progress.slice(0, compact ? 1 : 3).map((p) => (
        <div key={p.label} className="w-full">
          <ProgressBar p={p} compact={compact} />
        </div>
      ))}

      {metrics.length > 0 && (
        <div className={cn('grid w-full gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
          {metrics.slice(0, compact ? 2 : 4).map(([name, m]) => (
            <MetricTile key={name} name={name} series={m} height={compact ? 24 : 36} />
          ))}
        </div>
      )}

      {!compact && latestShow && (
        <div className="w-full">
          <ShowView show={latestShow} compact />
        </div>
      )}

      <div className="num flex w-full items-center gap-3 text-[12px] text-muted">
        <ActivityStrip tools={agent.tools} max={compact ? 24 : 40} />
        <span className="ml-auto">{agent.tools.length} calls</span>
        {agent.totalTokens !== undefined && <span>{formatTokens(agent.totalTokens)} tok</span>}
        {duration > 0 && <span className="font-semibold text-fg">{formatDuration(duration)}</span>}
      </div>
    </div>
  )
}
