import { PanelLeft } from 'lucide-react'
import { ContextGauge } from '@/features/meters/ContextGauge'
import { useElapsed } from '@/features/meters/useElapsed'
import { cn, formatCost, formatDuration, formatTokens } from '@/lib/format'
import { useActiveSession, useApp } from '@/stores/app'
import { StatusDot, STATUS_LABEL } from './StatusDot'

export function TopBar() {
  const session = useActiveSession()
  const { focusMode, toggleFocusMode } = useApp()
  const elapsed = useElapsed(session?.status === 'running' || session?.status === 'waiting' ? session.turnStartedAt : undefined)

  return (
    <header
      className={cn('drag flex h-12 shrink-0 items-center gap-4 border-b border-line px-4 text-[12px]', focusMode && 'pl-20')}
    >
      <button onClick={toggleFocusMode} className="no-drag rounded p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10" title="Focus mode (⌘\)">
        <PanelLeft className="size-4" />
      </button>
      {session ? (
        <>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold" title={session.cwd}>
              {session.title}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <StatusDot status={session.status} />
            {STATUS_LABEL[session.status]}
            {elapsed > 0 && <span className="tabular-nums">· {formatDuration(elapsed)}</span>}
          </div>
          <div className="ml-auto flex items-center gap-4 text-muted">
            {session.model && <span className="hidden truncate lg:inline">{session.model}</span>}
            <ContextGauge used={session.contextTokens} total={session.contextWindow} />
            <span className="tabular-nums" title="Output tokens this session">
              ↑ {formatTokens(session.outputTokens)}
            </span>
            <span className="tabular-nums font-medium text-fg" title="Cost this session">
              {formatCost(session.totalCostUsd)}
            </span>
          </div>
        </>
      ) : (
        <div className="font-semibold">Harness</div>
      )}
    </header>
  )
}
