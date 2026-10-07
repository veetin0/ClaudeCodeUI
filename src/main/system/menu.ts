import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import type { CommandMessage, CommandId } from '@shared/commands'
import { IPC } from '@shared/ipc'

/** Sends a command to the front window (creating focus if needed). */
export function sendCommand(cmd: CommandMessage) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.webContents.send(IPC.command, cmd)
}

const item = (label: string, id: CommandId, accelerator?: string, registerAccelerator = true): MenuItemConstructorOptions => ({
  label,
  accelerator,
  registerAccelerator,
  click: () => sendCommand({ id }),
})

/** View switches are handled by the page's own key listener (reliable whatever has focus); the menu only shows them. */
const viewItem = (label: string, id: CommandId, accelerator: string) => item(label, id, accelerator, false)

/**
 * The macOS application menu. Besides discoverability it is what makes ⌘C/⌘V/⌘Z work in text
 * fields (Electron routes those through the Edit menu's roles).
 */
export function installMenu() {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              item('Settings…', 'settings', 'CmdOrCtrl+,'),
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('New Session…', 'new-session', 'CmdOrCtrl+O'),
        item('New Terminal', 'new-terminal', 'CmdOrCtrl+T'),
        item('New Claude Terminal', 'new-claude-terminal', 'CmdOrCtrl+Shift+T'),
        { type: 'separator' },
        item('Replay Session', 'replay', 'CmdOrCtrl+Shift+R'),
        item('Stop Agent', 'interrupt', 'CmdOrCtrl+.'),
        { type: 'separator' },
        item('Close Session', 'close-session', 'CmdOrCtrl+Shift+W'),
        ...(isMac ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, item('Settings…', 'settings', 'CmdOrCtrl+,'), { role: 'quit' } as MenuItemConstructorOptions]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        item('Command Palette…', 'palette', 'CmdOrCtrl+K'),
        { type: 'separator' },
        viewItem('Chat', 'view-chat', 'CmdOrCtrl+1'),
        viewItem('Board', 'view-board', 'CmdOrCtrl+2'),
        viewItem('Mission Control', 'view-mission', 'CmdOrCtrl+3'),
        viewItem('Preview', 'view-preview', 'CmdOrCtrl+4'),
        viewItem('HackForge', 'view-hackforge', 'CmdOrCtrl+5'),
        viewItem('Event Mode', 'event-mode', 'CmdOrCtrl+6'),
        { type: 'separator' },
        item('Toggle Terminal', 'toggle-terminal', 'CmdOrCtrl+J'),
        item('Focus Mode', 'focus-mode', 'CmdOrCtrl+\\'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' } as MenuItemConstructorOptions, { role: 'reload' } as MenuItemConstructorOptions, { role: 'toggleDevTools' } as MenuItemConstructorOptions]),
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
