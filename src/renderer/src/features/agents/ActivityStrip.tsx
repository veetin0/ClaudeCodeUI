import { cn } from '@/lib/format'
import { toolDisplayName, toolKind } from '@/lib/tools'
import type { ToolCall } from '@/stores/reducer'

const TICK: Record<string, string> = {
  read: 'bg-sky-500',
  write: 'bg-orange-500',
  search: 'bg-violet-500',
  exec: 'bg-emerald-500',
  web: 'bg-cyan-500',
  agent: 'bg-pink-500',
  plan: 'bg-amber-500',
  mcp: 'bg-indigo-500',
  other: 'bg-zinc-400',
}

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
          className={cn(
            'w-1 rounded-full',
            TICK[toolKind(t.name)],
            t.status === 'running' ? 'h-3 animate-soft-pulse' : 'h-2 opacity-70',
            t.status === 'error' && 'bg-red-500',
          )}
        />
      ))}
    </div>
  )
}
