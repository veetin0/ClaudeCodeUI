import { ChevronDown, Flame, FolderOpen, Home, Plus, Rocket, Search, Settings, SquareTerminal, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SessionSummary } from '@shared/ipc'
import { basename, cn, formatCost } from '@/lib/format'
import { dateGroup, relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useHackathonSummary } from '@/features/hackathon/summary'
import { Menu, menuItems } from '@/ui/Menu'
import { newHackforgeProject } from '@/lib/projects'
import { StatusDot, STATUS_LABEL } from './StatusDot'
import { usePlanUsage } from './StatusChip'
import { isMac, shortcut } from '@/lib/keys'

/** Three parts: where to go (Home, Hackathon, a new session), your sessions, and usage + settings. */
export function Sidebar() {
  const { order, sessions, history, activeId, place, select, closeSession, openSaved, deleteSaved, goHome } = useApp()
  const [query, setQuery] = useState('')
  const openIds = new Set(order)

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
      <nav className="space-y-0.5 px-3">
        <NavRow icon={<Home className="size-4 text-muted" />} active={place === 'home'} onClick={goHome} keys={shortcut('⇧⌘H')}>
          Home
        </NavRow>
        <HackathonRow />
        <NewSessionRow />
      </nav>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {(order.length > 0 || groups.length > 0 || query) && <SectionLabel>Sessions</SectionLabel>}
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
        {order.map((id) => (
          <OpenRow key={id} s={sessions[id]} active={place === 'session' && id === activeId} onSelect={() => select(id)} onClose={() => void closeSession(id)} />
        ))}
        {groups.map((g) => (
          <div key={g.label} className="mt-2">
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

      <Footer />
    </aside>
  )
}

function NavRow({ icon, active, onClick, keys, children }: { icon: React.ReactNode; active?: boolean; onClick: () => void; keys?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-medium hover:bg-black/5 dark:hover:bg-white/5',
        active && 'bg-black/[0.07] dark:bg-white/10',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {keys && <kbd className="text-[11px] font-normal text-muted">{keys}</kbd>}
    </button>
  )
}

/** The hackathon: team run and event in one row, with where it is and what's due next. */
function HackathonRow() {
  const h = useHackathonSummary()
  const open = useApp((s) => s.place === 'hackathon')
  const sub = h.stage === 'team' && h.countdown ? h.countdown : h.urgent && h.countdown ? `${h.status} · ${h.countdown}` : h.status
  return (
    <button
      onClick={() => useApp.getState().openHackathon()}
      title={shortcut('Hackathon: team run, challenges, pitch and schedule (⌘4)')}
      className={cn(
        'no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-black/5 dark:hover:bg-white/5',
        open && 'bg-black/[0.07] dark:bg-white/10',
      )}
    >
      <Rocket className="size-4 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{h.name}</span>
        <span className={cn('block truncate text-[11px] tabular-nums', h.urgent ? 'font-medium text-red-500' : 'text-muted')}>{sub}</span>
      </span>
      {h.inbox > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10.5px] font-semibold text-white">{h.inbox}</span>}
    </button>
  )
}

/** New session (a folder picker); its ▾ starts one in a recent folder or a new HackForge project. */
function NewSessionRow() {
  const { settings, openProject, startSession, order, sessions } = useApp()
  const openDirs = new Set(order.map((id) => sessions[id].cwd))
  const recents = (settings?.recentProjects ?? []).filter((d) => !openDirs.has(d)).slice(0, 6)
  return (
    <div className="group flex items-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
      <button onClick={() => void openProject()} className="no-drag flex min-w-0 flex-1 items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left font-medium">
        <Plus className="size-4 text-muted" />
        New session
        <kbd className="ml-auto text-[11px] font-normal text-muted">{shortcut('⌘O')}</kbd>
      </button>
      <Menu
        label="Start in…"
        align="end"
        trigger={<ChevronDown className="size-3.5" />}
        triggerClassName="mr-1 px-1"
        items={menuItems(
          recents.length > 0 && { heading: 'Start in' },
          ...recents.map((dir) => ({ label: basename(dir), hint: dir, icon: FolderOpen, onSelect: () => void startSession(dir) })),
          recents.length > 0 && 'separator',
          { label: 'Open folder…', icon: FolderOpen, keys: shortcut('⌘O'), onSelect: () => void openProject() },
          settings?.hackforgeMode !== 'off' && { label: 'New HackForge project…', icon: Flame, hint: 'Pick a folder, then set it up', onSelect: () => void newHackforgeProject() },
        )}
      />
    </div>
  )
}

function Footer() {
  const plan = usePlanUsage()
  const { setUsageOpen, setSettingsOpen } = useApp()
  return (
    <div className="flex items-center gap-1 p-3 pt-0">
      <button
        onClick={() => setUsageOpen(true)}
        title={shortcut('Usage history (⌘5)')}
        className="no-drag flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/5"
      >
        <span className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <span
            className={cn('absolute inset-y-0 left-0 rounded-full', plan?.hot ? 'bg-red-500' : plan?.warm ? 'bg-amber-500' : 'bg-[var(--accent)]')}
            style={{ width: `${plan?.limited ? 100 : (plan?.pct ?? 0)}%` }}
          />
        </span>
        <span className={cn('truncate text-[12px] tabular-nums', plan?.hot && 'font-medium text-red-500')}>{plan ? plan.label : 'Usage'}</span>
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        title={shortcut('Settings (⌘,)')}
        aria-label="Settings"
        className="no-drag rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/5"
      >
        <Settings className="size-4" />
      </button>
    </div>
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
