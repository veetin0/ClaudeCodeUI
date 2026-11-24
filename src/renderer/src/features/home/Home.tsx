import { ArrowRight, ChevronDown, FolderOpen, Hammer, History, KeyRound, Loader2, MessageSquare, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LEAD_SETUPS } from '@shared/advisor'
import type { PermissionMode } from '@shared/events'
import { slugify, suggestName } from '@shared/project'
import { basename, cn, formatCost } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import { useProject } from '@/stores/project'
import { Menu, menuItems } from '@/ui/Menu'
import { StatusDot, STATUS_LABEL } from '@/layout/StatusDot'

const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-ink/60'

/** How much the build stops to ask: Claude Code's auto mode, or a prompt before each command. */
const MODES: { value: PermissionMode; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto mode', hint: 'A classifier approves safe steps and asks about risky ones. Needs a plan with auto mode.' },
  { value: 'acceptEdits', label: 'Ask before commands', hint: 'File edits go ahead; every command waits for your OK.' },
]

/** Home: describe an idea and Build it, or chat in a folder; the current project; what to continue. */
export function Home() {
  const { settings, history, order, sessions, startSession, openSaved, select, startError, setSettingsOpen } = useApp()
  const recents = settings?.recentProjects ?? []
  const [dir, setDir] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [starting, setStarting] = useState(false)
  const [setup, setSetup] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const folder: string | null = dir ?? recents[0] ?? null
  useEffect(() => ref.current?.focus(), [])
  // A harness://open link: take its folder and prompt once, leave the prompt for you to read and send.
  const prefill = useApp((s) => s.homePrefill)
  useEffect(() => {
    if (!prefill) return
    setDir(prefill.dir)
    setText(prefill.prompt)
    useApp.getState().clearHomePrefill()
    ref.current?.focus()
  }, [prefill])

  /** The secondary path: a session in a folder, with the text as its first message. */
  const chat = async () => {
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
  const idea = text.trim()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
        <h1 className="font-display text-[34px] font-semibold leading-tight">What do you want to build?</h1>
        <p className="mt-1.5 text-[13px] text-muted">
          Describe the idea. Claude writes the spec and the plan, ECC’s agents build it, test it and score it, and it keeps improving until it’s ready to show.
        </p>

        <div className="mt-6 rounded-xl border border-line bg-surface shadow-[0_6px_20px_-8px_rgb(21_22_29/0.18)] focus-within:border-accent-ink/60">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                if (idea) setSetup(true)
              }
            }}
            rows={3}
            aria-label="Your idea"
            placeholder="e.g. A habit tracker that nudges you at the right moment, with streaks and a weekly review"
            className="selectable block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[13px] leading-relaxed outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            <Menu
              label="Chat in a folder"
              align="start"
              trigger={
                <>
                  <MessageSquare className="size-3.5" />
                  <span className="max-w-[200px] truncate">{folder ? `Chat in ${basename(folder)}` : 'Chat in a folder'}</span>
                  <ChevronDown className="size-3" />
                </>
              }
              triggerClassName="h-7 rounded-md border border-line px-2.5 text-fg"
              items={menuItems(
                { label: folder ? `Start a chat in ${basename(folder)}` : 'Choose a folder and chat…', icon: MessageSquare, hint: idea ? 'Your text is the first message' : undefined, onSelect: () => void chat() },
                'separator',
                recents.length > 0 && { heading: 'Folder' },
                ...recents.slice(0, 6).map((d) => ({ label: basename(d), hint: d, icon: FolderOpen, checked: d === folder, onSelect: () => setDir(d) })),
                { label: 'Choose a folder…', icon: FolderOpen, onSelect: () => void pick() },
              )}
            />
            {starting && <Loader2 className="size-3.5 animate-spin text-muted" />}
            <button
              onClick={() => setSetup(true)}
              disabled={!idea || setup}
              title={idea ? 'Set up the project, then Claude builds it' : 'Describe the idea first'}
              className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 font-medium text-white hover:brightness-110 active:brightness-95 disabled:opacity-50"
            >
              <Hammer className="size-3.5" /> Build it
            </button>
          </div>
        </div>
        {startError && <div className="selectable mt-3 text-center text-[12px] text-danger-ink">{startError}</div>}
        {setup && idea && <BuildSetup idea={idea} onClose={() => setSetup(false)} onStarted={() => setText('')} />}

        {!setup && <ProjectCard />}

        {!setup && cont.length > 0 && (
          <div className="mt-8">
            <h2 className="label-caps mb-2">Continue</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {cont.map((c) =>
                c.kind === 'open' ? (
                  <Card
                    key={c.s.id}
                    onClick={() => select(c.s.id)}
                    icon={<StatusDot status={c.s.status} />}
                    title={c.s.title || 'New session'}
                    sub={`${basename(c.s.cwd)} · ${c.s.live ? STATUS_LABEL[c.s.status] : 'Saved'}`}
                    cost={c.s.totalCostUsd}
                  />
                ) : (
                  <Card
                    key={c.h.id}
                    onClick={() => void openSaved(c.h.id)}
                    icon={<History className="size-3.5 text-muted" aria-hidden />}
                    title={c.h.title}
                    sub={`${basename(c.h.cwd)} · ${relativeTime(c.h.updatedAt)}`}
                    cost={c.h.costUsd}
                  />
                ),
              )}
            </div>
          </div>
        )}

        {settings && !settings.hasApiKey && !setup && (
          <button onClick={() => setSettingsOpen(true, 'general')} className="mx-auto mt-8 flex items-center gap-1.5 text-[12px] text-muted hover:text-fg">
            <KeyRound className="size-3.5" />
            Uses your Claude Code login. Add an API key in Settings to use one instead.
          </button>
        )}
      </div>
    </div>
  )
}

