import { ChevronRight, Hammer } from 'lucide-react'
import { useState } from 'react'
import { FilesPanel } from '@/features/files/FilesPanel'
import { AgentsPanel } from '@/features/agents/AgentsPanel'
import { TasksPanel } from '@/features/tasks/TasksPanel'
import { basename, cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useProject } from '@/stores/project'
import type { SessionState } from '@/stores/reducer'

/** The session's side panel: one scroll of what's happening, instead of four tabs. */
export function SidePanel({ session }: { session: SessionState }) {
  const tasks = session.todos.filter((t) => t.status !== 'completed').length
  const running = Object.values(session.subagents).filter((s) => s.status === 'running').length
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2/40 p-3" aria-label="Side panel">
      <ProjectSection session={session} />
      <Section title="Tasks" count={tasks}>
        <TasksPanel todos={session.todos} />
      </Section>
      <Section title="Files" count={session.changes.length} countLabel="changed">
        <FilesPanel session={session} />
      </Section>
      <Section title="Agents" count={running} countLabel="running">
        <AgentsPanel session={session} />
      </Section>
    </aside>
  )
}

function Section({ title, count, countLabel, children, defaultOpen = true }: { title: string; count?: number; countLabel?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-3">
      <button onClick={() => setOpen(!open)} className="mb-1 flex w-full items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {title}
        {!!count && (
          <span className="num ml-auto rounded-sm bg-fg px-1.5 text-[12px] font-semibold normal-case leading-4 tracking-normal text-surface">
            {count}
            {countLabel && ` ${countLabel}`}
          </span>
        )}
      </button>
      {open && children}
    </section>
  )
}

/** This session's folder as a project: open its Project page, or make it the current project. */
function ProjectSection({ session }: { session: SessionState }) {
  const current = useApp((s) => s.settings?.project) === session.cwd
  if (session.observed) return null
  const open = async () => {
    if (!current) await useProject.getState().setProject(session.cwd)
    useProject.getState().setTab('build')
    useApp.getState().openProject()
  }
  return (
    <button
      onClick={() => void open()}
      className="mb-3 flex w-full items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-left text-[12px] hover:bg-surface-2"
      title={current ? 'Its build, promo video and API keys (⌘4)' : 'Make this folder the current project: its build, promo video and API keys'}
    >
      <Hammer className="size-3.5 shrink-0 text-accent-ink" />
      <span className="min-w-0 flex-1 truncate font-medium">{current ? `Project: ${basename(session.cwd)}` : 'Use this folder as the project'}</span>
      <ChevronRight className="size-3.5 text-muted" />
    </button>
  )
}
