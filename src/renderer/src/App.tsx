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
      } else if (e.metaKey && (e.key === '1' || e.key === '2')) {
        e.preventDefault()
        app.setView(e.key === '1' ? 'chat' : 'board')
      } else if (e.metaKey && e.key === ',') {
        e.preventDefault()
        app.setSettingsOpen(true)
      } else if (e.key === 'Escape' && !app.detailAgent && app.activeId && app.sessions[app.activeId]?.status === 'running') {
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
