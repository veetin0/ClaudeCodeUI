import { net, protocol } from 'electron'
import { homedir } from 'node:os'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FILE_SCHEME, MEDIA_EXTENSIONS, pathFromFileUrl } from '@shared/visuals'

/** Must run before app ready. */
export function registerFileScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

/** Serves local media (plots agents show, videos Remotion renders) and nothing else. */
export function handleFileScheme() {
  protocol.handle(FILE_SCHEME, (req) => {
    const path = pathFromFileUrl(req.url, homedir())
    if (!MEDIA_EXTENSIONS.includes(extname(path).toLowerCase())) return new Response('Forbidden', { status: 403 })
    // Pass Range through so <video> can seek.
    return net.fetch(pathToFileURL(path).toString(), { headers: req.headers })
  })
}
