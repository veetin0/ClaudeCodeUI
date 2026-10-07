import { ArrowDown, ArrowUp, AudioLines, Bot, Clapperboard, Download, KeyRound, MonitorPlay, Pause, Play, Plus, RotateCcw, SkipBack, SkipForward, Timer, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventState } from '@shared/event'
import {
  audioState,
  defaultScript,
  estimateSeconds,
  newSceneId,
  sceneSeconds,
  totalSeconds,
  VISUALS,
  words,
  writeScriptPrompt,
  type PitchScene,
  type PitchScript,
  type Visual,
} from '@shared/pitch'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useEvent } from '@/stores/event'
import { usePitch } from '@/stores/pitch'

const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--accent)]/60'
const VISUAL_LABEL: Record<Visual, string> = { title: 'Title card', bullets: 'Bullet points', quote: 'Big statement', screen: 'Demo clip / screenshot', end: 'End card' }
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** The narrated pitch video: script editor, ElevenLabs narration, timing against the limit, rehearsal. */
export function PitchStudio({ event }: { event: EventState }) {
  const { state, draft, error, load, scaffold } = usePitch()
  useEffect(() => {
    void load()
  }, [event.projectDir, load])

  if (!event.projectDir) return <Empty text="Set up or link the event project (Overview tab) first. The pitch video lives in its pitch/ folder." />
  if (!state) return <Empty text="Loading…" />
  if (!state.exists) {
    return (
      <section className="rounded-2xl border border-dashed border-[var(--accent)]/50 p-5">
        <div className="flex items-start gap-3">
          <Clapperboard className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
          <div>
            <h2 className="text-[13px] font-semibold">Create the pitch studio</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-muted">
              Adds <code>pitch/</code> to the event project: a Remotion video driven by <code>pitch/script.json</code>, with title, bullet, statement, demo-clip and
              end scenes, plus a progress bar. Each scene's narration is generated with ElevenLabs, and the video times itself to the voice. It starts from a script
              shaped for this pitch: the inherited model, your flip, the live demo, how it works, and why it matters.
            </p>
            <button onClick={() => void scaffold(event.config.name)} className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
              Create pitch/
            </button>
            {error && <div className="selectable mt-2 text-[12px] text-red-500">{error}</div>}
          </div>
        </div>
      </section>
    )
  }
  return (
    <div className="space-y-3">
      <Toolbar />
      {error && <div className="selectable rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2 text-[12px] text-red-600">{error}</div>}
      {state.scriptError && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-[12px]">
          {state.scriptError}
          <button onClick={() => void usePitch.getState().replace(defaultScript(event.config.name))} className="ml-auto shrink-0 rounded-md border border-line px-2 py-0.5 hover:bg-surface-2">
            Start a fresh script
          </button>
        </div>
      )}
      {draft && (
        <>
          <VoiceRow />
          <ScriptHeader script={draft} />
          <TimingBar script={draft} />
          <Scenes script={draft} media={state.media} />
        </>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-[12.5px] text-muted">{text}</div>
}

function Toolbar() {
  const { state, draft, install, narrate, dirty } = usePitch()
  const askClaude = useEvent((s) => s.askClaude)
  const { startSession, setView } = useApp()
  const [rehearse, setRehearse] = useState(false)
  const job = state!.job
  const running = job?.status === 'running'
  const pending = draft ? draft.scenes.filter((s) => ['none', 'stale'].includes(audioState(s, draft.voiceId))).length : 0
  return (
    <section className="rounded-2xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {!state!.installed && (
          <ToolBtn icon={Download} onClick={() => void install()} disabled={running} primary>
            Install Remotion
          </ToolBtn>
        )}
        <ToolBtn
          icon={MonitorPlay}
          disabled={!state!.installed}
          title={state!.installed ? 'Opens a session in pitch/ on the Preview tab: Start Studio for a live preview, Render for the MP4' : 'Install Remotion first'}
          onClick={async () => {
            await startSession(state!.dir!)
            setView('preview')
          }}
        >
          Preview & render
        </ToolBtn>
        <ToolBtn icon={Bot} onClick={() => void askClaude(writeScriptPrompt(draft?.targetSeconds ?? 120), 'Pitch script')} disabled={!draft}>
          Write script with Claude
        </ToolBtn>
        <ToolBtn icon={AudioLines} onClick={() => void narrate()} disabled={running || !draft || pending === 0} title={pending ? `${pending} scene(s) need narration` : 'All narration is up to date'}>
          Generate narration{pending ? ` (${pending})` : ''}
        </ToolBtn>
        <ToolBtn icon={Timer} onClick={() => setRehearse(true)} disabled={!draft?.scenes.length}>
          Rehearse
        </ToolBtn>
        <span className="ml-auto text-[11px] text-muted">{dirty ? 'Saving…' : 'Saved to pitch/script.json'}</span>
      </div>
      {job && (
        <div className={cn('mt-2 flex items-center gap-2 text-[12px]', job.status === 'error' ? 'text-red-500' : job.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
          {running && <span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" />}
          <span className="selectable min-w-0 flex-1 truncate" title={job.message}>
            {job.message}
          </span>
          {job.total !== undefined && (
            <span className="tabular-nums">
              {job.done ?? 0}/{job.total}
            </span>
          )}
        </div>
      )}
      {rehearse && draft && <Rehearsal script={draft} onClose={() => setRehearse(false)} />}
    </section>
  )
}

function ToolBtn({ icon: Icon, children, onClick, disabled, primary, title }: { icon: typeof Bot; children: React.ReactNode; onClick: () => void; disabled?: boolean; primary?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] disabled:opacity-40',
        primary ? 'bg-[var(--accent)] font-medium text-white hover:brightness-110' : 'border border-line hover:bg-surface-2',
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

function VoiceRow() {
  const hasKey = useApp((s) => s.settings?.hasElevenLabsKey)
  const { draft, edit, voices, voicesError, loadVoices, setKey } = usePitch()
  const [key, setKeyText] = useState('')
  const [manual, setManual] = useState(false)
  useEffect(() => {
    if (hasKey && !voices && !voicesError) void loadVoices()
  }, [hasKey, voices, voicesError, loadVoices])
  if (!hasKey) {
    return (
      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3 text-[12px]">
        <KeyRound className="size-4 text-muted" />
        <span>Add your ElevenLabs API key for narration (stored in the macOS Keychain).</span>
        <input type="password" value={key} onChange={(e) => setKeyText(e.target.value)} placeholder="xi-…" className={cn(field, 'w-64')} />
        <button disabled={!key.trim()} onClick={() => void setKey(key.trim())} className="rounded-md bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:brightness-110 disabled:opacity-40">
          Save key
        </button>
      </section>
    )
  }
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3 text-[12px]">
      <AudioLines className="size-4 text-[var(--accent)]" />
      <span className="font-medium">Narrator</span>
      {voices && !manual ? (
        <select
          value={draft!.voiceId ?? ''}
          onChange={(e) => {
            const v = voices.find((x) => x.id === e.target.value)
            edit((s) => ({ ...s, voiceId: v?.id, voiceName: v?.name }))
          }}
          className="min-w-64 rounded-md border border-line bg-surface-2 px-2 py-1.5"
        >
          <option value="">Pick a voice…</option>
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.description ? ` (${v.description})` : ''}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={draft!.voiceId ?? ''}
          onChange={(e) => edit((s) => ({ ...s, voiceId: e.target.value.trim() || undefined, voiceName: undefined }))}
          placeholder="Voice ID (from the ElevenLabs voice library)"
          className={cn(field, 'w-80')}
        />
      )}
      {voicesError && (
        <span className="text-amber-600" title={voicesError}>
          Couldn't list voices: {voicesError}. Paste a voice ID instead.
        </span>
      )}
      {voices && (
        <button onClick={() => setManual(!manual)} className="text-muted underline-offset-2 hover:text-fg hover:underline">
          {manual ? 'Pick from list' : 'Enter a voice ID'}
        </button>
      )}
      <button onClick={() => window.confirm('Remove the stored ElevenLabs key?') && void setKey(null)} className="ml-auto text-muted hover:text-fg">
        Change key
      </button>
    </section>
  )
}

function ScriptHeader({ script }: { script: PitchScript }) {
  const edit = usePitch((s) => s.edit)
  return (
    <section className="grid gap-2 rounded-2xl border border-line p-3 md:grid-cols-[2fr_3fr_2fr_auto_auto]">
      <Labeled label="Project name">
        <input value={script.title} onChange={(e) => edit((s) => ({ ...s, title: e.target.value }))} className={field} />
      </Labeled>
      <Labeled label="Tagline">
        <input value={script.tagline ?? ''} onChange={(e) => edit((s) => ({ ...s, tagline: e.target.value }))} className={field} />
      </Labeled>
      <Labeled label="End-card line">
        <input value={script.team ?? ''} onChange={(e) => edit((s) => ({ ...s, team: e.target.value }))} className={field} />
      </Labeled>
      <Labeled label="Time limit (s)">
        <input
          type="number"
          min={15}
          max={600}
          value={script.targetSeconds}
          onChange={(e) => edit((s) => ({ ...s, targetSeconds: Math.max(15, Number(e.target.value) || 120) }))}
          className={cn(field, 'w-24')}
        />
      </Labeled>
      <Labeled label="Accent">
        <input type="color" value={script.accent ?? '#d97757'} onChange={(e) => edit((s) => ({ ...s, accent: e.target.value }))} className="h-[34px] w-12 rounded-md border border-line bg-surface-2" />
      </Labeled>
    </section>
  )
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium text-muted">{label}</div>
      {children}
    </label>
  )
}

function TimingBar({ script }: { script: PitchScript }) {
  const total = totalSeconds(script)
  const span = Math.max(total, script.targetSeconds)
  const over = total > script.targetSeconds
  return (
    <section className="rounded-2xl border border-line p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px]">
        <span className="font-medium">Length</span>
        <span className={cn('tabular-nums', over ? 'font-semibold text-red-500' : 'text-emerald-600 dark:text-emerald-400')}>
          {fmt(total)} / {fmt(script.targetSeconds)}
        </span>
        <span className="text-muted">{over ? `${Math.ceil(total - script.targetSeconds)} s over: cut words or scenes` : `${Math.floor(script.targetSeconds - total)} s to spare`}</span>
        <span className="ml-auto text-[11px] text-muted">Narrated scenes use the real audio length; others are estimated at ~155 words/min.</span>
      </div>
      <div className="relative flex h-6 overflow-hidden rounded-md bg-line/60">
        {script.scenes.map((s, i) => {
          const sec = sceneSeconds(s, script.voiceId)
          return (
            <div
              key={s.id}
              title={`${s.title || VISUAL_LABEL[s.visual]} · ${sec.toFixed(1)} s`}
              className={cn('flex items-center overflow-hidden border-r border-surface px-1 text-[10px] text-white', i % 2 ? 'bg-[var(--accent)]/80' : 'bg-[var(--accent)]')}
              style={{ width: `${(sec / span) * 100}%` }}
            >
              <span className="truncate">{s.title}</span>
            </div>
          )
        })}
        <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${(script.targetSeconds / span) * 100}%` }} title="Time limit" />
      </div>
    </section>
  )
}

function Scenes({ script, media }: { script: PitchScript; media: string[] }) {
  const edit = usePitch((s) => s.edit)
  const update = (id: string, patch: Partial<PitchScene>) => edit((s) => ({ ...s, scenes: s.scenes.map((x) => (x.id === id ? { ...x, ...patch } : x)) }))
  const move = (i: number, d: -1 | 1) =>
    edit((s) => {
      const scenes = [...s.scenes]
      const j = i + d
      if (j < 0 || j >= scenes.length) return s
      ;[scenes[i], scenes[j]] = [scenes[j], scenes[i]]
      return { ...s, scenes }
    })
  return (
    <div className="space-y-2">
      <datalist id="pitch-media">
        {media.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {script.scenes.map((s, i) => (
        <SceneEditor
          key={s.id}
          scene={s}
          index={i}
          count={script.scenes.length}
          voiceId={script.voiceId}
          media={media}
          onChange={(p) => update(s.id, p)}
          onMove={(d) => move(i, d)}
          onDelete={() => window.confirm(`Delete scene “${s.title || i + 1}”?`) && edit((x) => ({ ...x, scenes: x.scenes.filter((y) => y.id !== s.id) }))}
        />
      ))}
      <button
        onClick={() => edit((s) => ({ ...s, scenes: [...s.scenes, { id: newSceneId(), visual: 'bullets', title: 'New scene', narration: '', bullets: [] }] }))}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line py-2 text-[12px] text-muted hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="size-3.5" /> Add scene
      </button>
    </div>
  )
}

function SceneEditor({
  scene: s,
  index,
  count,
  voiceId,
  media,
  onChange,
  onMove,
  onDelete,
}: {
  scene: PitchScene
  index: number
  count: number
  voiceId?: string
  media: string[]
  onChange: (p: Partial<PitchScene>) => void
  onMove: (d: -1 | 1) => void
  onDelete: () => void
}) {
  const audio = audioState(s, voiceId)
  const est = estimateSeconds(s.narration)
  return (
    <section className="rounded-2xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-6 text-center text-[11px] font-semibold text-muted">{index + 1}</span>
        <input value={s.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="On-screen title" className={cn(field, 'w-auto min-w-0 flex-1 font-medium')} />
        <select value={s.visual} onChange={(e) => onChange({ visual: e.target.value as Visual })} className="rounded-md border border-line bg-surface-2 px-2 py-1.5 text-[12px]">
          {VISUALS.map((v) => (
            <option key={v} value={v}>
              {VISUAL_LABEL[v]}
            </option>
          ))}
        </select>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10.5px]',
            audio === 'fresh' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : audio === 'stale' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-line/70 text-muted',
          )}
          title={audio === 'stale' ? 'The text or voice changed since this was narrated; the video ignores the old audio until you regenerate' : undefined}
        >
          {audio === 'fresh' ? `narrated · ${s.audioSeconds?.toFixed(1)} s` : audio === 'stale' ? 'narration outdated' : audio === 'silent' ? 'no narration' : 'not narrated yet'}
        </span>
        <div className="flex">
          <IconBtn onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            <ArrowUp className="size-3.5" />
          </IconBtn>
          <IconBtn onClick={() => onMove(1)} disabled={index === count - 1} title="Move down">
            <ArrowDown className="size-3.5" />
          </IconBtn>
          <IconBtn onClick={onDelete} title="Delete scene">
            <Trash2 className="size-3.5" />
          </IconBtn>
        </div>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-[3fr_2fr]">
        <div>
          <textarea value={s.narration} onChange={(e) => onChange({ narration: e.target.value })} rows={3} placeholder="What the narrator says" className={cn(field, 'resize-y')} />
          <div className="mt-0.5 text-[10.5px] text-muted">
            {words(s.narration)} words · ~{est.toFixed(1)} s spoken
          </div>
        </div>
        <div className="space-y-2">
          {s.visual === 'bullets' && (
            <BulletsField bullets={s.bullets ?? []} onChange={(bullets) => onChange({ bullets })} />
          )}
          {s.visual === 'screen' && (
            <div>
              <input value={s.media ?? ''} onChange={(e) => onChange({ media: e.target.value || undefined })} list="pitch-media" placeholder="demo.mp4 (in pitch/public/)" className={field} />
              {s.media && !media.includes(s.media) && <div className="mt-0.5 text-[10.5px] text-amber-600">Not in pitch/public/ yet. The video shows a placeholder until it's there.</div>}
            </div>
          )}
          <label className="flex items-center gap-2 text-[11.5px] text-muted">
            Minimum length
            <input
              type="number"
              min={0}
              max={120}
              value={s.seconds ?? ''}
              onChange={(e) => onChange({ seconds: e.target.value ? Math.max(0, Number(e.target.value)) : undefined })}
              placeholder="auto"
              className={cn(field, 'w-20')}
            />
            s
          </label>
        </div>
      </div>
    </section>
  )
}

/** Raw text while typing (so a fresh empty line survives auto-save), cleaned on blur. */
function BulletsField({ bullets, onChange }: { bullets: string[]; onChange: (b: string[]) => void }) {
  const [text, setText] = useState(bullets.join('\n'))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(bullets.join('\n'))
  }, [bullets])
  const clean = (t: string) => t.split('\n').map((b) => b.trim()).filter(Boolean).slice(0, 8)
  return (
    <textarea
      value={text}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        setText(e.target.value)
        onChange(clean(e.target.value))
      }}
      onBlur={() => {
        focused.current = false
        setText(clean(text).join('\n'))
      }}
      rows={3}
      placeholder="One bullet per line (≤ 4 reads best)"
      className={cn(field, 'resize-y')}
    />
  )
}

function IconBtn({ children, onClick, disabled, title }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="rounded p-1.5 text-muted hover:bg-black/5 hover:text-fg disabled:opacity-30 dark:hover:bg-white/10">
      {children}
    </button>
  )
}

/** Full-screen teleprompter with the video's timing: practise the live pitch against the clock. */
function Rehearsal({ script, onClose }: { script: PitchScript; onClose: () => void }) {
  const bounds = useMemo(() => {
    let t = 0
    return script.scenes.map((s) => {
      const start = t
      t += sceneSeconds(s, script.voiceId)
      return { start, end: t }
    })
  }, [script])
  const total = bounds.at(-1)?.end ?? 0
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const last = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) {
      last.current = null
      return
    }
    let raf = 0
    const tick = (now: number) => {
      if (last.current !== null) setElapsed((e) => e + (now - last.current!) / 1000)
      last.current = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const idx = Math.max(0, bounds.findIndex((b) => elapsed < b.end) === -1 ? bounds.length - 1 : bounds.findIndex((b) => elapsed < b.end))
  const jump = (i: number) => setElapsed(bounds[Math.max(0, Math.min(bounds.length - 1, i))].start)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'ArrowRight') jump(idx + 1)
      else if (e.key === 'ArrowLeft') jump(idx - 1)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const scene = script.scenes[idx]
  const over = elapsed > script.targetSeconds
  const sceneLeft = bounds[idx].end - elapsed
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f0f12] text-[#f4f2ee]">
      <div className="flex items-center gap-3 px-6 py-3 text-[13px]">
        <span className="font-semibold">Rehearsal</span>
        <span className="text-white/50">
          Scene {idx + 1} / {script.scenes.length}
        </span>
        <span className={cn('ml-auto text-[22px] font-semibold tabular-nums', over ? 'text-red-400' : '')}>
          {fmt(elapsed)} <span className="text-[14px] text-white/40">/ {fmt(script.targetSeconds)}</span>
        </span>
        <button onClick={onClose} className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white" title="Close (Esc)">
          <X className="size-5" />
        </button>
      </div>
      <div className="mx-6 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, (elapsed / Math.max(total, 1)) * 100)}%` }} />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-16 text-center">
        <div className="text-[14px] uppercase tracking-widest text-white/40">{scene.title}</div>
        <div className="mt-6 max-w-4xl text-[38px] font-medium leading-snug">{scene.narration || <span className="text-white/30">(no narration: let the demo speak)</span>}</div>
        <div className={cn('mt-8 text-[14px] tabular-nums', sceneLeft < 3 ? 'text-amber-400' : 'text-white/40')}>{Math.max(0, sceneLeft).toFixed(0)} s left in this scene</div>
        {script.scenes[idx + 1] && <div className="mt-10 max-w-3xl text-[16px] text-white/35">Next: {script.scenes[idx + 1].narration.slice(0, 140)}</div>}
      </div>
      <div className="flex items-center justify-center gap-3 pb-8">
        <RBtn onClick={() => setElapsed(0)} title="Restart">
          <RotateCcw className="size-4" />
        </RBtn>
        <RBtn onClick={() => jump(idx - 1)} title="Previous scene (←)">
          <SkipBack className="size-4" />
        </RBtn>
        <button onClick={() => setPlaying(!playing)} className="flex size-14 items-center justify-center rounded-full bg-[var(--accent)] text-white hover:brightness-110" title="Start / pause (space)">
          {playing ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current" />}
        </button>
        <RBtn onClick={() => jump(idx + 1)} title="Next scene (→)">
          <SkipForward className="size-4" />
        </RBtn>
      </div>
    </div>
  )
}

function RBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} className="rounded-full p-3 text-white/60 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}
