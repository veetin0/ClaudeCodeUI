import { Box, Camera, Check, CircleAlert, Film, Images, Loader2, MessageSquarePlus, Play, Plus, Square, Wand2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { KIT3D_QUALITY, KIT3D_TYPES, kit3dChangePrompt, kit3dClipPrompt, type Kit3dClip, type Kit3dJob, type Kit3dType } from '@shared/kit3d'
import { fileUrl } from '@shared/visuals'
import { cn } from '@/lib/format'
import { useEvent } from '@/stores/event'
import { useKit3d } from '@/stores/kit3d'
import { menuItems, type MenuItem } from '@/ui/Menu'
import { NextButton } from '@/ui/NextButton'
import { SectorMeter } from '@/ui/Sectors'

const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-ink/60'
const mmss = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`)

/**
 * 3D clips for the pitch: HackForge's 3D kit in video/kit3d. Claude writes a clip from a type and a
 * line; here it gets stills, a render with progress, and a place in the pitch.
 */
export function Kit3dPanel() {
  const { state, error, load, setup, capture, cancel } = useKit3d()
  const askClaude = useEvent((s) => s.askClaude)
  const [adding, setAdding] = useState(false)
  useEffect(() => {
    void load()
    // Back from installing Python or ffmpeg: look again.
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])
  if (!state) return null
  const job = state.job
  const running = job?.status === 'running'
  const missing = state.requirements.filter((r) => !r.ok)
  const canSetup = !state.requirements.some((r) => !r.ok && (r.id === 'python' || r.id === 'npm'))

  return (
    <section className="rounded-2xl border border-line p-3">
      <div className="flex items-center gap-2">
        <Box className="size-4 text-accent-ink" />
        <span className="text-[13px] font-semibold">3D clips</span>
        {state.ready && (
          <button onClick={() => setAdding(!adding)} className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white hover:brightness-110">
            <Plus className="size-3.5" /> New 3D clip
          </button>
        )}
      </div>
      <p className="mt-0.5 text-[12px] text-muted">Short 3D shots for the pitch: your app with a 3D cursor, a laptop or phone, a product, problem cards, a logo sting.</p>

      {job && <JobLine job={job} onCancel={() => void cancel()} onCapture={() => void capture()} />}
      {error && <div className="selectable mt-2 text-[12px] text-danger-ink">{error}</div>}

      {!state.ready ? (
        <div className="mt-3 rounded-xl border border-dashed border-line p-3 text-[12px]">
          <p className="text-muted">
            The clips are made with HackForge's 3D kit (Three.js in a hidden Chrome, no GPU needed). Setting it up copies the kit into <code>video/kit3d/</code> and
            installs what it renders with: about 300 MB, once.
          </p>
          <ul className="mt-2 space-y-1">
            {state.requirements.map((r) => (
              <li key={r.id} className="flex items-start gap-1.5">
                {r.ok ? <Check className="mt-px size-3.5 shrink-0 text-ok-ink" /> : <CircleAlert className="mt-px size-3.5 shrink-0 text-warn-ink" />}
                <span className="font-medium">{REQ_LABEL[r.id]}</span>
                <span className={cn('selectable min-w-0 truncate', r.ok ? 'text-muted' : 'text-warn-ink')} title={r.ok ? r.found : r.hint}>
                  {r.ok ? r.found : r.found ? `${r.found} is too old. ${r.hint}` : r.hint}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => void setup()}
            disabled={running || !canSetup}
            className="mt-3 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {state.exists ? 'Finish setting up the 3D kit' : 'Set up the 3D kit'}
          </button>
          {!!missing.length && canSetup && <span className="ml-2 text-[11px] text-muted">You can set up now; rendering needs everything above.</span>}
        </div>
      ) : (
        <>
          {adding && (
            <NewClip
              onAsk={(type, text) => {
                setAdding(false)
                void askClaude(kit3dClipPrompt(type, text), '3D clip')
              }}
              onClose={() => setAdding(false)}
            />
          )}
          {state.listError && <div className="selectable mt-2 text-[12px] text-warn-ink">{state.listError}</div>}
          <div className="mt-2 space-y-2">
            {state.clips.map((c) => (
              <ClipRow key={c.name} clip={c} busy={running} activeJob={job?.clip === c.name && running ? (job.kind === 'render' ? (job.quality ?? 'final') : job.kind) : undefined} />
            ))}
            {!state.clips.length && !state.listError && <div className="py-3 text-center text-[12px] text-muted">No clips yet. Add one with New 3D clip.</div>}
          </div>
        </>
      )}
    </section>
  )
}

const REQ_LABEL = { python: 'Python', ffmpeg: 'ffmpeg', browser: 'Browser', npm: 'npm' } as const

function JobLine({ job, onCancel, onCapture }: { job: Kit3dJob; onCancel: () => void; onCapture: () => void }) {
  const running = job.status === 'running'
  const pct = job.total ? Math.min(100, Math.round(((job.done ?? 0) / job.total) * 100)) : undefined
  return (
    <div className="mt-2">
      <div
        className={cn(
          'flex items-center gap-2 text-[12px]',
          job.status === 'error' ? 'text-danger-ink' : job.status === 'done' ? 'text-ok-ink' : 'text-muted',
        )}
      >
        {running && <Loader2 className="size-3.5 shrink-0 animate-spin text-accent-ink" />}
        <span className="selectable min-w-0 flex-1 truncate" title={job.message}>
          {job.message}
        </span>
        {job.total !== undefined && (
          <span className="shrink-0 num">
            {job.done ?? 0}/{job.total} frames{job.etaSeconds !== undefined ? ` · about ${mmss(job.etaSeconds)} left` : ''}
          </span>
        )}
        {running && (
          <button onClick={onCancel} className="flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-px text-fg hover:bg-surface-2">
            <Square className="size-3" /> Stop
          </button>
        )}
        {job.status === 'error' && /capture_ui|ui_layout/.test(job.message) && (
          <button onClick={onCapture} className="flex shrink-0 items-center gap-1 rounded border border-line px-1.5 py-px text-fg hover:bg-surface-2" title="Start your app first (ui_states.mjs says where it runs)">
            <Camera className="size-3" /> Capture app screens
          </button>
        )}
      </div>
      {pct !== undefined && running && (
        <SectorMeter value={pct / 100} count={24} tone="live" height={3} className="mt-1.5" label="Render progress" />
      )}
    </div>
  )
}

function NewClip({ onAsk, onClose }: { onAsk: (type: Kit3dType, text: string) => void; onClose: () => void }) {
  const [type, setType] = useState<Kit3dType>('app')
  const [text, setText] = useState('')
  const hint = KIT3D_TYPES.find((t) => t.id === type)?.hint
  return (
    <div className="mt-3 rounded-xl border border-accent-ink/40 bg-accent/[0.04] p-3 text-[12px]">
      <div className="flex items-center gap-2">
        <Wand2 className="size-3.5 text-accent-ink" />
        <span className="font-medium">New 3D clip</span>
        <span className="text-muted">Claude writes it for your app and brand; then render it here.</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:text-fg" title="Close">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {KIT3D_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={cn('rounded-sm border px-2.5 py-0.5', type === t.id ? 'border-accent-ink bg-accent/10 font-medium' : 'border-line hover:bg-surface-2')}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-1.5 text-[12px] text-muted">{hint}</div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAsk(type, text)}
          placeholder="What should it show? e.g. the user types their goal, presses Plan, and the plan fills in"
          className={field}
          autoFocus
        />
        <button onClick={() => onAsk(type, text)} className="shrink-0 rounded-md bg-accent px-3 font-medium text-white hover:brightness-110">
          Ask Claude to write it
        </button>
      </div>
    </div>
  )
}

function ClipRow({ clip, busy, activeJob }: { clip: Kit3dClip; busy: boolean; activeJob?: string }) {
  const { stills, render, addToPitch } = useKit3d()
  const askClaude = useEvent((s) => s.askClaude)
  const [playing, setPlaying] = useState(false)
  const [changing, setChanging] = useState(false)
  const [change, setChange] = useState('')
  const [zoom, setZoom] = useState<string | null>(null)
  // One next step per clip: Stills → Draft → Final → Add to pitch → Play; the rest behind ▾.
  type Act = { label: string; icon: typeof Film; run: () => void; disabled?: boolean; busy?: boolean; hint?: string }
  const acts: Record<'stills' | 'draft' | 'final' | 'pitch' | 'play' | 'change', Act | null> = {
    stills: { label: 'Stills', icon: Images, run: () => void stills(clip.name), disabled: busy, busy: activeJob === 'stills', hint: 'Up to 20 half-size frames at the moments that matter, in about a minute' },
    draft: { label: 'Render draft', icon: Film, run: () => void render(clip.name, 'draft'), disabled: busy, busy: activeJob === 'draft', hint: '540p with less motion blur: check the pacing quickly' },
    final: { label: 'Render final', icon: Film, run: () => void render(clip.name, 'final'), disabled: busy, busy: activeJob === 'final', hint: '1080p with full motion blur: what goes in the pitch (a few to 30 minutes)' },
    pitch:
      clip.video && clip.pitch !== 'current'
        ? { label: clip.pitch === 'stale' ? 'Update in pitch' : 'Add to pitch', icon: Plus, run: () => void addToPitch(clip.name), hint: 'Copies it to pitch/public/3d/ and puts it in a demo-clip scene' }
        : null,
    play: clip.video ? { label: playing ? 'Hide video' : 'Play', icon: Play, run: () => setPlaying(!playing) } : null,
    change: { label: 'Ask Claude to change it', icon: MessageSquarePlus, run: () => setChanging(!changing) },
  }
  const next = !clip.video ? (clip.stills.length ? 'draft' : 'stills') : clip.video.quality === 'draft' ? 'final' : clip.pitch !== 'current' ? 'pitch' : 'play'
  const primary = acts[next]!
  const more: MenuItem[] = (Object.keys(acts) as (keyof typeof acts)[])
    .filter((k) => k !== next && acts[k])
    .map((k) => ({ label: acts[k]!.label, icon: acts[k]!.icon, hint: acts[k]!.hint, disabled: acts[k]!.disabled, onSelect: acts[k]!.run }))
  return (
    <div className="rounded-xl border border-line p-2.5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[13px] font-medium">{clip.name}</span>
            {clip.seconds !== undefined && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">{clip.seconds.toFixed(1)} s</span>}
            {clip.uses
              ?.filter((u) => ['screen', 'device', 'product', 'cards', 'logo', 'hero', 'cursor'].includes(u))
              .map((u) => (
                <span key={u} className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">
                  {u}
                </span>
              ))}
            {clip.talks && <span className="rounded bg-surface-2 px-1.5 text-[11px] text-muted">speaks</span>}
            {clip.video && <span className="rounded bg-ok/10 px-1.5 text-[11px] text-ok-ink">{KIT3D_QUALITY[clip.video.quality].label} rendered</span>}
            {clip.pitch === 'current' && (
              <span className="flex items-center gap-0.5 rounded bg-ok/10 px-1.5 text-[11px] text-ok-ink">
                <Check className="size-3" /> in the pitch
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-muted">{clip.doc}</div>
        </div>
        <NextButton
          tone="secondary"
          icon={primary.icon}
          onClick={primary.run}
          disabled={primary.disabled}
          busy={primary.busy}
          title={primary.hint}
          more={menuItems(...more)}
        >
          {primary.label}
        </NextButton>
      </div>
      {!!clip.stills.length && (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {clip.stills.map((s) => (
            <button key={s} onClick={() => setZoom(s)} className="shrink-0 overflow-hidden rounded border border-line hover:border-accent-ink">
              <img src={fileUrl(s)} alt="" className="h-16 w-auto" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      {playing && clip.video && (
        // The mtime in the URL: a new render plays instead of the cached old one.
        <video src={`${fileUrl(clip.video.path)}?v=${Math.round(clip.video.mtime)}`} controls autoPlay className="mt-2 max-h-80 w-full rounded-lg bg-black" />
      )}
      {changing && (
        <div className="mt-2 flex gap-1.5">
          <input
            value={change}
            onChange={(e) => setChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && change.trim()) {
                void askClaude(kit3dChangePrompt(clip.name, change), '3D clip')
                setChange('')
                setChanging(false)
              }
            }}
            placeholder="What should change? e.g. slower camera, the cards in our brand colour, end on the Publish button"
            className={field}
            autoFocus
          />
          <button
            disabled={!change.trim()}
            onClick={() => {
              void askClaude(kit3dChangePrompt(clip.name, change), '3D clip')
              setChange('')
              setChanging(false)
            }}
            className="shrink-0 rounded-md bg-accent px-3 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            Ask Claude
          </button>
        </div>
      )}
      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8" onClick={() => setZoom(null)}>
          <img src={fileUrl(zoom)} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  )
}
