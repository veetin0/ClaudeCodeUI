import { FolderOpen, Plus, Settings, X } from 'lucide-react'
import { basename, cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { StatusDot, STATUS_LABEL } from './StatusDot'

export function Sidebar() {
  const { order, sessions, activeId, settings, select, closeSession, openProject, startSession, setSettingsOpen } = useApp()
  const openDirs = new Set(order.map((id) => sessions[id].cwd))
  const recents = (settings?.recentProjects ?? []).filter((d) => !openDirs.has(d)).slice(0, 6)

  return (
    <aside className="flex w-60 shrink-0 flex-col">
      <div className="drag h-12 shrink-0" />
      <div className="px-3">
        <button
          onClick={() => void openProject()}
          className="no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Plus className="size-4 text-[var(--accent)]" />
          New session
          <kbd className="ml-auto text-[11px] text-muted">⌘O</kbd>
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3">
        {order.length > 0 && <SectionLabel>Sessions</SectionLabel>}
        {order.map((id) => {
          const s = sessions[id]
          const waiting = s.permissions.length > 0
          return (
            <div
              key={id}
              onClick={() => select(id)}
              className={cn(
                'group flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2',
                id === activeId ? 'bg-black/[0.07] dark:bg-white/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/5',
              )}
            >
              <StatusDot status={s.status} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.title}</div>
                <div className={cn('truncate text-[11px]', waiting ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
                  {waiting ? `${s.permissions.length} waiting for approval` : STATUS_LABEL[s.status]}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void closeSession(id)
                }}
                className="invisible rounded p-0.5 text-muted hover:bg-black/10 group-hover:visible dark:hover:bg-white/10"
                title="Close session"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )
        })}

        {recents.length > 0 && (
          <>
            <SectionLabel className="mt-4">Recent projects</SectionLabel>
            {recents.map((dir) => (
              <button
                key={dir}
                onClick={() => void startSession(dir)}
                title={dir}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-muted hover:bg-black/[0.04] hover:text-fg dark:hover:bg-white/5"
              >
                <FolderOpen className="size-3.5 shrink-0" />
                <span className="truncate">{basename(dir)}</span>
              </button>
            ))}
          </>
        )}
      </div>

      <div className="p-3">
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/5"
        >
          <Settings className="size-4" />
          Settings
        </button>
      </div>
    </aside>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted', className)}>{children}</div>
}
