import { net, protocol } from 'electron'
import { homedir } from 'node:os'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FILE_SCHEME, pathFromFileUrl, SERVED_EXTENSIONS } from '@shared/visuals'

/** Must run before app ready. */
export function registerFileScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }])
}

/** Serves local media (plots agents show, videos Remotion renders) and 3D models for the viewer, nothing else. */
export function handleFileScheme() {
  protocol.handle(FILE_SCHEME, async (req) => {
    const path = pathFromFileUrl(req.url, homedir())
    if (!SERVED_EXTENSIONS.includes(extname(path).toLowerCase())) return new Response('Forbidden', { status: 403 })
    // Pass Range through so <video> can seek.
    const res = await net.fetch(pathToFileURL(path).toString(), { headers: req.headers })
    // The 3D viewer fetch()es models, and fetch is CORS-checked (unlike <img> and <video>).
    const headers = new Headers(res.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
  })
}
