// Shared by capture_ui.mjs and render.mjs: a tiny static server and a Chrome to drive.
import { createServer } from 'node:http'
import { chromium } from 'playwright-core'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.css': 'text/css' }

/** Serves the film folder (the scene, the build files, the demo app) on a free local port. */
export async function serve(dir) {
  const root = resolve(dir)
  const server = createServer((q, s) => {
    const p = join(root, decodeURIComponent(q.url.split('?')[0]))
    if ((p !== root && !p.startsWith(root + sep)) || !existsSync(p) || statSync(p).isDirectory()) {
      s.writeHead(404)
      return s.end()
    }
    s.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
    s.end(readFileSync(p))
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

/**
 * A Chrome for Playwright: CHROME_PATH, a preinstalled Chromium, the installed Google Chrome, or
 * Playwright's own (`npx playwright install chromium`).
 */
export async function chrome(args = []) {
  const exe = process.env.CHROME_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
  if (exe) return chromium.launch({ executablePath: exe, args })
  return chromium.launch({ channel: 'chrome', args }).catch(() => chromium.launch({ args }))
}
