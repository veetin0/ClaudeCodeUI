import { createServer, type Server } from 'node:http'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** Fixed so the command written into settings.json keeps working across app restarts. */
export const HOOK_PORT = 47821
/** Tags every hook entry we add, so removal only touches ours. */
const MARKER = '# harness-observe'
const EVENTS = ['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'] as const

/** The hook command: forward the hook's JSON to Harness, never slow down or fail Claude Code. */
export function hookCommand(port = HOOK_PORT): string {
  return `curl -s -m 1 -X POST -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${port}/hook >/dev/null 2>&1 || true ${MARKER}`
}

type HookEntry = { matcher?: string; hooks: { type: string; command?: string }[] }
type Settings = { hooks?: Record<string, HookEntry[]> } & Record<string, unknown>

const isOurs = (e: HookEntry) => e.hooks?.some((h) => h.command?.includes(MARKER))

export function withHarnessHooks(settings: Settings, port = HOOK_PORT): Settings {
  const hooks = { ...(settings.hooks ?? {}) }
  for (const ev of EVENTS) {
    const kept = (hooks[ev] ?? []).filter((e) => !isOurs(e))
    hooks[ev] = [...kept, { hooks: [{ type: 'command', command: hookCommand(port) }] }]
  }
  return { ...settings, hooks }
}

export function withoutHarnessHooks(settings: Settings): Settings {
  if (!settings.hooks) return settings
  const hooks: Record<string, HookEntry[]> = {}
  for (const [ev, entries] of Object.entries(settings.hooks)) {
    const kept = entries.filter((e) => !isOurs(e))
    if (kept.length) hooks[ev] = kept
  }
  const { hooks: _drop, ...rest } = settings
  return Object.keys(hooks).length ? { ...rest, hooks } : rest
}

export function hasHarnessHooks(settings: Settings): boolean {
  return EVENTS.every((ev) => settings.hooks?.[ev]?.some(isOurs))
}

async function readSettings(path: string): Promise<Settings> {
  if (!existsSync(path)) return {}
  const text = await readFile(path, 'utf8')
  if (!text.trim()) return {}
  // Refuse to touch a file we can't parse rather than clobber it.
  return JSON.parse(text) as Settings
}

/** Backs up settings.json next to itself, then writes the change. */
export async function updateClaudeSettings(path: string, change: (s: Settings) => Settings): Promise<void> {
  const current = await readSettings(path)
  await mkdir(dirname(path), { recursive: true })
  if (existsSync(path)) await copyFile(path, `${path}.harness-backup-${Date.now()}`)
  await writeFile(path, `${JSON.stringify(change(current), null, 2)}\n`)
}

export async function hooksInstalled(path: string): Promise<boolean> {
  try {
    return hasHarnessHooks(await readSettings(path))
  } catch {
    return false
  }
}

/** Receives the hook POSTs. Optional: observe mode works from transcripts alone. */
export class HookBridge {
  private server: Server | null = null
  port: number | null = null

  constructor(private readonly onHook: (input: Record<string, unknown>) => void) {}

  async start(port = HOOK_PORT): Promise<void> {
    const server = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/hook') return void res.writeHead(404).end()
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        body += c
        if (body.length > 1_000_000) req.destroy()
      })
      req.on('end', () => {
        res.writeHead(204).end()
        try {
          this.onHook(JSON.parse(body))
        } catch {
          // malformed: ignore
        }
      })
    })
    await new Promise<void>((resolve) => {
      server.once('error', () => resolve()) // port taken: run without hooks
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        this.port = port
        resolve()
      })
    })
  }

  stop() {
    this.server?.close()
  }
}
