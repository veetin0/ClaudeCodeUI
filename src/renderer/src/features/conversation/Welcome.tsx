import { FolderOpen, History, KeyRound } from 'lucide-react'
import { basename, formatCost } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'

export function Welcome() {
  const { settings, history, openProject, openSaved, startSession, startError, setSettingsOpen } = useApp()
  const recents = settings?.recentProjects ?? []
  const lastSessions = history.filter((h) => h.title).slice(0, 4)

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--accent)]/15 text-2xl">✳︎</div>
        <h1 className="text-xl font-semibold">Run Claude Code. Watch it work.</h1>
        <p className="mt-2 text-muted">Open a project folder to start a session. Every tool call, subagent and decision shows up live.</p>
        <button
          onClick={() => void openProject()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-white hover:brightness-110"
        >
          <FolderOpen className="size-4" />
          Open project… <kbd className="opacity-70">⌘O</kbd>
        </button>
        {startError && <div className="selectable mt-4 text-[12px] text-red-500">{startError}</div>}
        {lastSessions.length > 0 && (
          <div className="mt-8 text-left">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Continue where you left off</div>
            <div className="overflow-hidden rounded-xl border border-line">
              {lastSessions.map((h) => (
                <button
                  key={h.id}
                  onClick={() => void openSaved(h.id)}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <History className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.title}</span>
                    <span className="block truncate text-[11px] text-muted">
                      {basename(h.cwd)} · {relativeTime(h.updatedAt)}
                      {h.costUsd > 0 && ` · ${formatCost(h.costUsd)}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {recents.length > 0 && (
          <div className="mt-6 text-left">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">New session in</div>
            <div className="overflow-hidden rounded-xl border border-line">
              {recents.slice(0, 5).map((dir) => (
                <button
                  key={dir}
                  onClick={() => void startSession(dir)}
                  className="flex w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-surface-2"
                >
                  <FolderOpen className="size-4 text-muted" />
                  <span className="font-medium">{basename(dir)}</span>
                  <span className="truncate text-[11px] text-muted">{dir}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {settings && !settings.hasApiKey && (
          <button onClick={() => setSettingsOpen(true)} className="mt-6 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            <KeyRound className="size-3.5" />
            Uses your existing Claude Code login. Add an API key in Settings to use one instead.
          </button>
        )}
      </div>
    </div>
  )
}
