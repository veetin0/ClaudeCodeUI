import type { ToolCall } from '@/stores/reducer'

export interface TreeInput {
  key: string
  parent: string | null
}

export interface Placed {
  key: string
  x: number
  y: number
  depth: number
}

/**
 * Tidy top-down tree layout: each leaf gets one column, parents centre over their children.
 * Children keep input order (spawn order), so the picture doesn't reshuffle as agents finish.
 */
export function layoutTree(nodes: TreeInput[], colWidth = 300, rowHeight = 210): Placed[] {
  const children = new Map<string | null, string[]>()
  for (const n of nodes) children.set(n.parent, [...(children.get(n.parent) ?? []), n.key])
  const out: Placed[] = []
  let nextCol = 0
  const place = (key: string, depth: number): number => {
    const kids = children.get(key) ?? []
    let col: number
    if (kids.length === 0) col = nextCol++
    else {
      const cols = kids.map((k) => place(k, depth + 1))
      col = (cols[0] + cols[cols.length - 1]) / 2
    }
    out.push({ key, x: col * colWidth, y: depth * rowHeight, depth })
    return col
  }
  for (const root of children.get(null) ?? []) place(root, 0)
  return out
}

/**
 * Packs a lane's tool calls into rows so overlapping (parallel) calls don't draw on top of
 * each other. Greedy interval partitioning: each call takes the first row that's free.
 */
export function packRows(tools: ToolCall[], now: number): Map<string, number> {
  const rowEnds: number[] = []
  const rows = new Map<string, number>()
  for (const t of [...tools].sort((a, b) => a.startedAt - b.startedAt)) {
    const end = t.endedAt ?? now
    let row = rowEnds.findIndex((e) => e <= t.startedAt)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = Math.max(end, t.startedAt + 1)
    rows.set(t.id, row)
  }
  return rows
}

/** Tick spacing that gives roughly `target` labels across `spanMs`. */
export function tickStep(spanMs: number, target = 6): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000)
  return steps.find((s) => spanMs / s <= target) ?? 3_600_000
}

export function formatOffset(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`
}
