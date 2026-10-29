import { Bot, ChevronRight, Maximize2 } from 'lucide-react'
import { useApp } from '@/stores/app'
import { agentViews, currentActivity } from '../agents/model'
import { NowWidget } from '../agents/NowWidget'
import { ProgressBar } from '../viz/ProgressBar'
import { useState } from 'react'
import { cn, formatDuration, formatTokens } from '@/lib/format'
import type { SessionState, Subagent } from '@/stores/reducer'
import { useElapsed } from '../meters/useElapsed'
import { ToolChip } from './ToolChip'
import { Markdown } from './Markdown'
import { ToolDetail } from './ToolDetail'

/** A Task/Agent call rendered as a live mini-transcript of the subagent's own tool calls. */
export function SubagentCard({ sub, session }: { sub: Subagent; session: SessionState }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const running = sub.status === 'running'
  const live = useElapsed(running ? sub.startedAt : undefined, 500)
  const duration = sub.endedAt ? sub.endedAt - sub.startedAt : live
  const tools = sub.toolIds.map((id) => session.tools[id]).filter(Boolean)
  const current = [...tools].reverse().find((t) => t.status === 'running')
  const selectedTool = selected ? session.tools[selected] : undefined
  const openAgent = useApp((st) => st.openAgent)
  const view = agentViews(session).find((a) => a.id === sub.id)
  const progress = Object.values(session.visuals[sub.id]?.progress ?? {})

  return (
    <div className={cn('rounded-xl border bg-info/[0.04]', running ? 'border-info/40' : 'border-line')}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
        <ChevronRight className={cn('size-3.5 text-muted transition-transform', open && 'rotate-90')} />
        <Bot className={cn('size-4 text-info-ink')} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{sub.description}</div>
          <div className="truncate text-[12px] text-muted">
            {sub.subagentType ?? 'subagent'} · {tools.length} tool calls
            {sub.background && <> · background</>}
            {running && (sub.progress ? <> · {sub.progress}</> : current && <> · now: {current.name}</>)}
            {!running && sub.status !== 'completed' && <> · {sub.status}</>}
          </div>
        </div>
        <span
          role="button"
          title="Open agent details"
          onClick={(e) => {
            e.stopPropagation()
            openAgent(sub.id)
          }}
          className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
        >
          <Maximize2 className="size-3.5" />
        </span>
        <div className="shrink-0 text-right text-[12px] num text-muted">
          {duration > 0 && <div>{formatDuration(duration)}</div>}
          {sub.totalTokens !== undefined && <div>{formatTokens(sub.totalTokens)} tok</div>}
        </div>
      </button>
      {running && view && (
        <div className="space-y-2 px-3 pb-3">
          <NowWidget agent={view} activity={currentActivity(view)} lines={4} />
          {progress.slice(0, 2).map((p) => (
            <ProgressBar key={p.label} p={p} />
          ))}
        </div>
      )}
      {open && (
        <div className="space-y-2 border-t border-line px-3 py-2.5">
          {tools.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tools.map((t) => (
                <ToolChip key={t.id} tool={t} selected={selected === t.id} onClick={() => setSelected(selected === t.id ? null : t.id)} />
              ))}
            </div>
          )}
          {selectedTool && <ToolDetail tool={selectedTool} />}
          {(sub.summary || sub.lastText) && (
            <Markdown text={sub.lastText || sub.summary || ''} className="prose-p:text-[12px] text-muted" />
          )}
        </div>
      )}
    </div>
  )
}
