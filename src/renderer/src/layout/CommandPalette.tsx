import { Command } from 'cmdk'
import {
  Activity,
  BarChart3,
  Bot,
  CalendarClock,
  Handshake,
  Hammer,
  Home,
  Lightbulb,
  MousePointerClick,
  FolderOpen,
  History,
  LayoutGrid,
  MessageSquare,
  MonitorPlay,
  Network,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Presentation,
  Settings,
  Square,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import type { CommandId } from '@shared/commands'
import { actionMenuItems } from '@/lib/actionMenu'
import { runCommand } from '@/lib/commands'
import { useHackforge } from '@/stores/hackforge'
import type { AgentsMode, HackathonTab, SettingsTab } from '@/stores/app'
import { basename } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import { shortcut } from '@/lib/keys'

const COMMANDS: { id: CommandId; label: string; icon: LucideIcon; keys?: string }[] = [
  { id: 'new-session', label: 'New session…', icon: Plus, keys: shortcut('⌘O') },
  { id: 'home', label: 'Go Home', icon: Home, keys: shortcut('⇧⌘H') },
  { id: 'view-chat', label: 'Go to Chat', icon: MessageSquare, keys: shortcut('⌘1') },
  { id: 'view-agents', label: 'Go to Agents', icon: Bot, keys: shortcut('⌘2') },
  { id: 'view-preview', label: 'Go to Preview', icon: MonitorPlay, keys: shortcut('⌘3') },
  { id: 'hackathon', label: 'Go to the Hackathon', icon: Hammer, keys: shortcut('⌘4') },
  { id: 'toggle-panel', label: 'Toggle the side panel: tasks, files, agents', icon: PanelRight, keys: shortcut('⌘I') },
  { id: 'toggle-terminal', label: 'Toggle terminal', icon: SquareTerminal, keys: shortcut('⌘J') },
  { id: 'new-claude-terminal', label: 'New Claude terminal', icon: SquareTerminal, keys: shortcut('⇧⌘T') },
  { id: 'replay', label: 'Replay this session', icon: Play, keys: shortcut('⇧⌘R') },
  { id: 'interrupt', label: 'Stop the agent', icon: Square, keys: shortcut('⌘.') },
  { id: 'focus-mode', label: 'Toggle focus mode', icon: PanelLeft, keys: shortcut('⌘\\') },
  { id: 'handoff', label: 'Hand off this session to the team', icon: Handshake },
  { id: 'usage', label: 'Usage history: tokens per day and model, plan usage, the team', icon: BarChart3, keys: shortcut('⌘5') },
  { id: 'pick-element', label: 'Click to change: pick an element in the preview', icon: MousePointerClick },
  { id: 'settings', label: 'Settings', icon: Settings, keys: shortcut('⌘,') },
]

/** Places inside places: Hackathon tabs, Agents modes, Settings tabs. */
const PLACES: { label: string; icon: LucideIcon; go: () => void }[] = [
  ...(
    [
      ['build', 'Hackathon › Build: team run and HackForge score', Hammer],
      ['challenges', 'Hackathon › Challenges and partner APIs', Lightbulb],
      ['pitch', 'Hackathon › Pitch: script, narration, 3D clips', Presentation],
      ['schedule', 'Hackathon › Schedule: clock, team, checklists', CalendarClock],
    ] as [HackathonTab, string, LucideIcon][]
  ).map(([tab, label, icon]) => ({ label, icon, go: () => useApp.getState().openHackathon(tab) })),
  ...(
    [
      ['cards', 'Agents › Cards', LayoutGrid],
      ['graph', 'Agents › Graph and timeline (mission control)', Network],
      ['activity', 'Agents › Activity: every tool call', Activity],
    ] as [AgentsMode, string, LucideIcon][]
  ).map(([mode, label, icon]) => ({ label, icon, go: () => useApp.getState().setAgentsMode(mode) })),
  ...(
    [
      ['general', 'Settings › General: API key, models, notifications, phone'],
      ['team', 'Settings › Team: team server, terminal sessions'],
      ['tools', 'Settings › Tools: browser, docs, REA, Blender, design, HackForge'],
      ['advanced', 'Settings › Advanced: Usage saver, reset queue'],
    ] as [SettingsTab, string][]
  ).map(([tab, label]) => ({ label, icon: Settings, go: () => useApp.getState().setSettingsOpen(true, tab) })),
]

/** ⌘K: every command, place, session, project and action, fuzzy-searchable. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, order, sessions, history, settings, activeId, startSession, setActionForm, setView } = useApp()
  const active = activeId ? sessions[activeId] : null
  const hf = useHackforge(active?.cwd)
  const actions = active ? actionMenuItems({ hf, mode: settings?.hackforgeMode ?? 'projects', slashCommands: active.slashCommands }) : []
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

        <Command.Group heading="Places">
          {PLACES.map((p) => (
            <Row key={p.label} value={p.label} icon={p.icon} onSelect={() => run(p.go)}>
              {p.label}
            </Row>
          ))}
        </Command.Group>

        {actions.length > 0 && (
          <Command.Group heading="Ask Claude">
            {actions.flatMap((g) => g.actions.map((a) => ({ ...a, label: g.heading === 'HackForge' || g.heading === 'Suggested' ? `HackForge: ${a.label}` : a.label }))).map((a) => (
              <Row
                key={a.id}
                value={`${a.label} ${a.description}`}
                icon={a.icon}
                onSelect={() =>
                  run(() => {
                    if (activeId) useApp.getState().select(activeId)
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
