import { cn } from '@/lib/format'
import { KIND_COLOR, toolDisplayName, toolKind } from '@/lib/tools'
import type { ToolCall } from '@/stores/reducer'

/** One sector per tool call, coloured by kind: a glanceable history of the agent's rhythm. */
export function ActivityStrip({ tools, max = 40 }: { tools: ToolCall[]; max?: number }) {
  const shown = tools.slice(-max)
  if (shown.length === 0) return null
  return (
    <div className="sectors h-1.5" aria-label={`${tools.length} tool calls`}>
      {shown.map((t) => (
        <span
          key={t.id}
          title={toolDisplayName(t.name)}
          style={{ backgroundColor: t.status === 'error' ? undefined : KIND_COLOR[toolKind(t.name)] }}
          className={cn('w-[7px] shrink-0 rounded-[1px]', t.status === 'running' ? 'sector-live' : 'opacity-75', t.status === 'error' && 'bg-danger')}
        />
      ))}
    </div>
  )
}
