import { useEffect } from 'react'
import { Inspector } from './layout/Inspector'
import { Sidebar } from './layout/Sidebar'
import { TopBar } from './layout/TopBar'
import { Conversation } from './features/conversation/Conversation'
import { Welcome } from './features/conversation/Welcome'
import { SettingsDialog } from './layout/SettingsDialog'
import { TerminalPanel } from './features/terminal/TerminalPanel'
import { useApp } from './stores/app'
import { useDisplaySession } from './stores/replay'
import { runCommand } from './lib/commands'
import type { CommandId } from '@shared/commands'
import { CommandPalette } from './layout/CommandPalette'
import { EventView } from './features/event/EventView'

const VIEW_KEYS: Record<string, CommandId> = { '1': 'view-chat', '2': 'view-board', '3': 'view-mission', '4': 'view-preview', '5': 'view-hackforge', '6': 'event-mode' }

export function App() {
  const session = useDisplaySession()
  const focusMode = useApp((s) => s.focusMode)
  const eventOpen = useApp((s) => s.eventOpen)

  useEffect(() => {
    void useApp.getState().init()
    const offCommand = window.harness.onCommand(runCommand)
    // Most shortcuts live in the native menu; the view switches (⌘1–⌘5) and Escape are handled here.
    const onKey = (e: KeyboardEvent) => {
      const view = VIEW_KEYS[e.key]
      if (view && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        runCommand({ id: view })
        return
      }
      const app = useApp.getState()
      if (e.key !== 'Escape' || app.detailAgent || app.diffPath || app.paletteOpen) return
      if (app.eventOpen) app.setEventOpen(false)
      else if (app.replay) app.setReplay(null)
      else if (app.activeId && app.sessions[app.activeId]?.status === 'running') void app.interrupt()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      offCommand()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  // Notifications about the session you're looking at are pointless.
  const activeId = useApp((s) => s.activeId)
  useEffect(() => window.harness.setActiveSession(activeId), [activeId])

  return (
    <div className="flex h-full">
      {!focusMode && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col bg-surface shadow-[-1px_0_0_var(--line)]">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{eventOpen ? <EventView /> : session ? <Conversation session={session} /> : <Welcome />}</div>
          {session && !focusMode && !eventOpen && <Inspector session={session} />}
        </div>
        <TerminalPanel />
      </main>
      <SettingsDialog />
      <CommandPalette />
    </div>
  )
}
