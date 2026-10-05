import { formatDuration } from '@/lib/format'
import { KIND_STYLES, toolDisplayName, toolIcon, toolKind, toolSummary } from '@/lib/tools'
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
          <li key={t.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-black/[0.03] dark:hover:bg-white/5">
            <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md border', KIND_STYLES[toolKind(t.name)])}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px]">
                <span className="font-medium">{toolDisplayName(t.name)}</span>{' '}
                <span className="text-muted">{toolSummary(t.name, t.input)}</span>
              </div>
              {sub && <div className="truncate text-[10.5px] text-pink-600 dark:text-pink-400">↳ {sub.description}</div>}
            </div>
            <span className={cn('shrink-0 text-[10.5px] tabular-nums', t.status === 'error' ? 'text-red-500' : 'text-muted')}>
              {t.status === 'running' ? '…' : t.endedAt ? formatDuration(t.endedAt - t.startedAt) : ''}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
