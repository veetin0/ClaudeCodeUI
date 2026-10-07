import { Plus, SquareTerminal, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { disposeTerminal, getTerminal } from './xtermRegistry'
import { shortcut } from '@/lib/keys'

/** Bottom panel of real terminals (⌘J). "Claude" opens the interactive CLI, which observe mode then visualizes. */
export function TerminalPanel() {
  const { terminals, activeTerminal, terminalOpen, terminalHeight, openTerminal, closeTerminal, selectTerminal, toggleTerminalPanel, setTerminalHeight } = useApp()
  if (!terminalOpen || terminals.length === 0) return null

  const startDrag = (e: React.MouseEvent) => {
    const startY = e.clientY
    const startH = terminalHeight
    const move = (ev: MouseEvent) => setTerminalHeight(startH + (startY - ev.clientY))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div className="relative flex shrink-0 flex-col border-t border-line bg-surface" style={{ height: terminalHeight }}>
      <div onMouseDown={startDrag} className="absolute inset-x-0 -top-1 h-2 cursor-row-resize" />
      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        {terminals.map((t) => (
          <div
            key={t.id}
            onClick={() => selectTerminal(t.id)}
            className={cn(
              'group flex cursor-default items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px]',
              t.id === activeTerminal ? 'bg-surface-2 font-medium' : 'text-muted hover:text-fg',
            )}
          >
            {t.title === 'claude' ? <span className="text-[var(--accent)]">✳︎</span> : <SquareTerminal className="size-3" />}
            {t.title}
            {t.exitCode !== undefined && <span className="text-muted">(exited)</span>}
            <button
              onClick={(e) => {
                e.stopPropagation()
                disposeTerminal(t.id)
                closeTerminal(t.id)
              }}
              className="invisible rounded p-0.5 hover:bg-black/10 group-hover:visible dark:hover:bg-white/10"
              title="Close terminal"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button onClick={() => void openTerminal()} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" title="New shell">
          <Plus className="size-3.5" />
        </button>
        <button
          onClick={() => void openTerminal('claude')}
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg"
          title="Run the interactive Claude Code CLI here; it shows up as a watched session"
        >
          <span className="text-[var(--accent)]">✳︎</span> Claude
        </button>
        <button onClick={toggleTerminalPanel} className="ml-auto rounded p-1 text-muted hover:bg-surface-2 hover:text-fg" title={shortcut('Hide (⌘J)')}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 px-2 pt-1">
        {terminals.map((t) => (
          <TerminalView key={t.id} id={t.id} visible={t.id === activeTerminal} height={terminalHeight} />
        ))}
      </div>
    </div>
  )
}

function TerminalView({ id, visible, height }: { id: string; visible: boolean; height: number }) {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const { el } = getTerminal(id)
    host.current?.appendChild(el)
    return () => {
      el.remove()
    }
  }, [id])

  // Refit whenever the panel resizes or this tab becomes visible.
  useEffect(() => {
    if (!visible || !host.current) return
    const { fit, term } = getTerminal(id)
    const doFit = () => {
      try {
        fit.fit()
      } catch {
        // not laid out yet
      }
    }
    const ro = new ResizeObserver(doFit)
    ro.observe(host.current)
    doFit()
    term.focus()
    return () => ro.disconnect()
  }, [id, visible, height])

  return <div ref={host} className={cn('h-full', !visible && 'hidden')} />
}
