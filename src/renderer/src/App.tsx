import { useEffect } from 'react'
import { Inspector } from './layout/Inspector'
import { Sidebar } from './layout/Sidebar'
import { TopBar } from './layout/TopBar'
import { Conversation } from './features/conversation/Conversation'
import { Welcome } from './features/conversation/Welcome'
import { SettingsDialog } from './layout/SettingsDialog'
import { useActiveSession, useApp } from './stores/app'

export function App() {
  const session = useActiveSession()
  const focusMode = useApp((s) => s.focusMode)

  useEffect(() => {
    void useApp.getState().init()
    const onKey = (e: KeyboardEvent) => {
      const app = useApp.getState()
      if (e.metaKey && e.key === '\\') {
        e.preventDefault()
        app.toggleFocusMode()
      } else if (e.metaKey && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void app.openProject()
      } else if (e.metaKey && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        app.setView((['chat', 'board', 'mission'] as const)[Number(e.key) - 1])
      } else if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        app.setView('mission')
      } else if (e.metaKey && e.key === ',') {
        e.preventDefault()
        app.setSettingsOpen(true)
      } else if (e.key === 'Escape' && !app.detailAgent && !app.diffPath && app.activeId && app.sessions[app.activeId]?.status === 'running') {
        void app.interrupt()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full">
      {!focusMode && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col bg-surface shadow-[-1px_0_0_var(--line)]">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">{session ? <Conversation session={session} /> : <Welcome />}</div>
          {session && !focusMode && <Inspector session={session} />}
        </div>
      </main>
      <SettingsDialog />
    </div>
  )
}
