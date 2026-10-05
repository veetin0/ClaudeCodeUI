import { Bot, Sparkles } from 'lucide-react'
import { cn, formatDuration, formatTokens } from '@/lib/format'
import { toolDisplayName, toolSummary } from '@/lib/tools'
import type { SessionState, ToolCall } from '@/stores/reducer'
import { StatusDot } from '@/layout/StatusDot'
import { useElapsed } from '../meters/useElapsed'

/** Live tree of the main agent and its subagents. (Phase 4 replaces this with the React Flow graph.) */
export function AgentsPanel({ session }: { session: SessionState }) {
  const tools = Object.values(session.tools)
  const mainTools = tools.filter((t) => t.agentId === null)
  const mainCurrent = lastRunning(mainTools)
  const subs = Object.values(session.subagents).sort((a, b) => a.startedAt - b.startedAt)

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[var(--accent)]" />
          <span className="font-medium">Main agent</span>
          <StatusDot status={session.status} className="ml-auto" />
        </div>
        <div className="mt-1.5 truncate text-[11.5px] text-muted">
          {mainCurrent ? <CurrentTool tool={mainCurrent} /> : session.status === 'running' ? 'Thinking…' : 'Idle'}
        </div>
        <div className="mt-2 flex gap-3 text-[11px] tabular-nums text-muted">
          <span>{mainTools.length} tool calls</span>
          <span>{formatTokens(session.contextTokens)} context</span>
        </div>
      </div>

      {subs.length > 0 && (
        <div className="ml-3 space-y-2 border-l-2 border-line pl-3">
          {subs.map((sub) => {
            const subTools = sub.toolIds.map((id) => session.tools[id]).filter(Boolean)
            const current = lastRunning(subTools)
            const running = sub.status === 'running'
            return (
              <div key={sub.id} className={cn('rounded-xl border bg-surface p-3', running ? 'border-pink-500/40' : 'border-line opacity-80')}>
                <div className="flex items-center gap-2">
                  <Bot className={cn('size-4 text-pink-600 dark:text-pink-400', running && 'animate-soft-pulse')} />
                  <span className="min-w-0 flex-1 truncate font-medium">{sub.description}</span>
                  <Elapsed start={sub.startedAt} end={sub.endedAt} />
                </div>
                <div className="mt-1.5 truncate text-[11.5px] text-muted">
                  {current ? <CurrentTool tool={current} /> : running ? 'Thinking…' : sub.status}
                </div>
                {running && sub.progress && <div className="mt-1 line-clamp-2 text-[11.5px] italic text-muted">{sub.progress}</div>}
                <div className="mt-2 flex gap-3 text-[11px] tabular-nums text-muted">
                  <span>{sub.subagentType ?? 'general'}</span>
                  {sub.background && <span>background</span>}
                  <span>{subTools.length} tool calls</span>
                  {sub.totalTokens !== undefined && <span>{formatTokens(sub.totalTokens)} tok</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {subs.length === 0 && <p className="px-1 pt-2 text-[12px] text-muted">Subagents show up here as Claude spawns them.</p>}
    </div>
  )
}

function lastRunning(tools: ToolCall[]): ToolCall | undefined {
  for (let i = tools.length - 1; i >= 0; i--) if (tools[i].status === 'running') return tools[i]
  return undefined
}

function CurrentTool({ tool }: { tool: ToolCall }) {
  const summary = toolSummary(tool.name, tool.input)
  return (
    <span>
      <span className="font-medium text-fg">{toolDisplayName(tool.name)}</span> {summary}
    </span>
  )
}

function Elapsed({ start, end }: { start: number; end?: number }) {
  const live = useElapsed(end ? undefined : start, 1000)
  const ms = end ? end - start : live
  return <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatDuration(ms)}</span>
}
