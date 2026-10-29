import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import type { TodoItem } from '@shared/events'
import { cn } from '@/lib/format'
import { SectorMeter } from '@/ui/Sectors'

/** Mirrors the agent's TodoWrite list. */
export function TasksPanel({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return <p className="px-1 pt-2 text-[12px] text-muted">When Claude plans multi-step work, its task list appears here.</p>
  const done = todos.filter((t) => t.status === 'completed').length

  return (
    <div>
      <div className="mb-3 px-1">
        <div className="mb-1.5 flex justify-between text-[12px] text-muted">
          <span>Progress</span>
          <span className="num font-semibold text-fg">
            {done}/{todos.length}
          </span>
        </div>
        <SectorMeter value={done / todos.length} count={Math.min(24, Math.max(todos.length, 1))} label="Tasks done" />
      </div>
      <ul className="space-y-0.5">
        {todos.map((t, i) => (
          <li key={i} className="flex items-start gap-2 rounded-md px-1.5 py-1.5">
            {t.status === 'completed' ? (
              <CheckCircle2 className="mt-px size-4 shrink-0 text-ok-ink" />
            ) : t.status === 'in_progress' ? (
              <CircleDot className="mt-px size-4 shrink-0 animate-soft-pulse text-accent-ink" />
            ) : (
              <Circle className="mt-px size-4 shrink-0 text-muted" />
            )}
            <span className={cn('text-[13px] leading-snug', t.status === 'completed' && 'text-muted line-through', t.status === 'in_progress' && 'font-medium')}>
              {t.status === 'in_progress' && t.activeForm ? t.activeForm : t.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
