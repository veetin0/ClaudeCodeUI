import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Build the service's path constants the way Windows does.
vi.mock('node:path', async (orig) => {
  const real = await orig<typeof import('node:path')>()
  return { ...real, default: { ...real, join: real.win32.join }, join: real.win32.join }
})

const { isMemoryChange } = await import('../src/main/hackforge/HackforgeService')

describe('HackForge watcher on Windows', () => {
  it('treats hackforge.yaml edits as HackForge state, whatever join() gives', () => {
    expect(path.join('challenge', 'hackforge.yaml')).toBe('challenge\\hackforge.yaml')
    // watchProject reports forward slashes on every OS.
    expect(isMemoryChange('challenge/hackforge.yaml')).toBe(true)
    expect(isMemoryChange('.hackforge/LOOP.json')).toBe(true)
    expect(isMemoryChange('.claude/settings.json')).toBe(true)
    expect(isMemoryChange('src/app.ts')).toBe(false)
    expect(isMemoryChange('challenge/brief/a.md')).toBe(false)
  })
})
