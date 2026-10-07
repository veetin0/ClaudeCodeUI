import { app, BrowserWindow, Menu, nativeImage, Notification, Tray, type MenuItemConstructorOptions } from 'electron'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { HarnessEvent, SessionStatus } from '@shared/events'
import type { EventBus } from '../events/bus'
import { sendCommand } from './menu'
import trayIcon1x from '../../../resources/trayTemplate.png?asset'
import trayIcon2x from '../../../resources/trayTemplate@2x.png?asset'
import appIconPath from '../../../resources/icon.png?asset'

interface Deps {
  bus: EventBus
  /** Title/project for a session id (from the store). */
  describe: (sessionId: string) => { title: string; project: string } | null
  notificationsEnabled: () => boolean
}

const STATUS_TEXT: Partial<Record<SessionStatus, string>> = { running: 'working', waiting: 'needs you', compacting: 'compacting' }
/** Don't announce quick back-and-forth turns; only ones long enough that you looked away. */
const NOTIFY_TURNS_LONGER_THAN_MS = 15_000

/**
 * How Harness reaches you when it isn't in front: macOS notifications (approval needed, turn
 * finished), the dock badge, and a menu-bar item listing what's running.
 */
export class Presence {
  private status = new Map<string, SessionStatus>()
  private tray: Tray | null = null
  private activeSession: string | null = null

  constructor(private readonly deps: Deps) {
    deps.bus.subscribe((e) => this.onEvent(e))
  }

  setActiveSession(id: string | null) {
    this.activeSession = id
  }

  createTray() {
    try {
      this.tray = new Tray(this.trayImage())
      this.tray.setToolTip('Harness')
      this.refreshTray()
    } catch (err) {
      // The menu-bar item is a nicety; never let it stop the app from starting.
      console.error('Menu-bar item unavailable:', err)
    }
  }

  private trayImage() {
    // Template images are a macOS idea (black, recoloured by the menu bar); elsewhere use the colour icon.
    if (process.platform !== 'darwin') return nativeImage.createFromPath(appIconPath).resize({ width: 16, height: 16, quality: 'best' })
    const image = nativeImage.createEmpty()
    image.addRepresentation({ scaleFactor: 1, buffer: readFileSync(trayIcon1x) })
    image.addRepresentation({ scaleFactor: 2, buffer: readFileSync(trayIcon2x) })
    image.setTemplateImage(true)
    return image
  }

  destroy() {
    this.tray?.destroy()
  }

  private onEvent(e: HarnessEvent) {
    if (e.type === 'status') {
      const prev = this.status.get(e.sessionId)
      if (e.status === 'closed') this.status.delete(e.sessionId)
      else this.status.set(e.sessionId, e.status)
      if (prev !== e.status) {
        this.refreshTray()
        this.refreshBadge()
        // Observed terminal sessions report approval waits via hooks, not permission events.
        if (e.status === 'waiting' && e.sessionId.startsWith('obs-')) this.notify(e.sessionId, 'Claude needs your approval', 'In your terminal session')
      }
    } else if (e.type === 'permission.request') {
      this.notify(e.sessionId, 'Claude needs your approval', `${e.toolName}${e.agentId ? ' (subagent)' : ''}`)
    } else if (e.type === 'turn.end' && e.durationMs > NOTIFY_TURNS_LONGER_THAN_MS) {
      this.notify(e.sessionId, e.isError ? 'Claude stopped' : 'Claude finished', e.result ? e.result.replace(/\s+/g, ' ').slice(0, 140) : `after ${Math.round(e.durationMs / 1000)}s`)
    }
  }

  private notify(sessionId: string, title: string, body: string) {
    if (!this.deps.notificationsEnabled() || !Notification.isSupported()) return
    // You're already looking at it.
    if (BrowserWindow.getFocusedWindow() && this.activeSession === sessionId) return
    const d = this.deps.describe(sessionId)
    const n = new Notification({ title, subtitle: d ? `${d.title || 'Session'} · ${d.project}` : undefined, body, silent: false })
    n.on('click', () => sendCommand({ id: 'select-session', sessionId }))
    n.show()
  }

  private refreshBadge() {
    const waiting = [...this.status.values()].filter((s) => s === 'waiting').length
    app.dock?.setBadge(waiting ? String(waiting) : '')
    if (waiting && !BrowserWindow.getFocusedWindow()) {
      app.dock?.bounce('informational')
      // Windows/Linux: flash the taskbar button instead.
      if (process.platform !== 'darwin') BrowserWindow.getAllWindows()[0]?.flashFrame(true)
    }
  }

  private refreshTray() {
    if (!this.tray) return
    const active = [...this.status.entries()].filter(([, s]) => s === 'running' || s === 'waiting' || s === 'compacting')
    const waiting = active.filter(([, s]) => s === 'waiting').length
    // A count next to the icon: "2" working, "!" when something needs you.
    this.tray.setTitle(waiting ? `${waiting}!` : active.length ? String(active.length) : '')
    const sessions: MenuItemConstructorOptions[] = active.map(([id, s]) => {
      const d = this.deps.describe(id)
      return {
        label: `${s === 'waiting' ? '● ' : ''}${(d?.title || 'Session').slice(0, 48)}`,
        sublabel: `${d?.project ?? ''} · ${STATUS_TEXT[s] ?? s}`,
        click: () => sendCommand({ id: 'select-session', sessionId: id }),
      }
    })
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: active.length ? `${active.length} session${active.length > 1 ? 's' : ''} active` : 'No sessions running', enabled: false },
        ...sessions,
        { type: 'separator' },
        { label: 'New Session…', click: () => sendCommand({ id: 'new-session' }) },
        { label: 'Show Harness', click: () => BrowserWindow.getAllWindows()[0]?.show() },
        { type: 'separator' },
        { role: 'quit' },
      ]),
    )
  }
}

export const projectName = (cwd: string) => basename(cwd)
