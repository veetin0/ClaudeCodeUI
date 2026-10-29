import { ChevronDown, Flame, FolderOpen, Home, Plus, Rocket, Search, Settings, SquareTerminal, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SessionSummary } from '@shared/ipc'
import { basename, cn, formatCost } from '@/lib/format'
import { dateGroup, relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useHackathonSummary } from '@/features/hackathon/summary'
import { Menu, menuItems } from '@/ui/Menu'
import { Sectors, SectorMeter, type SectorTone } from '@/ui/Sectors'
import { RUN_STAGES } from '@shared/run'
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
    <aside className="rail flex w-60 shrink-0 flex-col">
      {/* Room for the macOS traffic lights; Windows has a normal title bar above. */}
      <div className={isMac ? 'drag h-12 shrink-0' : 'h-3 shrink-0'} />
      <nav className="space-y-px px-2">
        <NavRow icon={<Home className="size-4 text-muted" aria-hidden />} active={place === 'home'} onClick={goHome} keys={shortcut('⇧⌘H')}>
          Home
        </NavRow>
        <HackathonRow />
        <NewSessionRow />
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {(order.length > 0 || groups.length > 0 || query) && <SectionLabel>Sessions</SectionLabel>}
        {history.length > 6 && (
          <label className="mb-1.5 flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 focus-within:bg-active">
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
            <div className="label-caps px-2.5 pb-1 pt-2 text-[11px]">{g.label}</div>
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
        'no-drag flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left font-medium text-fg/90 hover:bg-hover',
        active && 'bg-active text-fg',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {keys && <kbd className="num text-[12px] font-normal text-muted">{keys}</kbd>}
    </button>
  )
}

/** The hackathon: team run and event in one row, with the race clock and the run as five sectors. */
function HackathonRow() {
  const h = useHackathonSummary()
  const open = useApp((s) => s.place === 'hackathon')
  const at = RUN_STAGES.indexOf(h.stage)
  const sectors = RUN_STAGES.map((_, i): { tone: SectorTone } => ({ tone: i < at ? 'done' : i === at ? (h.inbox > 0 ? 'wait' : 'live') : 'todo' }))
  return (
    <button
      onClick={() => useApp.getState().openHackathon()}
      title={shortcut('Hackathon: team run, challenges, pitch and schedule (⌘4)')}
      className={cn('no-drag flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-hover', open && 'bg-active')}
    >
      <Rocket className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
          {h.inbox > 0 && <span className="num rounded-sm bg-warn px-1.5 text-[12px] font-semibold leading-[18px] text-rail">{h.inbox}</span>}
        </span>
        <span className="mt-0.5 flex items-baseline gap-2 text-[12px]">
          <span className="min-w-0 flex-1 truncate text-muted">{h.status}</span>
          {h.countdown && <span className={cn('num shrink-0 font-semibold', h.urgent ? 'text-danger-ink' : 'text-fg/80')}>{h.countdown}</span>}
        </span>
        {h.active && <Sectors items={sectors} height={3} className="mt-2" label={`Team run: ${h.status}`} />}
      </span>
    </button>
  )
}

/** New session (a folder picker); its ▾ starts one in a recent folder or a new HackForge project. */
function NewSessionRow() {
  const { settings, openProject, startSession, order, sessions } = useApp()
  const openDirs = new Set(order.map((id) => sessions[id].cwd))
  const recents = (settings?.recentProjects ?? []).filter((d) => !openDirs.has(d)).slice(0, 6)
  return (
    <div className="group flex h-8 items-center rounded-md hover:bg-hover">
      <button onClick={() => void openProject()} className="no-drag flex h-full min-w-0 flex-1 items-center gap-2.5 whitespace-nowrap px-2.5 text-left font-medium text-fg/90">
        <Plus className="size-4 text-muted" aria-hidden />
        New session
        <kbd className="num ml-auto text-[12px] font-normal text-muted">{shortcut('⌘O')}</kbd>
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

/** Plan usage as twenty sectors (opens Usage), and Settings. */
function Footer() {
  const plan = usePlanUsage()
  const { setUsageOpen, setSettingsOpen } = useApp()
  const pct = plan?.limited ? 100 : (plan?.pct ?? 0)
  return (
    <div className="flex items-center gap-1 border-t border-line px-2 py-2">
      <button
        onClick={() => setUsageOpen(true)}
        title={shortcut('Usage history (⌘5)')}
        className="no-drag flex min-w-0 flex-1 flex-col gap-1.5 rounded-md px-2.5 py-1.5 text-left hover:bg-hover"
      >
        <span className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-muted">{plan ? 'Plan · 5 hours' : 'Usage'}</span>
          {plan && (
            <span className={cn('num font-semibold', plan.hot ? 'text-danger-ink' : plan.warm ? 'text-warn-ink' : 'text-fg')}>
              {plan.limited ? 'Limit' : plan.pct !== undefined ? `${plan.pct}%` : 'Near'}
            </span>
          )}
        </span>
        {plan && <SectorMeter value={pct / 100} tone={plan.hot ? 'fail' : plan.warm ? 'wait' : 'best'} height={3} label="Plan usage, 5-hour window" />}
      </button>
      <button
        onClick={() => setSettingsOpen(true)}
        title={shortcut('Settings (⌘,)')}
        aria-label="Settings"
        className="no-drag self-stretch rounded-md px-2 text-muted hover:bg-hover hover:text-fg"
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
        'group flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5',
        active ? 'bg-active' : 'hover:bg-hover',
      )}
    >
      <StatusDot status={s.status} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate font-medium">
          {s.observed && <SquareTerminal className="size-3 shrink-0 text-muted" aria-label="Terminal session" />}
          <span className="truncate">{s.title || 'New session'}</span>
        </div>
        <div className={cn('truncate text-[12px]', waiting ? 'text-warn-ink' : 'text-muted')}>
          {basename(s.cwd)} · {waiting ? `${s.permissions.length} waiting for approval` : !s.live ? 'Saved' : s.observed ? `Terminal · ${STATUS_LABEL[s.status]}` : STATUS_LABEL[s.status]}
        </div>
      </div>
      {s.totalCostUsd > 0 && <span className="num shrink-0 text-[12px] text-muted group-hover:hidden">{formatCost(s.totalCostUsd)}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label="Close session"
        className="hidden rounded p-0.5 text-muted hover:bg-active hover:text-fg group-hover:block"
        title={s.live && !s.observed ? 'Stop and close (stays in history)' : 'Close'}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function HistoryRow({ h, onOpen, onDelete }: { h: SessionSummary; onOpen: () => void; onDelete: () => void }) {
  return (
    <div onClick={onOpen} className="group flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-fg/85 hover:bg-hover hover:text-fg">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 truncate">
          {h.observed && <SquareTerminal className="size-3 shrink-0 text-muted" aria-label="Terminal session" />}
          <span className="truncate">{h.title || 'Untitled session'}</span>
        </div>
        <div className="truncate text-[12px] text-muted">
          {basename(h.cwd)} · {relativeTime(h.updatedAt)}
        </div>
      </div>
      {h.costUsd > 0 && <span className="num shrink-0 text-[12px] text-muted group-hover:hidden">{formatCost(h.costUsd)}</span>}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete from history"
        className="hidden rounded p-0.5 text-muted hover:bg-active hover:text-danger-ink group-hover:block"
        title="Delete from history"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('label-caps mb-1 px-2.5', className)}>{children}</div>
}
