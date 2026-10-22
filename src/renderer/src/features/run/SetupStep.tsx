import { ArrowLeft, ArrowRight, FileText, FolderOpen, GitBranch, Lock, Paperclip, Plus, ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { ClaudePlan, FileKind } from '@shared/run'
import { basename, cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useRun, useRunStore } from '@/stores/run'
import { Card, Primary, Secondary, useBusy } from './parts'

const PLANS: { id: ClaudePlan; label: string }[] = [
  { id: 'pro', label: 'Pro' },
  { id: 'max', label: 'Max' },
  { id: 'team', label: 'Team / Enterprise' },
  { id: 'api', label: 'API key' },
]

/** "2026-11-15T12:00" (local) → ISO with this computer's offset. */
function localToIso(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return undefined
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  return `${v.length === 16 ? `${v}:00` : v}${sign}${pad(off / 60)}:${pad(off % 60)}`
}

const dirname = (p: string) => p.replace(/[\\/][^\\/]+[\\/]?$/, '')

/** Steps 4–6: one place for the challenge, one for files (and one for files Claude must never see), then Continue. */
export function SetupStep() {
  const run = useRun()
  return run.project ? <Inputs /> : <NewProject />
}

function NewProject() {
  const settings = useApp((s) => s.settings)
  const act = useRunStore((s) => s.act)
  const [name, setName] = useState('')
  const [parent, setParent] = useState(() => (settings?.recentProjects[0] ? dirname(settings.recentProjects[0]) : ''))
  const [deadline, setDeadline] = useState('')
  const [plan, setPlan] = useState<ClaudePlan>('pro')
  const creating = useBusy('create')
  const opening = useBusy('folder')
  const create = () => void act('create', () => window.harness.runCreateProject({ name: name.trim(), parent, deadline: localToIso(deadline), plan }))
  const useFolder = async () => {
    const dir = await window.harness.pickDirectory()
    if (dir) await act('folder', () => window.harness.runUseFolder({ dir, name: name.trim() || basename(dir), deadline: localToIso(deadline), plan }))
  }
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">Create the project</h1>
      <p className="mt-1.5 text-muted">A folder with git, a place for the challenge and a place for files. Harness sets up HackForge in it.</p>
      <Card className="mt-6">
        <div className="grid gap-4">
          <Field label="Project name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grid Pulse" autoFocus className={inputCls} />
          </Field>
          <Field label="Where">
            <div className="flex gap-2">
              <input
                value={parent}
                onChange={(e) => setParent(e.target.value)}
                placeholder="Choose a folder…"
                className={cn(inputCls, 'font-mono text-[12px]')}
              />
              <Secondary
                onClick={async () => {
                  const dir = await window.harness.pickDirectory()
                  if (dir) setParent(dir)
                }}
              >
                <FolderOpen className="size-3.5" /> Choose…
              </Secondary>
            </div>
            {parent && name.trim() && <div className="mt-1 truncate font-mono text-[11px] text-muted">{`${parent.replace(/[\\/]+$/, '')}/${slug(name)}`}</div>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Deadline (optional)">
              <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Your Claude plan">
              <select value={plan} onChange={(e) => setPlan(e.target.value as ClaudePlan)} className={inputCls}>
                {PLANS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <Primary className="mt-5 w-full" busy={creating} disabled={!name.trim() || !parent.trim()} onClick={create}>
          Create project
        </Primary>
        <button onClick={() => void useFolder()} disabled={opening} className="mt-3 w-full text-center text-[12px] text-muted hover:text-fg">
          {opening ? 'Preparing the folder…' : 'Or use a folder you already have'}
        </button>
      </Card>
      <BackToTeam />
    </div>
  )
}

const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .slice(0, 60) || 'hackathon-project'

function Inputs() {
  const run = useRun()
  const setup = useRunStore((s) => s.setup)
  const act = useRunStore((s) => s.act)
  const project = run.project!
  const planning = useBusy('plan')
  const githubBusy = useBusy('github')
  const start = () =>
    void act('plan', async () => {
      await saveChallenge.current?.()
      // The lead's Claude: edits allowed, anything else asks (in the inbox). Back from the plan step: the same one.
      const id = run.sessionId && run.sessionLive ? run.sessionId : await useApp.getState().startQuiet(project.dir, 'acceptEdits')
      await window.harness.runPlan(id)
    })
  const saveChallenge = useRef<(() => Promise<void>) | null>(null)

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <button
          onClick={() => void window.harness.revealFile(project.dir)}
          className="selectable truncate font-mono text-[11.5px] text-muted hover:text-fg"
          title="Show in folder"
        >
          {project.dir}
        </button>
      </div>
      <p className="mt-1.5 text-muted">Paste the challenge and drop in what the organisers gave you. Claude reads all of it when it plans.</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card icon={<FileText className="size-4 text-[var(--accent)]" />} title="The challenge" className="flex flex-col">
          <ChallengeText initial={setup?.challenge ?? ''} saveRef={saveChallenge} />
          <Drop kind="challenge" files={setup?.files.challenge ?? []} hint="The brief, rules, judging criteria: PDFs, docs, screenshots" />
        </Card>
        <div className="grid content-start gap-4">
          <Card icon={<Paperclip className="size-4 text-[var(--accent)]" />} title="Files">
            <p className="mb-2 text-[12px] text-muted">Data, APIs docs, brand kits, assets. Claude reads them and so do teammates’ Claudes.</p>
            <Drop kind="files" files={setup?.files.files ?? []} hint="Drop files or folders here" />
          </Card>
          <Card icon={<Lock className="size-4 text-amber-600" />} title="Private files">
            <p className="mb-2 text-[12px] text-muted">
              For data the rules say must not go to an AI. Claude can’t read or show them, only run scripts on them that print totals. They stay on this laptop.
            </p>
            <Drop kind="private" files={setup?.files.private ?? []} hint="Drop private files here" />
            {(setup?.files.private.length ?? 0) > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" /> Guard on: blocked for Claude, kept out of git
              </div>
            )}
          </Card>
          <Card icon={<GitBranch className="size-4" />} title="GitHub (optional)">
            {project.github ? (
              <button
                onClick={() => void window.harness.openExternal(project.github!)}
                className="selectable truncate text-left font-mono text-[12px] text-[var(--accent)] hover:underline"
              >
                {project.github}
              </button>
            ) : (
              <>
                <p className="mb-2 text-[12px] text-muted">A public repository for the submission, made with the GitHub CLI. Teammates don’t need it.</p>
                <Secondary busy={githubBusy} onClick={() => void act('github', () => window.harness.runGithub())}>
                  Create GitHub repository
                </Secondary>
              </>
            )}
            {project.githubProblem && <p className="selectable mt-2 text-[12px] text-amber-700 dark:text-amber-300">{project.githubProblem}</p>}
          </Card>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <Primary busy={planning} disabled={!setup?.ready} onClick={start}>
          {planning ? 'Starting your Claude…' : 'Continue: plan it'}
          <ArrowRight className="size-4" />
        </Primary>
        {!setup?.ready && <span className="text-[12px] text-muted">Add the challenge first (text or files).</span>}
      </div>
      <BackToTeam />
    </div>
  )
}

