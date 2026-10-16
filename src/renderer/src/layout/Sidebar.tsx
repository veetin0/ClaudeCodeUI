import { BarChart3, CalendarClock, FolderOpen, History, Plus, Search, Settings, SquareTerminal, Trash2, X } from 'lucide-react'
import { eventClock, formatSpan } from '@shared/event'
import { useEventState, useNow } from '@/stores/event'
import { useMemo, useState } from 'react'
import type { SessionSummary } from '@shared/ipc'
import { basename, cn, formatCost } from '@/lib/format'
import { dateGroup, relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { StatusDot, STATUS_LABEL } from './StatusDot'
import { isMac, shortcut } from '@/lib/keys'

export function Sidebar() {
  const { order, sessions, history, activeId, settings, select, closeSession, openProject, startSession, openSaved, deleteSaved, setSettingsOpen } =
    useApp()
  const [query, setQuery] = useState('')
  const openIds = new Set(order)
  const openDirs = new Set(order.map((id) => sessions[id].cwd))
  const recents = (settings?.recentProjects ?? []).filter((d) => !openDirs.has(d)).slice(0, 4)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    // Sessions that never got a prompt have nothing worth reopening.
    const saved = history.filter(
      (h) => h.title && !openIds.has(h.id) && (!q || h.title.toLowerCase().includes(q) || h.cwd.toLowerCase().includes(q)),
    )
    const out: { label: string; items: SessionSummary[] }[] = []
    for (const h of saved) {
      const label = dateGroup(h.updatedAt)
      const g = out[out.length - 1]
      if (g?.label === label) g.items.push(h)
      else out.push({ label, items: [h] })
    }
    return out
  }, [history, query, order])

  return (
    <aside className="flex w-64 shrink-0 flex-col">
      {/* Room for the macOS traffic lights; Windows has a normal title bar above. */}
      <div className={isMac ? 'drag h-12 shrink-0' : 'h-3 shrink-0'} />
      <div className="px-3">
        <button
          onClick={() => void openProject()}
          className="no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Plus className="size-4 text-[var(--accent)]" />
          New session
          <kbd className="ml-auto text-[11px] text-muted">{shortcut('⌘O')}</kbd>
        </button>
        <EventEntry />
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {order.length > 0 && <SectionLabel>Open</SectionLabel>}
        {order.map((id) => (
          <OpenRow key={id} s={sessions[id]} active={id === activeId} onSelect={() => select(id)} onClose={() => void closeSession(id)} />
        ))}

        {recents.length > 0 && (
          <>
            <SectionLabel className="mt-4">Start in</SectionLabel>
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

        {(groups.length > 0 || query) && (
          <div className="mt-4">
            <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <History className="size-3" /> History
            </div>
            {history.length > 6 && (
              <label className="mb-1.5 flex items-center gap-1.5 rounded-md bg-black/[0.04] px-2 py-1 dark:bg-white/5">
                <Search className="size-3 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search sessions"
                  className="selectable min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted"
                />
              </label>
            )}
            {groups.map((g) => (
              <div key={g.label} className="mb-2">
                <div className="px-2.5 py-1 text-[10.5px] text-muted">{g.label}</div>
                {g.items.map((h) => (
                  <HistoryRow
                    key={h.id}
                    h={h}
                    onOpen={() => void openSaved(h.id)}
                    onDelete={() => {
                      if (window.confirm(`Delete “${h.title || 'Untitled session'}” from history? This can’t be undone.`)) void deleteSaved(h.id)
                    }}
                  />
                ))}
              </div>
            ))}
            {groups.length === 0 && query && <div className="px-2.5 py-1 text-[12px] text-muted">No matches</div>}
          </div>
        )}
      </div>

      <div className="p-3 pt-0">
        <button
          onClick={() => useApp.getState().setUsageOpen(!useApp.getState().usageOpen)}
          title={shortcut('Usage history (⌘7)')}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/5"
        >
          <BarChart3 className="size-4" />
          Usage
        </button>
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

function OpenRow({ s, active, onSelect, onClose }: { s: SessionState; active: boolean; onSelect: () => void; onClose: () => void }) {
  const waiting = s.permissions.length > 0
  return (
    <div
      onClick={onSelect}
      className={cn(
        'group flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2',
        active ? 'bg-black/[0.07] dark:bg-white/10' : 'hover:bg-black/[0.04] dark:hover:bg-white/5',
      )}
    >
      <StatusDot status={s.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate font-medium">
          {s.observed && <SquareTerminal className="size-3 shrink-0 text-muted" aria-label="Terminal session" />}
          <span className="truncate">{s.title || 'New session'}</span>
        </div>
        <div className={cn('truncate text-[11px]', waiting ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
          {basename(s.cwd)} · {waiting ? `${s.permissions.length} waiting for approval` : !s.live ? 'Saved' : s.observed ? `Terminal · ${STATUS_LABEL[s.status]}` : STATUS_LABEL[s.status]}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="invisible rounded p-0.5 text-muted hover:bg-black/10 group-hover:visible dark:hover:bg-white/10"
        title={s.live && !s.observed ? 'Stop and close (stays in history)' : 'Close'}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function HistoryRow({ h, onOpen, onDelete }: { h: SessionSummary; onOpen: () => void; onDelete: () => void }) {
  return (
    <div onClick={onOpen} className="group flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-black/[0.04] dark:hover:bg-white/5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate">
          {h.observed && <SquareTerminal className="size-3 shrink-0 text-muted" aria-label="Terminal session" />}
          <span className="truncate">{h.title || 'Untitled session'}</span>
        </div>
        <div className="truncate text-[11px] text-muted">
          {basename(h.cwd)} · {relativeTime(h.updatedAt)}
          {h.costUsd > 0 && ` · ${formatCost(h.costUsd)}`}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="invisible rounded p-0.5 text-muted hover:bg-black/10 hover:text-red-500 group-hover:visible dark:hover:bg-white/10"
        title="Delete from history"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted', className)}>{children}</div>
}

/** Event mode entry with a live countdown to the next thing that matters. */
function EventEntry() {
  const state = useEventState()
  const open = useApp((s) => s.eventOpen)
  const setEventOpen = useApp((s) => s.setEventOpen)
  const now = useNow(30_000)
  if (!state) return null
  const clock = eventClock(state.config, now)
  const sub =
    clock.stage === 'before'
      ? `starts in ${formatSpan(clock.start - now)}`
      : clock.stage === 'during'
        ? clock.nextDeadline
          ? `${clock.nextDeadline.label.split(' ')[0]} due in ${formatSpan(clock.nextDeadline.t - now)}`
          : 'judging'
        : 'ended'
  const urgent = clock.stage === 'during' && clock.nextDeadline && clock.nextDeadline.t - now < 3_600_000
  return (
    <button
      onClick={() => setEventOpen(!open)}
      title={shortcut('Event mode (⌘6)')}
      className={cn(
        'no-drag mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5',
        open && 'bg-black/[0.07] dark:bg-white/10',
      )}
    >
      <CalendarClock className="size-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{state.config.name}</span>
        <span className={cn('block truncate text-[11px] tabular-nums', urgent ? 'font-medium text-red-500' : 'text-muted')}>{sub}</span>
      </span>
      <kbd className="text-[11px] text-muted">{shortcut('⌘6')}</kbd>
    </button>
  )
}
