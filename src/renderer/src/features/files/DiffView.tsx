import { Check, ChevronLeft, ChevronRight, Columns2, Rows2, Undo2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FileDiff } from '@shared/ipc'
import { cn } from '@/lib/format'
import { languageFor, monaco } from '@/lib/monaco'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { relPath } from './tree'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Full-size Monaco diff of one file: its pre-session content vs. what's on disk now. */
export default function DiffView({ session }: { session: SessionState }) {
  const { diffPath, openDiff, closeDiff } = useApp()
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inline, setInline] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

  const changes = session.changes
  const index = changes.findIndex((c) => c.path === diffPath)
  const change = index >= 0 ? changes[index] : undefined
  // Refetch when this file changes again while it's open.
  const version = `${session.files[diffPath ?? '']?.lastTs ?? 0}:${change?.additions}:${change?.deletions}`

  useEffect(() => {
    if (!diffPath) return
    let cancelled = false
    window.harness
      .getFileDiff(session.id, diffPath)
      .then((d) => {
        if (cancelled) return
        setDiff(d)
        setError(null)
      })
      .catch((e) => !cancelled && setError(ipcErrorMessage(e)))
    return () => {
      cancelled = true
    }
  }, [session.id, diffPath, version])

  useLayoutEffect(() => {
    if (!host.current) return
    const ed = monaco.editor.createDiffEditor(host.current, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      minimap: { enabled: false },
      fontSize: 12,
      scrollBeyondLastLine: false,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3 },
    })
    editor.current = ed
    const mq = darkQuery()
    const applyTheme = () => monaco.editor.setTheme(mq.matches ? 'vs-dark' : 'vs')
    applyTheme()
    mq.addEventListener('change', applyTheme)
    return () => {
      mq.removeEventListener('change', applyTheme)
      const model = ed.getModel()
      ed.dispose()
      model?.original.dispose()
      model?.modified.dispose()
      editor.current = null
    }
  }, [])

  useEffect(() => {
    const ed = editor.current
    if (!ed || !diff) return
    const lang = languageFor(diff.path)
    const prev = ed.getModel()
    ed.setModel({
      original: monaco.editor.createModel(diff.original ?? '', lang),
      modified: monaco.editor.createModel(diff.current ?? '', lang),
    })
    prev?.original.dispose()
    prev?.modified.dispose()
  }, [diff])

  useEffect(() => {
    editor.current?.updateOptions({ renderSideBySide: !inline })
  }, [inline])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDiff()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDiff])

  if (!diffPath) return null
  const go = (d: number) => {
    if (changes.length) openDiff(changes[(Math.max(index, 0) + d + changes.length) % changes.length].path)
  }
  const afterAction = () => (changes.length > 1 ? go(1) : closeDiff())

  const revert = async () => {
    if (!window.confirm(`Revert ${relPath(diffPath, session.cwd)} to how it was before this session? Your current changes to it will be lost.`)) return
    try {
      await window.harness.revertFile(session.id, diffPath)
      afterAction()
    } catch (e) {
      setError(ipcErrorMessage(e))
    }
  }
  const accept = async () => {
    await window.harness.acceptFile(session.id, diffPath)
    afterAction()
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2">
        <IconButton onClick={() => go(-1)} disabled={changes.length < 2} title="Previous changed file">
          <ChevronLeft className="size-4" />
        </IconButton>
        <IconButton onClick={() => go(1)} disabled={changes.length < 2} title="Next changed file">
          <ChevronRight className="size-4" />
        </IconButton>
        <div className="min-w-0">
          <div className="truncate font-mono text-[13px] font-medium">{relPath(diffPath, session.cwd)}</div>
          <div className="text-[11px] text-muted">
            {change ? (
              <>
                {change.status} · <span className="text-ok-ink">+{change.additions}</span>{' '}
                <span className="text-danger-ink">−{change.deletions}</span>
                {changes.length > 1 && ` · file ${index + 1} of ${changes.length}`}
              </>
            ) : diff && !diff.hasBaseline ? (
              'No earlier version known; showing the current file'
            ) : (
              'No changes since the session started'
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-line">
            <button onClick={() => setInline(false)} className={cn('p-1.5', inline ? 'text-muted' : 'bg-surface-2')} title="Side by side">
              <Columns2 className="size-3.5" />
            </button>
            <button onClick={() => setInline(true)} className={cn('p-1.5', inline ? 'bg-surface-2' : 'text-muted')} title="Inline">
              <Rows2 className="size-3.5" />
            </button>
          </div>
          {change && (
            <>
              <button onClick={() => void revert()} className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-surface-2">
                <Undo2 className="size-3.5" /> Revert
              </button>
              <button
                onClick={() => void accept()}
                className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110"
              >
                <Check className="size-3.5" /> Accept
              </button>
            </>
          )}
          <IconButton onClick={closeDiff} title="Close (Esc)">
            <X className="size-4" />
          </IconButton>
        </div>
      </header>
      {error && <div className="border-b border-danger/30 bg-danger/5 px-4 py-1.5 text-[12px] text-danger-ink">{error}</div>}
      <div ref={host} className="min-h-0 flex-1" />
    </div>
  )
}

function IconButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="rounded p-1 text-muted hover:bg-hover disabled:opacity-30">
      {children}
    </button>
  )
}
