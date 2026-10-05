import { Clapperboard, ExternalLink, FileVideo, FolderOpen, Globe, Loader2, Play, RefreshCw, ScrollText, Square, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PreviewServer, RenderJob } from '@shared/preview'
import { fileUrl } from '@shared/visuals'
import { basename, cn, formatDuration } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'

/**
 * Live preview of the project: Remotion Studio (which hot-reloads as Claude edits compositions),
 * any dev server, or a URL an agent's command printed. Remotion projects get a render panel.
 */
export function PreviewView({ session }: { session: SessionState }) {
  const cwd = session.cwd
  const { preview, projects, previewTargets, setPreviewTarget, detectProject } = useApp()
  const project = projects[cwd]
  const target = previewTargets[cwd]
  const [reloadKey, setReloadKey] = useState(0)
  const [showLog, setShowLog] = useState(false)
  const [customUrl, setCustomUrl] = useState('')

  useEffect(() => {
    void detectProject(cwd)
  }, [cwd, detectProject])

  const servers = preview.servers.filter((s) => s.cwd === cwd)
  const studio = servers.find((s) => s.kind === 'remotion' && s.status !== 'exited')
  const detected = preview.detected.filter((d) => !d.cwd || d.cwd === cwd)
  const server = target?.kind === 'server' ? preview.servers.find((s) => s.id === target.id) : undefined
  const url = target?.kind === 'url' ? target.url : server?.url

  // Studio edits show up by itself (hot reload); a plain dev server may need a nudge.
  const lastWrite = Math.max(0, ...Object.values(session.files).filter((f) => f.lastKind === 'write').map((f) => f.lastTs))

  const start = async (fn: () => Promise<PreviewServer>) => {
    const s = await fn()
    setPreviewTarget(cwd, { kind: 'server', id: s.id })
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Source bar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2 text-[12px]">
          {project?.remotion && (
            <SourceButton
              active={!!studio && target?.kind === 'server' && target.id === studio.id}
              onClick={() => void start(() => window.harness.startStudio(cwd))}
              icon={<Clapperboard className="size-3.5" />}
              label="Remotion Studio"
              status={studio?.status}
            />
          )}
          {project?.devScripts
            .filter((s) => !(project.remotion && /remotion studio/.test(s.command)))
            .map((s) => {
              const running = servers.find((x) => x.kind === 'script' && x.label === s.name && x.status !== 'exited')
              return (
                <SourceButton
                  key={s.name}
                  active={!!running && target?.kind === 'server' && target.id === running.id}
                  onClick={() => void start(() => window.harness.startScript(cwd, s.name))}
                  icon={<Play className="size-3" />}
                  label={`${s.name}`}
                  title={s.command}
                  status={running?.status}
                />
              )
            })}
          {detected.map((d) => (
            <SourceButton
              key={d.url}
              active={target?.kind === 'url' && target.url === d.url}
              onClick={() => setPreviewTarget(cwd, { kind: 'url', url: d.url })}
              icon={<Globe className="size-3.5" />}
              label={d.url.replace(/^https?:\/\//, '')}
              title={`Seen in ${d.source === 'terminal' ? 'a terminal' : "an agent's command"} ${relativeTime(d.ts)}`}
            />
          ))}
          <form
            className="ml-auto flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              if (/^https?:\/\/(localhost|127\.0\.0\.1):\d+/.test(customUrl)) setPreviewTarget(cwd, { kind: 'url', url: customUrl })
            }}
          >
            <input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="selectable w-44 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11.5px] outline-none focus:border-[var(--accent)]/60"
            />
          </form>
        </div>

        {/* Frame toolbar */}
        {url && (
          <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[11.5px] text-muted">
            <span className={cn('size-2 rounded-full', server?.status === 'ready' || target?.kind === 'url' ? 'bg-emerald-500' : 'bg-amber-500 animate-soft-pulse')} />
            <span className="truncate font-mono">{url}</span>
            {lastWrite > 0 && server?.kind !== 'remotion' && <span className="shrink-0">· files changed {relativeTime(lastWrite)}</span>}
            <div className="ml-auto flex items-center gap-1">
              <IconButton title="Reload" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="size-3.5" />
              </IconButton>
              <IconButton title="Open in browser" onClick={() => void window.harness.openExternal(url)}>
                <ExternalLink className="size-3.5" />
              </IconButton>
              {server && (
                <>
                  <IconButton title="Server output" onClick={() => setShowLog(!showLog)}>
                    <ScrollText className="size-3.5" />
                  </IconButton>
                  <IconButton
                    title="Stop server"
                    onClick={() => {
                      void window.harness.stopServer(server.id)
                      setPreviewTarget(cwd, undefined)
                    }}
                  >
                    <Square className="size-3 fill-current" />
                  </IconButton>
                </>
              )}
            </div>
          </div>
        )}

        <div className="relative min-h-0 flex-1 bg-surface-2">
          {url ? (
            <iframe key={`${url}-${reloadKey}`} src={url} title="Preview" className="h-full w-full border-0 bg-white" allow="autoplay; clipboard-read; clipboard-write; fullscreen" />
          ) : server ? (
            <Starting server={server} />
          ) : (
            <EmptyState session={session} hasRemotion={!!project?.remotion} onStudio={() => void start(() => window.harness.startStudio(cwd))} />
          )}
          {showLog && server && <LogDrawer server={server} onClose={() => setShowLog(false)} />}
        </div>
      </div>

      {project?.remotion && <RenderPanel cwd={cwd} renders={preview.renders.filter((r) => r.cwd === cwd)} />}
    </div>
  )
}

