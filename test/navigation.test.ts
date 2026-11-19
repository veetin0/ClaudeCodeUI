import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@shared/ipc'

// The store talks to the main process through window.harness; stand in for it.
let n = 0
const harness = {
  startSession: vi.fn(async ({ cwd }: { cwd: string }): Promise<SessionSummary> => ({ id: `s${++n}`, cwd, title: '', createdAt: 0, updatedAt: 0, costUsd: 0 })),
  closeSession: vi.fn(async () => {}),
  getSettings: vi.fn(async () => null),
  previewDetect: vi.fn(async () => ({})),
  listHistory: vi.fn(async () => []),
}
;(globalThis as unknown as { window: unknown }).window = { harness, dispatchEvent: () => true }
const { useApp } = await import('../src/renderer/src/stores/app')
const { runCommand } = await import('../src/renderer/src/lib/commands')

const app = () => useApp.getState()

describe('three places', () => {
  beforeEach(async () => {
    for (const id of [...app().order]) await app().closeSession(id)
    useApp.setState({ place: 'home', view: 'chat', agentsMode: 'cards', panelOpen: false, usageOpen: false, settingsOpen: false })
  })

  it('starts at Home; views need a session', () => {
    expect(app().place).toBe('home')
    app().setView('agents')
    expect(app().place).toBe('home')
  })

  it('opens the Project and goes back where you were', async () => {
    app().openProject()
    expect(app().place).toBe('project')
    app().leaveProject()
    expect(app().place).toBe('home')
    await app().startSession('/p')
    expect(app().place).toBe('session')
    app().openProject()
    expect(app().place).toBe('project')
    app().leaveProject()
    expect(app().place).toBe('session')
  })

  it('switches views and agents modes inside a session', async () => {
    await app().startSession('/p')
    app().openProject()
    app().setView('preview')
    expect([app().place, app().view]).toEqual(['session', 'preview'])
    app().setAgentsMode('graph')
    expect([app().view, app().agentsMode]).toEqual(['agents', 'graph'])
  })

  it('lands on Home when the last session closes', async () => {
    await app().startSession('/p')
    await app().closeSession(app().activeId!)
    expect([app().place, app().activeId]).toEqual(['home', null])
  })

  it('maps the menu and palette commands onto the places', async () => {
    await app().startSession('/p')
    runCommand({ id: 'project' })
    expect(app().place).toBe('project')
    runCommand({ id: 'project' })
    expect(app().place).toBe('session')
    runCommand({ id: 'view-agents' })
    expect(app().view).toBe('agents')
    runCommand({ id: 'toggle-panel' })
    expect(app().panelOpen).toBe(true)
    runCommand({ id: 'usage' })
    expect(app().usageOpen).toBe(true)
    runCommand({ id: 'settings' })
    expect([app().settingsOpen, app().usageOpen]).toEqual([true, false])
    runCommand({ id: 'home' })
    expect(app().place).toBe('home')
  })

  it('opens Settings on a tab', () => {
    app().setSettingsOpen(true, 'tools')
    expect([app().settingsOpen, app().settingsTab]).toEqual([true, 'tools'])
    app().setSettingsOpen(false)
    app().setSettingsOpen(true)
    expect(app().settingsTab).toBe('tools')
  })
})
