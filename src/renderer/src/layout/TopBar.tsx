import { Flame, LayoutGrid, MessageSquare, MonitorPlay, Network, PanelLeft, SquareTerminal } from 'lucide-react'
import { ContextGauge } from '@/features/meters/ContextGauge'
import { useElapsed } from '@/features/meters/useElapsed'
import { basename, cn, formatCost, formatDuration, formatTokens } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useDisplaySession } from '@/stores/replay'
import { useHackforge } from '@/stores/hackforge'
import { StatusDot, STATUS_LABEL } from './StatusDot'

export function TopBar() {
  const session = useDisplaySession()
  const { focusMode, toggleFocusMode, view, setView, terminalOpen, toggleTerminalPanel } = useApp()
  const project = useApp((st) => (session ? st.projects[session.cwd] : undefined))
  const serverUp = useApp((st) => !!session && st.preview.servers.some((x) => x.cwd === session.cwd && x.status === 'ready'))
  const activeSubagents = session ? Object.values(session.subagents).filter((s) => s.status === 'running').length : 0
  const hf = useHackforge(session?.cwd)
  const hfMode = useApp((st) => st.settings?.hackforgeMode ?? 'projects')
  // Always offered (unless HackForge is off), so a fresh folder can be set up from there.
  const showHf = hfMode !== 'off'
  const elapsed = useElapsed(session?.status === 'running' || session?.status === 'waiting' ? session.turnStartedAt : undefined)

  return (
    <header
      className={cn('drag flex h-12 shrink-0 items-center gap-4 border-b border-line px-4 text-[12px]', focusMode && 'pl-20')}
    >
      <button onClick={toggleFocusMode} className="no-drag rounded p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10" title="Focus mode (⌘\)">
        <PanelLeft className="size-4" />
      </button>
      {session ? (
        <>
          <div className="min-w-0">
            <div className="max-w-[360px] truncate text-[13px] font-semibold" title={session.title || undefined}>
              {session.title || 'New session'}
            </div>
            <div className="truncate text-[11px] text-muted" title={session.cwd}>
              {basename(session.cwd)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-muted">
            <StatusDot status={session.status} />
            {session.live ? STATUS_LABEL[session.status] : 'Saved'}
            {elapsed > 0 && <span className="tabular-nums">· {formatDuration(elapsed)}</span>}
          </div>
          <div className="no-drag ml-2 flex rounded-lg bg-black/[0.05] p-0.5 dark:bg-white/[0.07]">
            <ViewButton active={view === 'chat'} onClick={() => setView('chat')} title="Conversation (⌘1)">
              <MessageSquare className="size-3.5" /> Chat
            </ViewButton>
            <ViewButton active={view === 'board'} onClick={() => setView('board')} title="Agent board (⌘2)">
              <LayoutGrid className="size-3.5" /> Board
              {activeSubagents > 0 && <span className="rounded-full bg-emerald-500 px-1.5 text-[10px] leading-4 text-white">{activeSubagents}</span>}
            </ViewButton>
            <ViewButton active={view === 'mission'} onClick={() => setView('mission')} title="Mission control: agent graph + timeline (⌘3)">
              <Network className="size-3.5" /> Mission
            </ViewButton>
            <ViewButton active={view === 'preview'} onClick={() => setView('preview')} title="Preview: Remotion Studio, dev servers (⌘4)">
              <MonitorPlay className="size-3.5" /> Preview
              {(serverUp || project?.remotion) && <span className={cn('size-1.5 rounded-full', serverUp ? 'bg-emerald-500' : 'bg-[var(--accent)]')} />}
            </ViewButton>
            {showHf && (
              <ViewButton active={view === 'hackforge'} onClick={() => setView('hackforge')} title="HackForge: phase, compliance, mock score, improvement loop (⌘5)">
                <Flame className="size-3.5" /> HackForge
                {hf?.loop?.active ? (
                  <span className="rounded-full bg-orange-500 px-1.5 text-[10px] leading-4 text-white tabular-nums">#{hf.loop.iteration}</span>
                ) : hf?.verify?.mockScore !== undefined ? (
                  <span className="text-[10.5px] tabular-nums text-muted">{hf.verify.mockScore.toFixed(1)}</span>
                ) : null}
              </ViewButton>
            )}
          </div>
          <div className="ml-auto flex items-center gap-4 text-muted">
            {session.model && <span className="hidden truncate lg:inline">{session.model}</span>}
            <ContextGauge used={session.contextTokens} total={session.contextWindow} />
            <span className="tabular-nums" title="Output tokens this session">
              ↑ {formatTokens(session.outputTokens)}
            </span>
            <span className="tabular-nums font-medium text-fg" title="Cost this session">
              {formatCost(session.totalCostUsd)}
            </span>
            <button
              onClick={toggleTerminalPanel}
              title="Terminal (⌘J)"
              className={cn('no-drag rounded p-1 hover:bg-black/5 dark:hover:bg-white/10', terminalOpen ? 'text-fg' : 'text-muted')}
            >
              <SquareTerminal className="size-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="font-semibold">Harness</div>
      )}
    </header>
  )
}

function ViewButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px]',
        active ? 'bg-surface font-medium text-fg shadow-sm' : 'text-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
