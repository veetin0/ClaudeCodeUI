import type { CommandMessage } from '@shared/commands'
import { useApp } from '@/stores/app'

/** Runs an app command (from the menu, the palette, a shortcut or a notification click). */
export function runCommand(cmd: CommandMessage) {
  const app = useApp.getState()
  switch (cmd.id) {
    case 'select-session':
      if (app.sessions[cmd.sessionId]) app.select(cmd.sessionId)
      else void app.openSaved(cmd.sessionId)
      return
    case 'new-session':
      return void app.openProject()
    case 'close-session':
      if (app.activeId) void app.closeSession(app.activeId)
      return
    case 'home':
      return app.goHome()
    case 'view-chat':
      return app.setView('chat')
    case 'view-agents':
      return app.setView('agents')
    case 'view-preview':
      return app.setView('preview')
    case 'hackathon':
      return app.place === 'hackathon' ? app.leaveHackathon() : app.openHackathon()
    case 'toggle-panel':
      return app.togglePanel()
    case 'toggle-terminal':
      return app.toggleTerminalPanel()
    case 'new-terminal':
      return void app.openTerminal()
    case 'new-claude-terminal':
      return void app.openTerminal('claude')
    case 'focus-mode':
      return app.toggleFocusMode()
    case 'settings':
      return app.setSettingsOpen(true)
    case 'palette':
      return app.setPaletteOpen(!app.paletteOpen)
    case 'replay':
      return app.replay ? app.setReplay(null) : app.startReplay()
    case 'interrupt':
      return void app.interrupt()
    case 'handoff':
      if (app.activeId) app.openHandoff(app.activeId)
      return
    case 'usage':
      return app.setUsageOpen(!app.usageOpen)
    case 'pick-element':
      app.setView('preview')
      window.dispatchEvent(new CustomEvent('harness:pick-element'))
      return
  }
}
