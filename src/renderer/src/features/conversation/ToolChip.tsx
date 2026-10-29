import { Check, Loader2, ShieldQuestion, X } from 'lucide-react'
import { cn, formatDuration } from '@/lib/format'
import { kindVars, toolDisplayName, toolIcon, toolSummary } from '@/lib/tools'
import type { ToolCall } from '@/stores/reducer'
import { useElapsed } from '../meters/useElapsed'

export function ToolChip({ tool, selected, waiting, onClick }: { tool: ToolCall; selected?: boolean; waiting?: boolean; onClick?: () => void }) {
  const Icon = toolIcon(tool.name)
  const summary = toolSummary(tool.name, tool.input)
  const live = useElapsed(tool.status === 'running' ? tool.startedAt : undefined, 500)
  const duration = tool.endedAt ? tool.endedAt - tool.startedAt : live

  return (
    <button
      onClick={onClick}
      title={summary}
      style={kindVars(tool.name)}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors',
        waiting ? 'border-warn/60 bg-warn/10' : 'kind-tint',
        selected && 'ring-2 ring-accent-ink/40',
      )}
    >
      <Icon className="kind-icon size-3.5 shrink-0" />
      <span className="font-medium">{toolDisplayName(tool.name)}</span>
      {summary && <span className="truncate text-fg/70">{summary}</span>}
      {waiting ? (
        <span className="flex shrink-0 items-center gap-1 text-warn-ink">
          <ShieldQuestion className="size-3" aria-hidden /> waiting for you
        </span>
      ) : tool.status === 'running' ? (
        <Loader2 className="size-3 shrink-0 animate-spin" />
      ) : tool.status === 'error' ? (
        <X className="size-3 shrink-0 text-danger-ink" />
      ) : (
        <Check className="size-3 shrink-0 opacity-60" />
      )}
      {duration > 1500 && <span className="shrink-0 num text-[12px] opacity-70">{formatDuration(duration)}</span>}
    </button>
  )
}
