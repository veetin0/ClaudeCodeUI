/**
 * One spelling per file on every OS. Windows paths arrive as `C:\proj\a.ts` (watchers),
 * `C:/proj/a.ts` (git) or `c:\proj\a.ts` (tool input); they all become `C:/proj/a.ts`.
 * Node's fs accepts forward slashes on Windows, so the normalised form works for file access too.
 * On macOS/Linux this is the identity.
 */
export function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`)
}

const isWinStyle = (p: string) => /^[A-Za-z]:\//.test(p) || p.startsWith('//')

/** `abs` relative to `root` with forward slashes, or null when it's outside. Case-insensitive for Windows paths. */
export function relTo(abs: string, root: string): string | null {
  const a = normPath(abs)
  const r = normPath(root).replace(/\/+$/, '')
  const win = isWinStyle(a) || isWinStyle(r)
  const [ac, rc] = win ? [a.toLowerCase(), r.toLowerCase()] : [a, r]
  return ac.startsWith(`${rc}/`) ? a.slice(r.length + 1) : null
}

/** Last path segment, for either separator. */
export function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p
}
