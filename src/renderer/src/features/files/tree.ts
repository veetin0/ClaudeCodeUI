export interface TreeNode {
  name: string
  /** Path relative to the project root ('' for the root). */
  rel: string
  /** Absolute path (files only). */
  abs?: string
  children: TreeNode[]
}

export const OUTSIDE = '(outside project)'

export function relPath(abs: string, cwd: string): string {
  const root = cwd.endsWith('/') ? cwd : `${cwd}/`
  return abs.startsWith(root) ? abs.slice(root.length) : abs
}

/**
 * Builds the project tree from git's file list plus any extra absolute paths agents touched
 * (new files, files outside the project). Directories first, then files, alphabetically.
 */
export function buildTree(relFiles: string[], extraAbs: string[], cwd: string): TreeNode {
  const root: TreeNode = { name: '', rel: '', children: [] }
  const dirs = new Map<string, TreeNode>([['', root]])
  const seen = new Set<string>()
  const root_ = cwd.replace(/\/$/, '')

  const addFile = (rel: string, abs: string) => {
    if (seen.has(abs)) return
    seen.add(abs)
    const parts = rel.split('/')
    let parent = root
    let acc = ''
    for (const part of parts.slice(0, -1)) {
      acc = acc ? `${acc}/${part}` : part
      let dir = dirs.get(acc)
      if (!dir) {
        dir = { name: part, rel: acc, children: [] }
        dirs.set(acc, dir)
        parent.children.push(dir)
      }
      parent = dir
    }
    parent.children.push({ name: parts[parts.length - 1], rel, abs, children: [] })
  }

  for (const rel of relFiles) addFile(rel, `${root_}/${rel}`)
  for (const abs of extraAbs) {
    const rel = relPath(abs, cwd)
    addFile(rel === abs ? `${OUTSIDE}/${abs.replace(/^\//, '').replace(/\//g, '∕')}` : rel, abs)
  }

  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(!!a.abs) - Number(!!b.abs) || a.name.localeCompare(b.name))
    n.children.forEach(sort)
  }
  sort(root)
  return root
}

/** Every directory rel on the way to `rel` (exclusive). */
export function ancestors(rel: string): string[] {
  const parts = rel.split('/')
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'))
}
