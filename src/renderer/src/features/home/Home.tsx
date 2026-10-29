import { ArrowRight, ArrowUp, ChevronDown, Flame, FolderOpen, History, KeyRound, Rocket } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { basename, cn, formatCost } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { newHackforgeProject } from '@/lib/projects'
import { useApp } from '@/stores/app'
import { useHackathonSummary } from '../hackathon/summary'
import { Menu, menuItems } from '@/ui/Menu'
import { StatusDot, STATUS_LABEL } from '@/layout/StatusDot'

/** Home: one box to start something, the hackathon at a glance, and what to continue. */
export function Home() {
  const { settings, history, order, sessions, startSession, openSaved, select, startError, setSettingsOpen } = useApp()
  const recents = settings?.recentProjects ?? []
  const [dir, setDir] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [starting, setStarting] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const folder: string | null = dir ?? recents[0] ?? null
  useEffect(() => ref.current?.focus(), [])

  const start = async () => {
    let d: string | null = folder
    if (!d) {
      d = await window.harness.pickDirectory()
      if (!d) return
      setDir(d)
    }
    setStarting(true)
    try {
      await startSession(d)
      const app = useApp.getState()
      if (text.trim() && !app.startError) await app.send(text.trim())
      setText('')
    } finally {
      setStarting(false)
    }
  }
  const pick = async () => {
    const d = await window.harness.pickDirectory()
    if (d) setDir(d)
  }

  const open = order.map((id) => sessions[id]).filter(Boolean)
  const openIds = new Set(order)
  const saved = history.filter((h) => h.title && !openIds.has(h.id))
  const cont = [...open.map((s) => ({ kind: 'open' as const, s })), ...saved.map((h) => ({ kind: 'saved' as const, h }))].slice(0, 4)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
        <h1 className="text-center text-[22px] font-semibold">What do you want to build?</h1>
        <p className="mt-1 text-center text-muted">Claude works in your project folder. Every tool call, agent and decision shows up live.</p>

        <div className="mt-6 rounded-2xl border border-line bg-surface shadow-[0_2px_16px_rgb(0_0_0/0.07)] focus-within:border-[var(--accent)]/50">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                void start()
              }
            }}
            rows={3}
            placeholder="Describe it, or leave it empty to just open the folder…"
            className="selectable block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-relaxed outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <Menu
              label="Choose the folder"
              align="start"
              trigger={
                <>
                  <FolderOpen className="size-3.5" />
                  <span className="max-w-[220px] truncate">{folder ? basename(folder) : 'Choose a folder'}</span>
                  <ChevronDown className="size-3" />
                </>
              }
              triggerClassName="rounded-full border border-line px-2.5 py-1 text-fg"
              items={menuItems(
                recents.length > 0 && { heading: 'Recent' },
                ...recents.slice(0, 6).map((d) => ({ label: basename(d), hint: d, icon: FolderOpen, checked: d === folder, onSelect: () => setDir(d) })),
                recents.length > 0 && 'separator',
                { label: 'Choose a folder…', icon: FolderOpen, onSelect: () => void pick() },
                settings?.hackforgeMode !== 'off' && { label: 'New HackForge project…', icon: Flame, hint: 'Pick a folder, then set it up', onSelect: () => void newHackforgeProject() },
              )}
            />
            <button
              onClick={() => void start()}
              disabled={starting}
              className="ml-auto flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3.5 py-1.5 font-medium text-white hover:brightness-110 disabled:opacity-60"
            >
              {text.trim() ? 'Start' : 'Open'} <ArrowUp className="size-3.5" />
            </button>
          </div>
        </div>
        {startError && <div className="selectable mt-3 text-center text-[12px] text-red-500">{startError}</div>}

        <HackathonCard />

        {cont.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Continue</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {cont.map((c) =>
                c.kind === 'open' ? (
                  <Card key={c.s.id} onClick={() => select(c.s.id)} icon={<StatusDot status={c.s.status} />} title={c.s.title || 'New session'} sub={`${basename(c.s.cwd)} · ${c.s.live ? STATUS_LABEL[c.s.status] : 'Saved'}`} />
                ) : (
                  <Card
                    key={c.h.id}
                    onClick={() => void openSaved(c.h.id)}
                    icon={<History className="size-3.5 text-muted" />}
                    title={c.h.title}
                    sub={`${basename(c.h.cwd)} · ${relativeTime(c.h.updatedAt)}${c.h.costUsd > 0 ? ` · ${formatCost(c.h.costUsd)}` : ''}`}
                  />
                ),
              )}
            </div>
          </div>
        )}

        {settings && !settings.hasApiKey && (
          <button onClick={() => setSettingsOpen(true, 'general')} className="mx-auto mt-8 flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            <KeyRound className="size-3.5" />
            Uses your Claude Code login. Add an API key in Settings to use one instead.
          </button>
        )}
      </div>
    </div>
  )
}

function Card({ onClick, icon, title, sub }: { onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-left hover:bg-surface-2">
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-[11px] text-muted">{sub}</span>
      </span>
    </button>
  )
}

/** The hackathon at a glance, with one button: carry on, or start the team. */
function HackathonCard() {
  const h = useHackathonSummary()
  const started = h.stage !== 'team'
  return (
    <button
      onClick={() => useApp.getState().openHackathon(started ? undefined : 'build')}
      className={cn(
        'mt-6 flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left',
        h.active ? 'border-[var(--accent)]/40 bg-[var(--accent)]/[0.06] hover:bg-[var(--accent)]/10' : 'border-line hover:bg-surface-2',
      )}
    >
      <Rocket className="size-5 shrink-0 text-[var(--accent)]" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{h.name}</span>
        <span className={cn('block truncate text-[12px] tabular-nums', h.urgent ? 'font-medium text-red-500' : 'text-muted')}>
          {[started ? h.status : 'Team run, challenges, pitch and the clock', h.countdown].filter(Boolean).join(' · ')}
        </span>
      </span>
      {h.inbox > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10.5px] font-semibold text-white">{h.inbox}</span>}
      <span className="flex items-center gap-1 font-medium text-[var(--accent)]">
        {started ? 'Continue' : 'Start a hackathon'} <ArrowRight className="size-3.5" />
      </span>
    </button>
  )
}
