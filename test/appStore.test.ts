import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSummary } from '@shared/ipc'

// The store talks to the main process through window.harness; stand in for it.
const calls: string[] = []
const summary: SessionSummary = { id: 'saved1', cwd: '/p', title: 'Old work', createdAt: 0, updatedAt: 0, costUsd: 0, claudeSessionId: 'c1' }
const harness = {
  loadSession: vi.fn(async () => ({ summary, events: [] })),
  previewDetect: vi.fn(async () => ({})),
  // Main has no AgentSession for a saved session, so these reject there.
  setPermissionMode: vi.fn(async () => {
    calls.push('setPermissionMode')
    throw new Error('Unknown session saved1')
  }),
  setModel: vi.fn(async () => {
    calls.push('setModel')
    throw new Error('Unknown session saved1')
  }),
  resumeSession: vi.fn(async (_id: string, opts: { permissionMode?: string; model?: string }) => {
    calls.push(`resume ${opts.permissionMode} ${opts.model}`)
    return summary
  }),
  sendMessage: vi.fn(async () => void calls.push('send')),
}
;(globalThis as unknown as { window: unknown }).window = { harness }
const { useApp } = await import('../src/renderer/src/stores/app')

describe('app store with a saved (not running) session', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('keeps a new permission mode and model, and resumes with them', async () => {
    await useApp.getState().openSaved('saved1')
    await useApp.getState().setPermissionMode('acceptEdits')
    await useApp.getState().setModel('claude-sonnet-5-5')
    const s = useApp.getState().sessions.saved1
    expect([s.permissionMode, s.model]).toEqual(['acceptEdits', 'claude-sonnet-5-5'])
    await useApp.getState().send('continue')
    expect(calls).toEqual(['resume acceptEdits claude-sonnet-5-5', 'send'])
  })
})