function SourceButton({ active, onClick, icon, label, title, status }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; title?: string; status?: PreviewServer['status'] }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 py-1',
        active ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-fg' : 'border-line text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {status === 'starting' && <Loader2 className="size-3 animate-spin" />}
      {status === 'ready' && <span className="size-1.5 rounded-full bg-emerald-500" />}
      {status === 'error' && <span className="size-1.5 rounded-full bg-red-500" />}
    </button>
  )
}

function IconButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className="rounded p-1 hover:bg-black/5 hover:text-fg dark:hover:bg-white/10">
      {children}
    </button>
  )
}

function Starting({ server }: { server: PreviewServer }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {server.status === 'error' || server.status === 'exited' ? (
        <>
          <p className="font-medium text-red-600">{server.label} stopped</p>
          <pre className="selectable max-h-60 max-w-2xl overflow-auto rounded-lg border border-line bg-surface p-3 text-left font-mono text-[11px]">{server.log.slice(-25).join('\n')}</pre>
        </>
      ) : (
        <>
          <Loader2 className="size-5 animate-spin text-[var(--accent)]" />
          <p className="text-muted">Starting {server.label}…</p>
          <p className="max-w-lg truncate font-mono text-[11px] text-muted">{server.log.at(-1)}</p>
        </>
      )}
    </div>
  )
}

function LogDrawer({ server, onClose }: { server: PreviewServer; onClose: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-56 border-t border-line bg-surface shadow-2xl">
      <div className="flex items-center border-b border-line px-3 py-1 text-[11.5px] text-muted">
        {server.label} output
        <button onClick={onClose} className="ml-auto rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10">
          <X className="size-3.5" />
        </button>
      </div>
      <pre className="selectable h-[calc(100%-26px)] overflow-auto px-3 py-2 font-mono text-[11px] leading-relaxed">{server.log.join('\n')}</pre>
    </div>
  )
}

function EmptyState({ session, hasRemotion, onStudio }: { session: SessionState; hasRemotion: boolean; onStudio: () => void }) {
  const project = useApp((s) => s.projects[session.cwd])
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {hasRemotion ? (
        <>
          <Clapperboard className="size-7 text-[var(--accent)]" />
          <p className="text-[14px] font-semibold">Remotion project</p>
          <p className="max-w-sm text-muted">Start Remotion Studio to watch your compositions change live as Claude edits them. Render finished videos from the panel on the right.</p>
          <button onClick={onStudio} className="mt-1 flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 font-medium text-white hover:brightness-110">
            <Play className="size-3.5 fill-current" /> Start Studio
          </button>
        </>
      ) : (
        <>
          <Globe className="size-7 text-muted" />
          <p className="text-[14px] font-semibold">Nothing to preview yet</p>
          <p className="max-w-sm text-muted">
            {project?.devScripts.length
              ? 'Start one of the dev scripts above, or ask Claude to run the app; any local server it starts shows up here.'
              : 'When Claude or a terminal starts a local server, its address shows up above. You can also type a localhost URL.'}
          </p>
        </>
      )}
    </div>
  )
}

