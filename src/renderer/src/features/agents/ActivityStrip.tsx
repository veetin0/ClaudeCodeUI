import { cn } from '@/lib/format'
import { KIND_COLOR, toolDisplayName, toolKind } from '@/lib/tools'
import type { ToolCall } from '@/stores/reducer'


/** One tick per tool call, coloured by kind: a glanceable history of the agent's rhythm. */
export function ActivityStrip({ tools, max = 40 }: { tools: ToolCall[]; max?: number }) {
  const shown = tools.slice(-max)
  if (shown.length === 0) return null
  return (
    <div className="flex h-3 items-end gap-[2px]" aria-label={`${tools.length} tool calls`}>
      {shown.map((t) => (
        <span
          key={t.id}
          title={toolDisplayName(t.name)}
          style={{ background: t.status === 'error' ? undefined : KIND_COLOR[toolKind(t.name)] }}
          className={cn(
            'w-1 rounded-full',
            t.status === 'running' ? 'h-3 animate-soft-pulse' : 'h-2 opacity-70',
            t.status === 'error' && 'bg-red-500',
          )}
        />
      ))}
    </div>
  )
}
