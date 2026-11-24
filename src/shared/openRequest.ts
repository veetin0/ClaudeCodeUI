import { isAbsolute, relative, resolve, sep } from 'node:path'

/** What `harness://open?dir=…&prompt=…` asks for: a folder to work in and an unsent prompt for it. */
export interface OpenRequest {
  dir: string
  prompt: string
}

/** A prompt longer than this is refused: a link is not a document. */
export const MAX_OPEN_PROMPT = 20_000

/**
 * Parses a `harness://open` link. Anyone can make a link, so it only ever fills in Home's folder and
 * prompt boxes (nothing is sent), and the folder must sit inside one of `roots` (e.g. ~/Projects).
 * Returns null for anything else.
 */
export function parseOpenUrl(raw: string, roots: string[]): OpenRequest | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'harness:' || url.hostname !== 'open') return null
  const dir = url.searchParams.get('dir') ?? ''
  const prompt = url.searchParams.get('prompt') ?? ''
  if (!dir || !isAbsolute(dir) || dir.includes('\0') || prompt.length > MAX_OPEN_PROMPT) return null
  const target = resolve(dir)
  return isInside(target, roots) ? { dir: target, prompt } : null
}

/** True when `target` is a folder strictly inside one of `roots` (not a root itself). */
export function isInside(target: string, roots: string[]): boolean {
  return roots.some((root) => {
    const rel = relative(resolve(root), resolve(target))
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..')
  })
}
