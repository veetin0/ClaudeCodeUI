import { formatDuration } from '@/lib/format'
import { kindVars, toolDisplayName, toolIcon, toolSummary } from '@/lib/tools'
import type { SessionState } from '@/stores/reducer'
import { cn } from '@/lib/format'

/** Reverse-chronological log of every tool call across all agents. */
export function ActivityPanel({ session }: { session: SessionState }) {
  const tools = Object.values(session.tools).sort((a, b) => b.startedAt - a.startedAt)
  if (tools.length === 0) return <p className="px-1 pt-2 text-[12px] text-muted">Tool calls will stream in here.</p>

  return (
    <ol className="space-y-1">
      {tools.map((t) => {
        const Icon = toolIcon(t.name)
        const sub = t.agentId ? session.subagents[t.agentId] : undefined
        return (
          <li key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-hover">
            <span style={kindVars(t.name)} className="kind-tint flex size-6 shrink-0 items-center justify-center rounded-md border">
              <Icon className="kind-icon size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px]">
                <span className="font-medium">{toolDisplayName(t.name)}</span>{' '}
                <span className="text-muted">{toolSummary(t.name, t.input)}</span>
              </div>
              {sub && <div className="truncate text-[11px] text-info-ink">↳ {sub.description}</div>}
            </div>
            <span className={cn('shrink-0 text-[12px] num', t.status === 'error' ? 'text-danger-ink' : 'text-muted')}>
              {t.status === 'running' ? '…' : t.endedAt ? formatDuration(t.endedAt - t.startedAt) : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
