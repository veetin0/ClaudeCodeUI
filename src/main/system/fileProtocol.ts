import { net, protocol } from 'electron'
import { homedir } from 'node:os'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { FILE_SCHEME, IMAGE_EXTENSIONS } from '@shared/visuals'

/** Must run before app ready. */
export function registerFileScheme() {
  protocol.registerSchemesAsPrivileged([{ scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/** Serves local image files (plots, renders) that agents show, and nothing else. */
export function handleFileScheme() {
  protocol.handle(FILE_SCHEME, (req) => {
    let path = decodeURI(new URL(req.url).pathname)
    if (path.startsWith('/~/')) path = homedir() + path.slice(2)
    if (!IMAGE_EXTENSIONS.includes(extname(path).toLowerCase())) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(path).toString())
  })
}
