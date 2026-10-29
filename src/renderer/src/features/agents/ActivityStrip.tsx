import { cn } from '@/lib/format'
import { KIND_COLOR, toolDisplayName, toolKind } from '@/lib/tools'
import type { ToolCall } from '@/stores/reducer'

/** One sector per tool call, coloured by kind: a glanceable history of the agent's rhythm. */
export function ActivityStrip({ tools, max = 24, className }: { tools: ToolCall[]; max?: number; className?: string }) {
  const shown = tools.slice(-max)
  if (shown.length === 0) return null
  return (
    <div className={cn('sectors h-1.5 min-w-0 flex-1 overflow-hidden', className)} aria-label={`${tools.length} tool calls`}>
      {shown.map((t) => (
        <span
          key={t.id}
          title={toolDisplayName(t.name)}
          style={{ backgroundColor: t.status === 'error' ? undefined : KIND_COLOR[toolKind(t.name)] }}
          className={cn('min-w-[4px] max-w-[14px] flex-1 rounded-[1px]', t.status === 'running' && 'sector-live', t.status === 'error' && 'bg-danger')}
        />
      ))}
    </div>
  )
}
