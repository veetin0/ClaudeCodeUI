import { afterEach, describe, expect, it } from 'vitest'
import { PtyService } from '../src/main/pty/PtyService'

// A stand-in for the renderer's WebContents: collects what the terminal would show.
const fakeOwner = () => {
  const out: string[] = []
  let exit: number | undefined
  const owner = {
    isDestroyed: () => false,
    send: (channel: string, _id: string, payload: string | number) => (channel.includes('exit') ? (exit = payload as number) : out.push(payload as string)),
    once: () => {},
  }
  return { owner, text: () => out.join(''), exit: () => exit }
}

describe('PtyService', () => {
  const shell = process.env.SHELL
  const svc = new PtyService()
  afterEach(() => {
    process.env.SHELL = shell
    svc.killAll()
  })

  it.skipIf(process.platform === 'win32')('falls back to the system shell, and says so, when SHELL can’t be started', async () => {
    process.env.SHELL = '/nonexistent/shell'
    const t = fakeOwner()
    const id = svc.create(t.owner as never, { cwd: '', cols: 80, rows: 24, command: 'echo fallback-works' })
    expect(id).toBeTruthy()
    await expect.poll(() => t.text(), { timeout: 5000 }).toContain('fallback-works')
    expect(t.text()).toContain("Couldn't start /nonexistent/shell")
  })
})
