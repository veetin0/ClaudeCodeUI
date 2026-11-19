import { useEffect } from 'react'
import { SidePanel } from './layout/SidePanel'
import { Sidebar } from './layout/Sidebar'
import { TopBar } from './layout/TopBar'
import { Conversation } from './features/conversation/Conversation'
import { Home } from './features/home/Home'
import { ProjectView } from './features/project/ProjectView'
import { SettingsDialog } from './layout/SettingsDialog'
import { TerminalPanel } from './features/terminal/TerminalPanel'
import { useApp } from './stores/app'
import { useDisplaySession } from './stores/replay'
import { runCommand } from './lib/commands'
import type { CommandId } from '@shared/commands'
import { CommandPalette } from './layout/CommandPalette'
import { useResetQueueRunner } from './stores/resetQueue'
import { UsageSheet } from './features/usage/UsageView'
import { applyTheme } from './lib/theme'

const VIEW_KEYS: Record<string, CommandId> = { '1': 'view-chat', '2': 'view-agents', '3': 'view-preview', '4': 'project', '5': 'usage' }

export function App() {
  const session = useDisplaySession()
  const focusMode = useApp((s) => s.focusMode)
  const place = useApp((s) => s.place)
  const panelOpen = useApp((s) => s.panelOpen)
  const usageOpen = useApp((s) => s.usageOpen)
  useResetQueueRunner()

  useEffect(() => {
    void useApp.getState().init()
    const offCommand = window.harness.onCommand(runCommand)
    // Most shortcuts live in the native menu; the place and view switches and Escape are handled here.
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const view = VIEW_KEYS[e.key]
      if (view && mod && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        runCommand({ id: view })
        return
      }
      if (mod && !e.altKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault()
        runCommand({ id: 'home' })
        return
      }
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        runCommand({ id: 'toggle-panel' })
        return
      }
      const app = useApp.getState()
      if (e.key !== 'Escape' || app.detailAgent || app.diffPath || app.paletteOpen) return
      if (app.settingsOpen) app.setSettingsOpen(false)
      else if (app.usageOpen) app.setUsageOpen(false)
      else if (app.actionForm && app.place === 'session') app.setActionForm(null)
      else if (app.place === 'project' && app.activeId) app.leaveProject()
      else if (app.replay) app.setReplay(null)
      else if (app.place === 'session' && app.activeId && app.sessions[app.activeId]?.status === 'running') void app.interrupt()
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
  const watching = place === 'session' ? activeId : null
  useEffect(() => window.harness.setActiveSession(watching), [watching])

  const theme = useApp((s) => s.settings?.theme)
  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  const inSession = place === 'session' && !!session
  return (
    <div className="flex h-full">
      {!focusMode && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col bg-surface shadow-[-1px_0_0_var(--line)]">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{place === 'project' ? <ProjectView /> : inSession ? <Conversation session={session} /> : <Home />}</div>
          {inSession && panelOpen && !focusMode && <SidePanel session={session} />}
        </div>
        <TerminalPanel />
      </main>
      {usageOpen && <UsageSheet />}
      <SettingsDialog />
      <CommandPalette />
    </div>
  )
}