/** Build it, step two: the project's name and place, which Claude builds it, and how much it asks. */
function BuildSetup({ idea, onClose, onStarted }: { idea: string; onClose: () => void; onStarted: () => void }) {
  const [name, setName] = useState(() => suggestName(idea))
  const [parent, setParent] = useState<string | null>(null)
  const [setup, setSetup] = useState(LEAD_SETUPS[0].id)
  const [mode, setMode] = useState<PermissionMode>('auto')
  const [busy, setBusy] = useState(false)
  const error = useProject((s) => s.error)
  useEffect(() => {
    void window.harness.projectDefaults().then((d) => setParent((p) => p ?? d.parent))
  }, [])
  const slug = slugify(name)
  const chosen = LEAD_SETUPS.find((s) => s.id === setup)
  const start = async () => {
    if (!slug || !parent || busy) return
    setBusy(true)
    const ok = await useProject.getState().build({ idea, name: name.trim(), parent, setup, mode })
    setBusy(false)
    if (ok) onStarted()
  }
  return (
    <section aria-label="Build it" className="mt-4 rounded-xl border border-line p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-accent-ink" />
        <h2 className="text-[14px] font-semibold">Set up the project</h2>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:text-fg" title="Back" aria-label="Close">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px]">
          <span className="font-medium">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void start()}
            autoFocus
            className={cn(field, 'mt-1')}
          />
        </label>
        <div className="text-[12px]">
          <span className="font-medium">Where</span>
          <button onClick={async () => setParent((await window.harness.pickDirectory()) ?? parent)} className={cn(field, 'mt-1 flex items-center gap-1.5 text-left')} title={parent ?? undefined}>
            <FolderOpen className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 truncate">{parent ? `${parent}/${slug || '…'}` : '…'}</span>
          </button>
        </div>
        <label className="block text-[12px]">
          <span className="font-medium">Your Claude</span>
          <select value={setup} onChange={(e) => setSetup(e.target.value)} className={cn(field, 'mt-1')}>
            {LEAD_SETUPS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {chosen?.note && <span className="mt-1 block text-[11px] text-muted">{chosen.note}</span>}
        </label>
        <label className="block text-[12px]">
          <span className="font-medium">How much Claude asks</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as PermissionMode)} className={cn(field, 'mt-1')}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px] text-muted">{MODES.find((m) => m.value === mode)?.hint}</span>
        </label>
      </div>
      <p className="mt-3 text-[12px] text-muted">
        Harness makes the folder with git and ECC’s rules, then Claude runs ECC’s pipeline: PRD → plan → MVP built in slices by builder and evaluator agents → review →
        polish. It asks you only what truly decides the product. Follow it in the chat, or on the project’s page (⌘4).
      </p>
      {error && <div className="selectable mt-2 text-[12px] text-danger-ink">{error}</div>}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => void start()}
          disabled={!slug || !parent || busy}
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3.5 font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Hammer className="size-3.5" />} Start building
        </button>
      </div>
    </section>
  )
}

function Card({ onClick, icon, title, sub, cost }: { onClick: () => void; icon: React.ReactNode; title: string; sub: string; cost: number }) {
  return (
    <button onClick={onClick} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2.5 text-left hover:bg-hover">
      <span className="flex size-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-[12px] text-muted">{sub}</span>
      </span>
      {cost > 0 && <span className="num shrink-0 text-[13px] text-muted">{formatCost(cost)}</span>}
    </button>
  )
}

/** The current project at a glance, one click from its Project place. */
function ProjectCard() {
  const dir = useApp((s) => s.settings?.project ?? null)
  if (!dir) return null
  return (
    <button onClick={() => useApp.getState().openProject()} className="mt-6 flex w-full items-center gap-3 rounded-lg border border-line px-4 py-3.5 text-left hover:bg-hover">
      <Hammer className="size-5 shrink-0 text-accent-ink" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{basename(dir)}</span>
        <span className="block truncate text-[12px] text-muted">{dir}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 pl-2 font-medium text-accent-ink">
        Open the project <ArrowRight className="size-3.5" aria-hidden />
      </span>
    </button>
  )
}
