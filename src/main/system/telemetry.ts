import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

type Handler = (payload: Record<string, unknown>) => void

const MAX_BODY = 1024 * 1024

/**
 * Localhost endpoint scripts post live progress to while they run (see HARNESS_TOOL_GUIDE).
 * Each session gets an unguessable path; the URL reaches the agent's commands as $HARNESS_URL.
 */
export class TelemetryServer {
  private server: Server | null = null
  private port = 0
  private handlers = new Map<string, Handler>()

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const token = /^\/t\/([\w-]+)$/.exec(req.url ?? '')?.[1]
      const handler = token ? this.handlers.get(token) : undefined
      if (req.method !== 'POST' || !handler) {
        res.writeHead(404).end()
        return
      }
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => {
        body += chunk
        if (body.length > MAX_BODY) req.destroy()
      })
      req.on('end', () => {
        try {
          for (const p of parsePayloads(body)) handler(p)
          res.writeHead(204).end()
        } catch {
          res.writeHead(400).end()
        }
      })
    })
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    this.port = (this.server.address() as AddressInfo).port
  }

  register(token: string, handler: Handler): string {
    this.handlers.set(token, handler)
    return `http://127.0.0.1:${this.port}/t/${token}`
  }

  unregister(token: string) {
    this.handlers.delete(token)
  }

  stop() {
    this.server?.close()
  }
}

/** Accepts one JSON object, an array of them, or newline-delimited JSON. */
export function parsePayloads(body: string): Record<string, unknown>[] {
  const trimmed = body.trim()
  if (!trimmed) return []
  try {
    const v = JSON.parse(trimmed)
    return (Array.isArray(v) ? v : [v]).filter((x) => x && typeof x === 'object')
  } catch {
    return trimmed
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  }
}
