import { Bot, Handshake, MessageSquare, MonitorPlay, MousePointerClick, PanelLeft, PanelRight, Play, SquareTerminal } from 'lucide-react'
import { useElapsed } from '@/features/meters/useElapsed'
import { HackathonBar } from '@/features/hackathon/HackathonView'
import { basename, cn, formatDuration } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useDisplaySession } from '@/stores/replay'
import type { SessionState } from '@/stores/reducer'
import { Menu, menuItems } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { StatusDot, STATUS_LABEL } from './StatusDot'
import { StatusChip } from './StatusChip'
import { isMac, shortcut } from '@/lib/keys'
import { runCommand } from '@/lib/commands'

export function TopBar() {
  const session = useDisplaySession()
  const place = useApp((s) => s.place)
  const focusMode = useApp((s) => s.focusMode)
  return (
    <header className={cn('flex h-12 shrink-0 items-center gap-3 border-b border-line px-4 text-[12px]', isMac && 'drag', isMac && focusMode && 'pl-20')}>
      {focusMode && (
        <button onClick={() => runCommand({ id: 'focus-mode' })} className="no-drag rounded p-1 text-muted hover:bg-hover" title={shortcut('Show the sidebar (⌘\\)')}>
          <PanelLeft className="size-4" />
        </button>
      )}
      {place === 'hackathon' ? <HackathonBar /> : place === 'session' && session ? <SessionBar session={session} /> : <div className="text-[13px] font-semibold">Home</div>}
    </header>
  )
}

function SessionBar({ session }: { session: SessionState }) {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const project = useApp((st) => st.projects[session.cwd])
  const serverUp = useApp((st) => st.preview.servers.some((x) => x.cwd === session.cwd && x.status === 'ready'))
  const running = Object.values(session.subagents).filter((s) => s.status === 'running').length
  const elapsed = useElapsed(session.status === 'running' || session.status === 'waiting' ? session.turnStartedAt : undefined)
  return (
    <>
      <div className="min-w-0 max-w-[340px]">
        <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold" title={session.title || undefined}>
          <StatusDot status={session.status} />
          <span className="truncate">{session.title || 'New session'}</span>
        </div>
        <div className="truncate text-[12px] text-muted" title={session.cwd}>
          {basename(session.cwd)} · {session.live ? STATUS_LABEL[session.status] : 'Saved'}
          {elapsed > 0 && <span className="num text-[12px] text-fg/80"> · {formatDuration(elapsed)}</span>}
        </div>
      </div>
      <Segmented
        className="ml-2"
        label="Session views"
        value={view}
        onChange={setView}
        options={[
          { id: 'chat', label: 'Chat', icon: MessageSquare, title: shortcut('Conversation (⌘1)') },
          { id: 'agents', label: 'Agents', icon: Bot, badge: running || undefined, title: shortcut('Agents: cards, graph and activity (⌘2)') },
          { id: 'preview', label: 'Preview', icon: MonitorPlay, dot: serverUp ? 'live' : project?.remotion ? 'ready' : undefined, title: shortcut('Preview: your app, Remotion, 3D models (⌘3)') },
        ]}
      />
      <div className="ml-auto flex items-center gap-1">
        <StatusChip session={session} />
        <PanelChip session={session} />
        <MoreMenu session={session} />
      </div>
    </>
  )
}

/** Toggles the side panel; shows what's in it (open tasks, changed files, running agents). */
function PanelChip({ session }: { session: SessionState }) {
  const open = useApp((s) => s.panelOpen)
  const togglePanel = useApp((s) => s.togglePanel)
  const tasks = session.todos.filter((t) => t.status !== 'completed').length
  const files = session.changes.length
  const agents = Object.values(session.subagents).filter((s) => s.status === 'running').length
  const parts = [tasks && `${tasks} task${tasks === 1 ? '' : 's'}`, files && `${files} file${files === 1 ? '' : 's'}`, agents && `${agents} agent${agents === 1 ? '' : 's'}`].filter(Boolean)
  return (
    <button
      onClick={() => togglePanel()}
      title={shortcut('Side panel: tasks, changed files, agents (⌘I)')}
      aria-label="Side panel"
      aria-pressed={open}
      className={cn('no-drag flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 hover:bg-hover', open ? 'bg-active text-fg' : 'text-muted')}
    >
      <PanelRight className="size-4" />
      {parts.length > 0 && <span className="num hidden text-[13px] min-[1180px]:inline">{parts.join(' · ')}</span>}
    </button>
  )
}

function MoreMenu({ session }: { session: SessionState }) {
  const terminalOpen = useApp((s) => s.terminalOpen)
  const replaying = useApp((s) => s.replay?.sessionId === session.id)
  return (
    <Menu
      items={menuItems(
        { label: terminalOpen ? 'Hide terminal' : 'Terminal', icon: SquareTerminal, keys: shortcut('⌘J'), onSelect: () => runCommand({ id: 'toggle-terminal' }) },
        { label: 'New Claude terminal', icon: SquareTerminal, keys: shortcut('⇧⌘T'), onSelect: () => runCommand({ id: 'new-claude-terminal' }) },
        'separator',
        { label: replaying ? 'Stop replay' : 'Replay this session', icon: Play, keys: shortcut('⇧⌘R'), onSelect: () => runCommand({ id: 'replay' }) },
        session.live && !session.observed && { label: 'Hand off to the team', icon: Handshake, onSelect: () => runCommand({ id: 'handoff' }) },
        { label: 'Click to change', icon: MousePointerClick, hint: 'Pick an element in the preview', onSelect: () => runCommand({ id: 'pick-element' }) },
        'separator',
        { label: 'Focus mode', icon: PanelLeft, keys: shortcut('⌘\\'), onSelect: () => runCommand({ id: 'focus-mode' }) },
      )}
    />
  )
}
