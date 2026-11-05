import { Clapperboard, FolderOpen, Loader2, MessageSquarePlus, Play, RotateCcw, Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import type { EventState } from '@shared/event'
import {
  cartoonPrompt,
  customVideoPrompt,
  PITCH_TEMPLATES,
  VIDEO_OUT_DIR,
  videoChangePrompt,
  type PitchChoice,
  type PitchState,
  type VideoFormat,
} from '@shared/pitch'
import { fileUrl } from '@shared/visuals'
import { cn } from '@/lib/format'
import { useEvent } from '@/stores/event'
import { usePitch } from '@/stores/pitch'
import slidesThumb from '@/assets/pitch/slides.jpg'
import threeDThumb from '@/assets/pitch/3d.jpg'
import cartoonThumb from '@/assets/pitch/cartoon.jpg'

const THUMBS = { slides: slidesThumb, '3d': threeDThumb, cartoon: cartoonThumb }
const TARGET_SECONDS = 120

/** Downloads the cartoon skill if needed, then hands the short to Claude in a new session. */
async function startCartoon(format: VideoFormat) {
  if (!(await usePitch.getState().installCartoon())) return
  await useEvent.getState().askClaude(cartoonPrompt(format), 'Cartoon short', { fresh: true })
}

/**
 * The Pitch tab's first question: what kind of video, if any. Three ready-made styles with a still
 * from each, "Something else" for anything you can describe, or no video at all. The answer is saved
 * in pitch/style.json (shared with the team through git) and can be changed later; nothing made so
 * far is deleted.
 */
export function PitchChooser({ event }: { event: EventState }) {
  const { choose, error } = usePitch()
  const [format, setFormat] = useState<VideoFormat>('vertical')
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const name = event.config.name
  const pick = async (choice: Omit<PitchChoice, 'at'>, then?: () => Promise<void>) => {
    setBusy(choice.style)
    if (await choose(choice, name)) await then?.()
    setBusy(null)
  }
  return (
    <div className="space-y-4">
      <section>
        <h1 className="flex items-center gap-2 font-display text-[22px] font-semibold">
          <Clapperboard className="size-5 text-accent-ink" /> Do you want a pitch or promo video?
        </h1>
        <p className="mt-1 text-[13px] text-muted">Pick a style to start from. You can change it later; nothing you make is deleted.</p>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {PITCH_TEMPLATES.map((t) => (
          <article key={t.style} data-style={t.style} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <img src={THUMBS[t.style]} alt={`A frame from a ${t.title.toLowerCase()} video`} className="aspect-video w-full bg-surface-2 object-cover" />
            <div className="flex flex-1 flex-col p-3">
              <h2 className="text-[14px] font-semibold">{t.title}</h2>
              <p className="mt-1 flex-1 text-[12px] text-muted">{t.line}</p>
              <div className="mt-2 text-[11px] text-muted">
                {t.time} · needs {t.needs}
              </div>
              {t.style === 'cartoon' && (
                <div className="mt-2 flex gap-1 text-[12px]" role="radiogroup" aria-label="Format">
                  {(['vertical', 'horizontal'] as const).map((f) => (
                    <button
                      key={f}
                      role="radio"
                      aria-checked={format === f}
                      onClick={() => setFormat(f)}
                      className={cn('flex-1 rounded-md border px-2 py-1', format === f ? 'border-accent-ink bg-accent/10 font-medium' : 'border-line hover:bg-surface-2')}
                    >
                      {f === 'vertical' ? 'Vertical 9:16' : 'Horizontal 16:9'}
                    </button>
                  ))}
                </div>
              )}
              <button
                disabled={!!busy}
                onClick={() => void pick(t.style === 'cartoon' ? { style: 'cartoon', format } : { style: t.style }, t.style === 'cartoon' ? () => startCartoon(format) : undefined)}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                {busy === t.style && <Loader2 className="size-3.5 animate-spin" />} Use this style
              </button>
            </div>
          </article>
        ))}
      </div>
      <section className="rounded-2xl border border-line p-3">
        <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
          <Wand2 className="size-4 text-accent-ink" /> Something else
        </h2>
        <p className="mt-0.5 text-[12px] text-muted">Describe the video you want, and Claude plans it, shows you the plan, then builds it.</p>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          placeholder="For example: a 60 s screen recording of the app with upbeat music and big captions, ending on our logo"
          className="selectable mt-2 w-full resize-y rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-ink/60"
        />
        <button
          disabled={!brief.trim() || !!busy}
          onClick={() =>
            void pick({ style: 'custom', brief }, () => useEvent.getState().askClaude(customVideoPrompt(brief, TARGET_SECONDS), 'Pitch video', { fresh: true }))
          }
          className="mt-2 flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          {busy === 'custom' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Ask Claude to make it
        </button>
      </section>
      <div className="flex items-center gap-3 text-[12px] text-muted">
        <button disabled={!!busy} onClick={() => void pick({ style: 'none' })} className="underline hover:text-fg">
          Skip the pitch video
        </button>
        <span>The team run then writes the pitch text but makes no video.</span>
      </div>
      {error && <div className="selectable text-[12px] text-danger-ink">{error}</div>}
    </div>
  )
}

/** Back to the chooser; the files made so far stay. */
const changeType = (event: EventState) => void usePitch.getState().choose(null, event.config.name)

/** The team chose no video. */
export function NoPitch({ event }: { event: EventState }) {
  return (
    <section className="rounded-2xl border border-dashed border-line p-5 text-[13px]">
      <h2 className="font-semibold">No pitch video</h2>
      <p className="mt-1 text-muted">The team skipped the video. The team run still writes the pitch itself, and the demo and the pitch text are what judges see.</p>
      <button onClick={() => changeType(event)} className="mt-3 rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2">
        Make one after all
      </button>
    </section>
  )
}

/** A cartoon short or a video described in "Something else": Claude makes it; the result lands in pitch/out/. */
export function YourVideo({ event, state }: { event: EventState; state: PitchState }) {
  const choice = state.choice!
  const askClaude = useEvent((s) => s.askClaude)
  const error = usePitch((s) => s.error)
  const [change, setChange] = useState('')
  const [playing, setPlaying] = useState<string | null>(state.videos[0] ?? null)
  const cartoon = choice.style === 'cartoon'
  const format = choice.format ?? 'vertical'
  const outDir = `${state.dir}/${VIDEO_OUT_DIR}`
  const latest = state.videos[0]
  const status =
    cartoon && state.cartoon.status === 'installing'
      ? 'Downloading the cartoon short skill from GitHub…'
      : cartoon && state.cartoon.status === 'error'
        ? state.cartoon.error
        : latest
          ? `${state.videos.length} video${state.videos.length === 1 ? '' : 's'} in pitch/${VIDEO_OUT_DIR}/`
          : 'Claude is making it in its own session: it shows you the script or plan first, then renders. The video appears here when it’s copied to pitch/out/.'
  const again = () =>
    cartoon ? void startCartoon(format) : void askClaude(customVideoPrompt(choice.brief ?? '', TARGET_SECONDS), 'Pitch video', { fresh: true })
  return (
    <div className="space-y-3">
      <section className="flex gap-4 rounded-2xl border border-line p-4">
        {cartoon && <img src={cartoonThumb} alt="" className="hidden h-24 w-40 shrink-0 rounded-lg object-cover sm:block" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{cartoon ? `Cartoon short (${format === 'vertical' ? 'vertical 9:16' : 'horizontal 16:9'})` : 'Your own video'}</h2>
          {choice.brief && <p className="selectable mt-1 line-clamp-3 text-[12px] text-muted">“{choice.brief}”</p>}
          <p className={cn('mt-2 flex items-center gap-1.5 text-[12px]', cartoon && state.cartoon.status === 'error' ? 'text-danger-ink' : 'text-muted')}>
            {cartoon && state.cartoon.status === 'installing' && <Loader2 className="size-3.5 animate-spin" />}
            {status}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
            {cartoon && state.cartoon.status === 'error' ? (
              <button onClick={() => void startCartoon(format)} className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:brightness-110">
                Try again
              </button>
            ) : (
              <button onClick={again} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
                <Sparkles className="size-3.5" /> {latest ? 'Make a new one' : 'Ask Claude again'}
              </button>
            )}
            {latest && (
              <button onClick={() => void window.harness.revealFile(`${outDir}/${latest}`)} className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 hover:bg-surface-2">
                <FolderOpen className="size-3.5" /> Show in folder
              </button>
            )}
            <button onClick={() => changeType(event)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
              <RotateCcw className="size-3.5" /> Change video type
            </button>
          </div>
        </div>
      </section>
      {state.videos.length > 0 && (
        <section className="rounded-2xl border border-line p-4">
          <div className="flex flex-wrap gap-2">
            {state.videos.map((v) => (
              <button
                key={v}
                onClick={() => setPlaying(v)}
                className={cn('flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px]', playing === v ? 'border-accent-ink bg-accent/10' : 'border-line hover:bg-surface-2')}
              >
                <Play className="size-3" /> {v}
              </button>
            ))}
          </div>
          {playing && (
            <video
              key={playing}
              src={fileUrl(`${outDir}/${playing}`)}
              controls
              className={cn('mt-3 rounded-lg bg-black', cartoon && format === 'vertical' ? 'mx-auto max-h-[70vh]' : 'w-full')}
            />
          )}
          <div className="mt-3 flex gap-1.5">
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && change.trim() && (void askClaude(videoChangePrompt(change, playing ?? undefined), 'Video change'), setChange(''))}
              placeholder="Ask Claude to change it, e.g. a shorter ending, a warmer voice"
              className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12px] outline-none focus:border-accent-ink/60"
            />
            <button
              disabled={!change.trim()}
              onClick={() => {
                void askClaude(videoChangePrompt(change, playing ?? undefined), 'Video change')
                setChange('')
              }}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 text-[12px] hover:bg-surface-2 disabled:opacity-40"
            >
              <MessageSquarePlus className="size-3.5" /> Ask Claude
            </button>
          </div>
        </section>
      )}
      {error && <div className="selectable text-[12px] text-danger-ink">{error}</div>}
    </div>
  )
}
