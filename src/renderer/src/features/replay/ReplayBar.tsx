import { Pause, Play, SkipBack, X } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { cn } from '@/lib/format'
import { formatOffset } from '@/features/mission/layout'
import { useApp } from '@/stores/app'
import { replayBounds } from '@/stores/replay'

const SPEEDS = [1, 4, 16, 64]

/**
 * Scrubber for replaying a session: every view (chat, board, graph, timeline, files) shows the
 * session as it was at the playhead. Ticks mark prompts (accent), finished turns and subagents.
 */
export function ReplayBar({ sessionId }: { sessionId: string }) {
  const { replay, setReplay } = useApp()
  const bounds = useMemo(() => replayBounds(sessionId), [sessionId])
  const span = Math.max(1, bounds.end - bounds.start)

  // Advance the playhead in real time × speed.
  useEffect(() => {
    if (!replay?.playing) return
    let last = performance.now()
    let raf = 0
    const step = (now: number) => {
      const r = useApp.getState().replay
      if (!r?.playing) return
      const t = Math.min(bounds.end, r.t + (now - last) * r.speed)
      last = now
      setReplay({ t, playing: t < bounds.end })
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [replay?.playing, bounds.end, setReplay])

  if (!replay) return null
  const pct = ((replay.t - bounds.start) / span) * 100

  return (
    <div className="mx-auto mb-4 w-full max-w-3xl px-6">
      <div className="rounded-2xl border border-accent-ink/40 bg-surface p-3 shadow-[0_4px_24px_rgb(0_0_0/0.08)]">
        <div className="mb-2 flex items-center gap-2 text-[12px]">
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-ink">Replay</span>
          <span className="num text-muted">
            {formatOffset(replay.t - bounds.start)} / {formatOffset(span)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setReplay({ speed: s })}
                className={cn('rounded px-1.5 py-0.5 text-[12px] num', replay.speed === s ? 'bg-surface-2 font-medium text-fg' : 'text-muted hover:text-fg')}
              >
                {s}×
              </button>
            ))}
            <button onClick={() => setReplay(null)} className="ml-1 rounded p-1 text-muted hover:bg-hover hover:text-fg" title="Exit replay (Esc)">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={() => setReplay({ t: bounds.start, playing: false })} className="rounded p-1 text-muted hover:text-fg" title="Back to start">
            <SkipBack className="size-4" />
          </button>
          <button
            onClick={() => setReplay({ playing: !replay.playing, t: replay.t >= bounds.end ? bounds.start : replay.t })}
            className="flex size-8 items-center justify-center rounded-full bg-accent text-white hover:brightness-110"
            title={replay.playing ? 'Pause' : 'Play'}
          >
            {replay.playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <div className="relative h-8 flex-1">
            {/* markers */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-line" />
            <div className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-accent/60" style={{ width: `${pct}%` }} />
            {bounds.marks.map((m, i) => (
              <span
                key={i}
                title={m.kind === 'prompt' ? 'Prompt' : m.kind === 'turn' ? 'Turn finished' : 'Subagent started'}
                className={cn(
                  'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                  m.kind === 'prompt' ? 'h-3.5 w-1 bg-accent' : m.kind === 'turn' ? 'h-2.5 w-0.5 bg-fg/50' : 'size-1.5 bg-[var(--series-5)]',
                )}
                style={{ left: `${((m.t - bounds.start) / span) * 100}%` }}
              />
            ))}
            <input
              type="range"
              min={bounds.start}
              max={bounds.end}
              step={Math.max(1, span / 1000)}
              value={replay.t}
              onChange={(e) => setReplay({ t: Number(e.target.value), playing: false })}
              aria-label="Replay position"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
            />
            <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-accent shadow" style={{ left: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
