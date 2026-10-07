import { Command } from 'cmdk'
import {
  CalendarClock,
  Flame,
  FolderOpen,
  History,
  LayoutGrid,
  MessageSquare,
  MonitorPlay,
  Network,
  PanelLeft,
  Play,
  Plus,
  Settings,
  Square,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import type { CommandId } from '@shared/commands'
import { QUICK_ACTIONS } from '@/lib/actions'
import { HACKFORGE_ACTIONS } from '@/lib/hackforgeActions'
import { runCommand } from '@/lib/commands'
import { basename } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'

const COMMANDS: { id: CommandId; label: string; icon: LucideIcon; keys?: string }[] = [
  { id: 'new-session', label: 'New session…', icon: Plus, keys: '⌘O' },
  { id: 'view-chat', label: 'Go to Chat', icon: MessageSquare, keys: '⌘1' },
  { id: 'view-board', label: 'Go to Board', icon: LayoutGrid, keys: '⌘2' },
  { id: 'view-mission', label: 'Go to Mission control', icon: Network, keys: '⌘3' },
  { id: 'view-preview', label: 'Go to Preview', icon: MonitorPlay, keys: '⌘4' },
  { id: 'view-hackforge', label: 'Go to HackForge', icon: Flame, keys: '⌘5' },
  { id: 'event-mode', label: 'Event mode: hackathon clock, checklists, partners', icon: CalendarClock, keys: '⌘6' },
  { id: 'toggle-terminal', label: 'Toggle terminal', icon: SquareTerminal, keys: '⌘J' },
  { id: 'new-claude-terminal', label: 'New Claude terminal', icon: SquareTerminal, keys: '⇧⌘T' },
  { id: 'replay', label: 'Replay this session', icon: Play, keys: '⇧⌘R' },
  { id: 'interrupt', label: 'Stop the agent', icon: Square, keys: '⌘.' },
  { id: 'focus-mode', label: 'Toggle focus mode', icon: PanelLeft, keys: '⌘\\' },
  { id: 'settings', label: 'Settings', icon: Settings, keys: '⌘,' },
]

/** ⌘K: every command, session, project and quick action, fuzzy-searchable. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, order, sessions, history, settings, activeId, startSession, setActionForm, setView } = useApp()
  const openIds = new Set(order)
  const saved = history.filter((h) => h.title && !openIds.has(h.id)).slice(0, 30)
  const projects = settings?.recentProjects ?? []

  const run = (fn: () => void) => {
    setPaletteOpen(false)
    fn()
  }

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px]"
      contentClassName="fixed left-1/2 top-[14vh] z-50 w-[600px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
    >
      <Command.Input
        autoFocus
        placeholder="Type a command, session or project…"
        className="selectable w-full border-b border-line bg-transparent px-4 py-3 text-[14px] outline-none placeholder:text-muted"
      />
      <Command.List className="max-h-[56vh] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted">
        <Command.Empty className="px-3 py-6 text-center text-muted">Nothing matches.</Command.Empty>

        <Command.Group heading="Commands">
          {COMMANDS.map((c) => (
            <Row key={c.id} value={c.label} icon={c.icon} keys={c.keys} onSelect={() => run(() => runCommand({ id: c.id }))}>
              {c.label}
            </Row>
          ))}
        </Command.Group>

        {activeId && (
          <Command.Group heading="Ask Claude">
            {[...QUICK_ACTIONS, ...(settings?.hackforgeMode === 'off' ? [] : HACKFORGE_ACTIONS.map((a) => ({ ...a, label: `HackForge: ${a.label}` })))].map((a) => (
              <Row
                key={a.id}
                value={`${a.label} ${a.description}`}
                icon={a.icon}
                onSelect={() =>
                  run(() => {
                    setView('chat')
                    setActionForm(a.id)
                  })
                }
              >
                {a.label}
                <span className="ml-2 truncate text-[11.5px] text-muted">{a.description}</span>
              </Row>
            ))}
          </Command.Group>
        )}

        {order.length > 0 && (
          <Command.Group heading="Open sessions">
            {order.map((id) => (
              <Row key={id} value={`open ${sessions[id].title} ${sessions[id].cwd}`} icon={MessageSquare} onSelect={() => run(() => runCommand({ id: 'select-session', sessionId: id }))}>
                {sessions[id].title || 'New session'}
                <span className="ml-2 text-[11.5px] text-muted">{basename(sessions[id].cwd)}</span>
              </Row>
            ))}
          </Command.Group>
        )}

        {saved.length > 0 && (
          <Command.Group heading="History">
            {saved.map((h) => (
              <Row key={h.id} value={`history ${h.title} ${h.cwd}`} icon={History} onSelect={() => run(() => runCommand({ id: 'select-session', sessionId: h.id }))}>
                {h.title}
                <span className="ml-2 text-[11.5px] text-muted">
                  {basename(h.cwd)} · {relativeTime(h.updatedAt)}
                </span>
              </Row>
            ))}
          </Command.Group>
        )}

        {projects.length > 0 && (
          <Command.Group heading="New session in">
            {projects.map((dir) => (
              <Row key={dir} value={`project ${dir}`} icon={FolderOpen} onSelect={() => run(() => void startSession(dir))}>
                {basename(dir)}
                <span className="ml-2 truncate text-[11.5px] text-muted">{dir}</span>
              </Row>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  )
}

function Row({ value, icon: Icon, keys, onSelect, children }: { value: string; icon: LucideIcon; keys?: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] data-[selected=true]:bg-[var(--accent)]/10"
    >
      <Icon className="size-4 shrink-0 text-muted" />
      <span className="flex min-w-0 flex-1 items-baseline truncate">{children}</span>
      {keys && <kbd className="shrink-0 text-[11px] text-muted">{keys}</kbd>}
    </Command.Item>
  )
}
