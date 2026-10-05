import { Activity, Bot, FolderTree, ListTodo } from 'lucide-react'
import { FilesPanel } from '@/features/files/FilesPanel'
import { AgentsPanel } from '@/features/agents/AgentsPanel'
import { ActivityPanel } from '@/features/agents/ActivityPanel'
import { TasksPanel } from '@/features/tasks/TasksPanel'
import { cn } from '@/lib/format'
import { useApp, type InspectorTab } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'

const TABS: { id: InspectorTab; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'files', label: 'Files', icon: FolderTree },
  { id: 'activity', label: 'Activity', icon: Activity },
]

export function Inspector({ session }: { session: SessionState }) {
  const { inspectorTab, setInspectorTab } = useApp()
  const counts: Partial<Record<InspectorTab, number>> = {
    agents: Object.values(session.subagents).filter((s) => s.status === 'running').length,
    tasks: session.todos.filter((t) => t.status !== 'completed').length,
    files: session.changes.length,
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface-2/40">
      <div className="flex gap-1 border-b border-line p-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setInspectorTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-md py-1.5 text-[11.5px]',
              inspectorTab === id ? 'bg-surface font-medium shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:text-fg',
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {!!counts[id] && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] leading-4 text-white">{counts[id]}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {inspectorTab === 'agents' && <AgentsPanel session={session} />}
        {inspectorTab === 'tasks' && <TasksPanel todos={session.todos} />}
        {inspectorTab === 'files' && <FilesPanel session={session} />}
        {inspectorTab === 'activity' && <ActivityPanel session={session} />}
      </div>
    </aside>
  )
}
