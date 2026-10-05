import { ChevronRight, File, FileDiff, Folder, FolderOpen } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/format'
import { KIND_COLOR } from '@/lib/tools'
import { useApp } from '@/stores/app'
import type { FileActivity, SessionState } from '@/stores/reducer'
import { useElapsed } from '../meters/useElapsed'
import { ancestors, buildTree, relPath, type TreeNode } from './tree'

/** Glow colour per kind of touch: same hues as the tool chips (Read, Write, Run). */
const HEAT_COLOR: Record<FileActivity['lastKind'], string> = {
  read: KIND_COLOR.read,
  write: KIND_COLOR.write,
  disk: KIND_COLOR.exec,
}
const DECAY_MS = 60_000

/** 1 right after a touch, fading to 0 over about a minute. */
const heat = (f: FileActivity | undefined, now: number) => (f ? Math.max(0, Math.exp(-(now - f.lastTs) / (DECAY_MS / 3))) : 0)

export function FilesPanel({ session }: { session: SessionState }) {
  const openDiff = useApp((s) => s.openDiff)
  const [files, setFiles] = useState<string[] | null>(null)
  const [touchedOnly, setTouchedOnly] = useState<boolean | null>(null)
  const [toggled, setToggled] = useState<Set<string>>(new Set())

  // Re-list when files appear or disappear.
  const fileCount = Object.keys(session.files).length
  useEffect(() => {
    let cancelled = false
    void window.harness.listFiles(session.cwd).then((f) => !cancelled && setFiles(f))
    return () => {
      cancelled = true
    }
  }, [session.cwd, fileCount, session.changes.length])

  // Tick once a second while something is still glowing, so the heat visibly fades.
  const lastTouch = Math.max(0, ...Object.values(session.files).map((f) => f.lastTs))
  useElapsed(lastTouch > 0 && Date.now() - lastTouch < DECAY_MS * 2 ? lastTouch : undefined, 1000)
  const now = Date.now()

  const changed = useMemo(() => new Map(session.changes.map((c) => [c.path, c])), [session.changes])
  const touchedAbs = useMemo(() => [...new Set([...Object.keys(session.files), ...changed.keys()])], [session.files, changed])
  const showTouchedOnly = touchedOnly ?? (files !== null && files.length > 150)

  const tree = useMemo(
    () => ({
      root: buildTree(showTouchedOnly ? [] : (files ?? []), touchedAbs, session.cwd),
      touchedRel: new Set(touchedAbs.map((a) => relPath(a, session.cwd))),
    }),
    [files, touchedAbs, showTouchedOnly, session.cwd],
  )

  // Directories holding touched files start open; clicking flips that default.
  const autoOpen = useMemo(() => new Set([...tree.touchedRel].flatMap(ancestors)), [tree])
  const isOpen = (rel: string) => autoOpen.has(rel) !== toggled.has(rel)
  const toggle = (rel: string) =>
    setToggled((t) => {
      const n = new Set(t)
      if (n.has(rel)) n.delete(rel)
      else n.add(rel)
      return n
    })

  const totals = session.changes.reduce((a, c) => ({ add: a.add + c.additions, del: a.del + c.deletions }), { add: 0, del: 0 })

  return (
    <div className="space-y-4">
      {session.changes.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-baseline gap-2 px-1">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Changes</h3>
            <span className="text-[11px] tabular-nums text-muted">
              {session.changes.length} files · <span className="text-emerald-600 dark:text-emerald-400">+{totals.add}</span>{' '}
              <span className="text-red-600 dark:text-red-400">−{totals.del}</span>
            </span>
            <button onClick={() => openDiff(session.changes[0].path)} className="ml-auto text-[11px] text-[var(--accent)] hover:underline">
              Review all
            </button>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {session.changes.map((c) => (
              <button
                key={c.path}
                onClick={() => openDiff(c.path)}
                className="flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left last:border-0 hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'w-3 shrink-0 text-center font-mono text-[10.5px] font-bold',
                    c.status === 'added' ? 'text-emerald-600' : c.status === 'deleted' ? 'text-red-600' : 'text-amber-600',
                  )}
                  title={c.status}
                >
                  {c.status[0].toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{relPath(c.path, session.cwd)}</span>
                <span className="shrink-0 text-[10.5px] tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">+{c.additions}</span>{' '}
                  <span className="text-red-600 dark:text-red-400">−{c.deletions}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-1.5 flex items-center gap-2 px-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Project</h3>
          <label className="ml-auto flex items-center gap-1 text-[11px] text-muted">
            <input type="checkbox" checked={showTouchedOnly} onChange={(e) => setTouchedOnly(e.target.checked)} />
            Touched only
          </label>
        </div>
        <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10.5px] text-muted">
          <Legend color={HEAT_COLOR.read} label="Read" />
          <Legend color={HEAT_COLOR.write} label="Written" />
          <Legend color={HEAT_COLOR.disk} label="Changed by a command" />
        </div>
        {files === null ? (
          <p className="px-1 text-[12px] text-muted">Loading…</p>
        ) : tree.root.children.length === 0 ? (
          <p className="px-1 text-[12px] text-muted">{showTouchedOnly ? 'No files touched yet.' : 'No files.'}</p>
        ) : (
          <div className="font-mono text-[11.5px]">
            {tree.root.children.map((n) => (
              <Row key={n.rel} node={n} depth={0} session={session} now={now} changed={changed} isOpen={isOpen} toggle={toggle} onOpenFile={openDiff} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

interface RowProps {
  node: TreeNode
  depth: number
  session: SessionState
  now: number
  changed: Map<string, { additions: number; deletions: number; status: string }>
  isOpen: (rel: string) => boolean
  toggle: (rel: string) => void
  onOpenFile: (abs: string) => void
}

function Row({ node, depth, session, now, changed, isOpen, toggle, onOpenFile }: RowProps) {
  const pad = { paddingLeft: 6 + depth * 12 }
  if (!node.abs) {
    const open = isOpen(node.rel)
    // A folder glows with its hottest descendant.
    const hottest = hottestIn(node, session, now)
    const Icon = open ? FolderOpen : Folder
    return (
      <>
        <button onClick={() => toggle(node.rel)} style={{ ...pad, ...glow(hottest.f, hottest.h * 0.6) }} className="flex w-full items-center gap-1 rounded py-[3px] pr-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/5">
          <ChevronRight className={cn('size-3 shrink-0 text-muted transition-transform', open && 'rotate-90')} />
          <Icon className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children.map((c) => (
            <Row key={c.rel} node={c} depth={depth + 1} session={session} now={now} changed={changed} isOpen={isOpen} toggle={toggle} onOpenFile={onOpenFile} />
          ))}
      </>
    )
  }
  const f = session.files[node.abs]
  const ch = changed.get(node.abs)
  const h = heat(f, now)
  return (
    <button
      onClick={() => onOpenFile(node.abs!)}
      title={f ? `${f.reads} reads · ${f.writes} writes${f.diskChanges ? ` · ${f.diskChanges} changes by commands` : ''}` : node.rel}
      style={{ ...pad, ...glow(f, h) }}
      className="group flex w-full items-center gap-1 rounded py-[3px] pr-1.5 text-left hover:bg-black/[0.04] dark:hover:bg-white/5"
    >
      <span className="w-3 shrink-0" />
      {ch ? <FileDiff className="size-3.5 shrink-0 text-amber-600" /> : <File className="size-3.5 shrink-0 text-muted" />}
      <span className={cn('truncate', !f && !ch && 'text-muted')}>{node.name}</span>
      {f && (
        <span className="ml-1 flex shrink-0 gap-0.5" aria-hidden>
          {f.reads > 0 && <Dot color={HEAT_COLOR.read} />}
          {f.writes > 0 && <Dot color={HEAT_COLOR.write} />}
          {f.diskChanges > 0 && <Dot color={HEAT_COLOR.disk} />}
        </span>
      )}
      {ch && (
        <span className="ml-auto shrink-0 text-[10px] tabular-nums">
          <span className="text-emerald-600 dark:text-emerald-400">+{ch.additions}</span> <span className="text-red-600 dark:text-red-400">−{ch.deletions}</span>
        </span>
      )}
    </button>
  )
}

const Dot = ({ color }: { color: string }) => <span className="size-1.5 rounded-full" style={{ background: color }} />

function glow(f: FileActivity | undefined, h: number): React.CSSProperties {
  if (!f || h < 0.02) return {}
  const c = HEAT_COLOR[f.lastKind]
  return {
    background: `color-mix(in srgb, ${c} ${Math.round(h * 32)}%, transparent)`,
    boxShadow: h > 0.5 ? `inset 2px 0 0 ${c}` : undefined,
    transition: 'background 800ms ease',
  }
}

function hottestIn(node: TreeNode, s: SessionState, now: number): { f?: FileActivity; h: number } {
  let best: { f?: FileActivity; h: number } = { h: 0 }
  const visit = (n: TreeNode) => {
    if (n.abs) {
      const f = s.files[n.abs]
      const h = heat(f, now)
      if (h > best.h) best = { f, h }
    } else n.children.forEach(visit)
  }
  visit(node)
  return best
}