function ChallengeText({ initial, saveRef }: { initial: string; saveRef: React.MutableRefObject<(() => Promise<void>) | null> }) {
  const [text, setText] = useState(initial)
  const saved = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    // Another window (or a reload) changed it: follow, unless you're typing.
    if (initial !== saved.current && text === saved.current) {
      setText(initial)
      saved.current = initial
    }
  }, [initial])
  const save = async (v = text) => {
    clearTimeout(timer.current)
    if (v === saved.current) return
    saved.current = v
    const info = await window.harness.runSetChallenge(v)
    useRunStore.setState({ setup: info })
  }
  saveRef.current = () => save()
  return (
    <textarea
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        clearTimeout(timer.current)
        const v = e.target.value
        timer.current = setTimeout(() => void save(v), 800)
      }}
      onBlur={() => void save()}
      placeholder="Paste the challenge here: what to build, the rules, how it’s judged, the deadline, links…"
      className="selectable mb-3 min-h-64 w-full flex-1 resize-y rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-[var(--accent)]"
    />
  )
}

function Drop({ kind, files, hint }: { kind: FileKind; files: string[]; hint: string }) {
  const [over, setOver] = useState(false)
  const add = (paths: string[]) => {
    if (!paths.length) return
    void useRunStore.getState().act(`add-${kind}`, async () => {
      const info = await window.harness.runAddFiles(kind, paths)
      useRunStore.setState({ setup: info })
    })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    add([...e.dataTransfer.files].map((f) => window.harness.pathForFile(f)).filter(Boolean))
  }
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'rounded-lg border border-dashed p-3 text-[12px] transition-colors',
        over ? 'border-[var(--accent)] bg-[var(--accent)]/[0.06]' : 'border-line',
        kind === 'private' && !over && 'border-amber-500/40',
      )}
    >
      {files.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {files.map((f) => (
            <li key={f} className="selectable truncate font-mono text-[11.5px]">
              {f}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 text-muted">
        <span className="min-w-0 flex-1">{hint}</span>
        <button
          onClick={async () => add(await window.harness.runPickFiles())}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11.5px] hover:bg-surface-2 hover:text-fg"
        >
          <Plus className="size-3" /> Add…
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium">{label}</span>
      {children}
    </label>
  )
}

function BackToTeam() {
  return (
    <button
      onClick={() => void useRunStore.getState().act('go', () => window.harness.runGoTo('team'))}
      className="mt-6 flex items-center gap-1 text-[12px] text-muted hover:text-fg"
    >
      <ArrowLeft className="size-3.5" /> Team
    </button>
  )
}

const inputCls = 'selectable w-full rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-[var(--accent)]'