/** Compositions of a Remotion project, renders with progress, and finished videos. */
function RenderPanel({ cwd, renders }: { cwd: string; renders: RenderJob[] }) {
  const { compositions, loadCompositions } = useApp()
  const comps = compositions[cwd]
  const [playing, setPlaying] = useState<string | null>(null)

  useEffect(() => {
    if (!comps) void loadCompositions(cwd)
  }, [cwd, comps, loadCompositions])

  const sorted = useMemo(() => [...renders].sort((a, b) => b.startedAt - a.startedAt), [renders])
  const done = sorted.find((r) => r.id === playing && r.status === 'done') ?? sorted.find((r) => r.status === 'done')

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface-2/40">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Compositions</h3>
        <button onClick={() => void loadCompositions(cwd)} className="ml-auto rounded p-1 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10" title="Reload compositions">
          <RefreshCw className={cn('size-3.5', comps?.loading && 'animate-spin')} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {comps?.error && <pre className="selectable whitespace-pre-wrap rounded-md bg-red-500/5 p-2 text-[11px] text-red-600">{comps.error}</pre>}
        {comps?.loading && !comps.list && <p className="text-[12px] text-muted">Reading compositions…</p>}
        <div className="space-y-1.5">
          {comps?.list?.map((c) => {
            const active = sorted.find((r) => r.composition === c.id && r.status === 'running')
            return (
              <div key={c.id} className="rounded-lg border border-line bg-surface p-2.5">
                <div className="flex items-center gap-2">
                  <FileVideo className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.id}</div>
                    <div className="text-[11px] tabular-nums text-muted">
                      {c.width}×{c.height} · {c.fps}fps · {formatDuration((c.durationInFrames / c.fps) * 1000)}
                    </div>
                  </div>
                  {active ? (
                    <button onClick={() => void window.harness.cancelRender(active.id)} className="rounded-md border border-line px-2 py-0.5 text-[11.5px] hover:bg-surface-2">
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => void window.harness.render(cwd, c.id)}
                      className="rounded-md bg-[var(--accent)] px-2 py-0.5 text-[11.5px] font-medium text-white hover:brightness-110"
                    >
                      Render
                    </button>
                  )}
                </div>
                {active && <RenderProgressBar job={active} />}
              </div>
            )
          })}
          {comps?.list?.length === 0 && <p className="text-[12px] text-muted">No compositions registered yet.</p>}
        </div>

        {sorted.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Renders</h3>
            {done && (
              <video key={done.output} src={fileUrl(done.output)} controls loop autoPlay muted className="mb-2 w-full rounded-lg border border-line bg-black" />
            )}
            <div className="space-y-1">
              {sorted.map((r) => (
                <div
                  key={r.id}
                  onClick={() => r.status === 'done' && setPlaying(r.id)}
                  className={cn('rounded-md px-2 py-1.5 text-[11.5px]', r.status === 'done' && 'cursor-pointer hover:bg-surface', done?.id === r.id && 'bg-surface')}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{basename(r.output)}</span>
                    <span
                      className={cn(
                        'ml-auto shrink-0',
                        r.status === 'done' ? 'text-emerald-600' : r.status === 'error' ? 'text-red-600' : 'text-muted',
                      )}
                    >
                      {r.status === 'running' ? `${r.progress?.phase ?? 'starting'}…` : r.status}
                      {r.endedAt && r.status === 'done' && ` · ${formatDuration(r.endedAt - r.startedAt)}`}
                    </span>
                    {r.status === 'done' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void window.harness.revealFile(r.output)
                        }}
                        title="Show in Finder"
                        className="rounded p-0.5 text-muted hover:text-fg"
                      >
                        <FolderOpen className="size-3.5" />
                      </button>
                    )}
                  </div>
                  {r.status === 'error' && r.error && <pre className="selectable mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10.5px] text-red-600">{r.error}</pre>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  )
}

function RenderProgressBar({ job }: { job: RenderJob }) {
  const p = job.progress
  // Bundling, rendering frames and encoding each fill the bar in turn; the label says which.
  const pct = p ? Math.min(1, p.current / Math.max(1, p.total)) : 0
  return (
    <div className="mt-2">
      <div className="mb-1 flex justify-between text-[10.5px] tabular-nums text-muted">
        <span className="capitalize">{p ? `${p.phase} ${p.phase === 'bundling' ? `${p.current}%` : `${p.current}/${p.total}`}` : 'Starting…'}</span>
        {p?.etaText && <span>~{p.etaText} left</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemax={100}>
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct * 100}%`, transition: 'width 300ms ease' }} />
      </div>
    </div>
  )
}
