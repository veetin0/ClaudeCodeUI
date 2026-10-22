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
import { useTeamReporter } from './stores/team'
import { useResetQueueRunner } from './stores/resetQueue'
import { HandoffDialog } from './features/team/HandoffDialog'
import { UsageView } from './features/usage/UsageView'
import { TeamRunView } from './features/run/TeamRunView'

const VIEW_KEYS: Record<string, CommandId> = { '1': 'view-chat', '2': 'view-board', '3': 'view-mission', '4': 'view-preview', '5': 'view-hackforge', '6': 'event-mode', '7': 'usage' }

export function App() {
  const session = useDisplaySession()
  const focusMode = useApp((s) => s.focusMode)
  const eventOpen = useApp((s) => s.eventOpen)
  const usageOpen = useApp((s) => s.usageOpen)
  const teamOpen = useApp((s) => s.teamOpen)
  useTeamReporter()
  useResetQueueRunner()

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
      if (app.settingsOpen) app.setSettingsOpen(false)
      else if (app.handoffFor) app.openHandoff(null)
      else if (app.usageOpen) app.setUsageOpen(false)
      else if (app.teamOpen && app.activeId) app.setTeamOpen(false)
      else if (app.eventOpen) app.setEventOpen(false)
      else if (app.replay) app.setReplay(null)
      else if (app.activeId && app.sessions[app.activeId]?.status === 'running') void app.interrupt()
    }
    window.addEventListener('keydown', onKey)
    // A file dropped outside a drop zone must not replace the app with that file.
    const noDrop = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', noDrop)
    window.addEventListener('drop', noDrop)
    return () => {
      offCommand()
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('dragover', noDrop)
      window.removeEventListener('drop', noDrop)
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
          <div className="flex min-w-0 flex-1 flex-col">
            {usageOpen ? <UsageView /> : eventOpen ? <EventView /> : teamOpen ? <TeamRunView /> : session ? <Conversation session={session} /> : <Welcome />}
          </div>
          {session && !focusMode && !eventOpen && !usageOpen && !teamOpen && <Inspector session={session} />}
        </div>
        <TerminalPanel />
      </main>
      <SettingsDialog />
      <HandoffDialog />
      <CommandPalette />
    </div>
  )
}
