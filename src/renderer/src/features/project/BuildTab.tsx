import { Bot, ClipboardCheck, FileText, FolderOpen, GitCommitHorizontal, Hammer, ListChecks, MessageSquare, Network, Ruler, ScrollText, Send, Sparkles, Trophy } from 'lucide-react'
import { useState } from 'react'
import { LEAD_SETUPS } from '@shared/advisor'
import {
  autopilotPrompt,
  CRITERION_LABEL,
  improvePrompt,
  PROJECT_ACTIONS,
  PROJECT_STAGES,
  SCORE_CRITERIA,
  STAGE_HINT,
  STAGE_LABEL,
  type FeedbackScore,
  type ImproveKind,
  type ProjectState,
} from '@shared/project'
import { basename, cn } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { sessionIn } from '@/lib/projects'
import { useApp } from '@/stores/app'
import { projectName, useProject, useProjectState } from '@/stores/project'
import { StatusDot, STATUS_LABEL } from '@/layout/StatusDot'
import { LineChart } from '@/features/viz/LineChart'
import { SectorMeter, SectorSteps } from '@/ui/Sectors'
import { Segmented } from '@/ui/Segmented'

const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-ink/60'

/** The project's build: where it is, the evaluator's scores, what ECC wrote, and ways to make it better. */
export function BuildTab({ dir }: { dir: string }) {
  const loaded = useProjectState()
  const state = loaded?.dir === dir ? loaded : null
  if (!state) return <div className="py-10 text-center text-[12px] text-muted">Reading the project…</div>
  return (
    <div className="space-y-4">
      <Overview state={state} />
      {state.artifacts.feedback.length > 0 && <Scores rounds={state.artifacts.feedback} />}
      <Improve state={state} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Artifacts state={state} />
        <Commits state={state} />
      </div>
    </div>
  )
}

/** The idea, the stage stepper, Claude's latest note and the build session. */
function Overview({ state }: { state: ProjectState }) {
  const record = state.record
  const session = useApp((s) => (record?.sessionId ? s.sessions[record.sessionId] : undefined))
  const savedSession = useApp((s) => (record?.sessionId ? s.history.find((h) => h.id === record.sessionId) : undefined))
  const waiting = session?.status === 'waiting'
  const setup = LEAD_SETUPS.find((s) => s.id === record?.setup)
  const watch = async (view: 'chat' | 'agents') => {
    const app = useApp.getState()
    if (record?.sessionId && app.sessions[record.sessionId]) app.select(record.sessionId)
    else if (record?.sessionId && savedSession) await app.openSaved(record.sessionId)
    else await sessionIn(state.dir)
    useApp.getState().setView(view)
  }
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-tight">{record?.name ?? projectName(state.dir)}</h1>
          {record?.idea ? (
            <p className="selectable mt-1 line-clamp-3 text-[13px] text-muted">{record.idea}</p>
          ) : (
            <p className="mt-1 text-[13px] text-muted">A folder you picked. Ask Claude below to plan and build it with ECC, or to make it better.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {session ? (
            <span className="flex items-center gap-1.5 text-[12px] text-muted">
              <StatusDot status={session.status} /> {session.live ? STATUS_LABEL[session.status] : 'Saved'}
            </span>
          ) : (
            savedSession && <span className="text-[12px] text-muted">Last worked on {relativeTime(savedSession.updatedAt)}</span>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={() => void watch('chat')}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium',
                waiting ? 'bg-warn text-rail hover:brightness-105' : 'bg-accent text-white hover:brightness-110',
              )}
            >
              <MessageSquare className="size-3.5" /> {waiting ? 'Claude needs you' : record?.sessionId ? 'Watch in chat' : 'Open in a session'}
            </button>
            {record?.sessionId && (
              <button onClick={() => void watch('agents')} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] hover:bg-surface-2" title="Every agent ECC runs, live">
                <Network className="size-3.5" /> Agents
              </button>
            )}
          </div>
        </div>
      </div>
      <SectorSteps className="mt-4" steps={PROJECT_STAGES} current={state.stage} labels={STAGE_LABEL} waiting={waiting} label={`Build stage: ${STAGE_LABEL[state.stage]}`} />
      <p className="mt-2 text-[13px]">
        <span className="font-medium">{STAGE_LABEL[state.stage]}</span>
        <span className="text-muted"> · {state.note ?? STAGE_HINT[state.stage]}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        {setup && setup.id !== 'default' && (
          <span className="flex items-center gap-1">
            <Bot className="size-3" /> {setup.label}
          </span>
        )}
        {record?.rules.length ? <span>ECC rules: {record.rules.join(', ')}</span> : null}
        {state.stacks.length > 0 && <span>Stack: {state.stacks.join(', ')}</span>}
      </div>
    </section>
  )
}

/** The evaluator's weighted score per round, and the latest round's breakdown. */
function Scores({ rounds }: { rounds: FeedbackScore[] }) {
  const latest = rounds.at(-1)!
  const best = Math.max(...rounds.map((r) => r.total))
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Trophy className="size-3.5 text-accent-ink" /> Evaluator score
        </h2>
        <span className="num text-[22px] font-semibold leading-none">{latest.total.toFixed(1)}</span>
        <span className="text-[12px] text-muted">/ 10 · round {rounds.length}</span>
        {latest.verdict && <span className={cn('rounded-sm px-1.5 text-[11px] font-semibold', latest.verdict === 'PASS' ? 'bg-ok/15 text-ok-ink' : 'bg-warn/20 text-warn-ink')}>{latest.verdict}</span>}
        <span className="ml-auto text-[12px] text-muted">best {best.toFixed(1)}</span>
      </div>
      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_220px]">
        {rounds.length > 1 ? (
          <LineChart series={[{ name: 'Score', points: rounds.map((r, i) => [i + 1, r.total]) }]} height={150} xLabel="Round" />
        ) : (
          <p className="self-center text-[12px] text-muted">The chart fills in as the builder and the evaluator go round by round.</p>
        )}
        <div className="space-y-2">
          {SCORE_CRITERIA.filter((c) => latest.scores[c] !== undefined).map((c) => (
            <div key={c} className="text-[12px]">
              <div className="flex justify-between">
                <span>{CRITERION_LABEL[c]}</span>
                <span className="num text-muted">{latest.scores[c]!.toFixed(1)}</span>
              </div>
              <SectorMeter value={latest.scores[c]! / 10} count={10} tone={latest.scores[c]! >= 7 ? 'done' : 'wait'} height={3} label={`${CRITERION_LABEL[c]} score`} />
            </div>
          ))}
          <button onClick={() => void window.harness.openProjectFile(latest.file)} className="text-[12px] text-accent-ink hover:underline">
            Read the latest feedback
          </button>
        </div>
      </div>
    </section>
  )
}

const KINDS: { id: ImproveKind; label: string; placeholder: string }[] = [
  { id: 'better', label: 'Make it better', placeholder: 'e.g. The dashboard feels empty and the onboarding is confusing; make it feel premium' },
  { id: 'feature', label: 'Add a feature', placeholder: 'e.g. Let people share a streak as an image' },
  { id: 'bug', label: 'Fix a bug', placeholder: 'e.g. Saving a habit twice creates two copies' },
]

/** "What should be better?", sent to ECC's matching flow, and quick follow-ups. */
function Improve({ state }: { state: ProjectState }) {
  const askClaude = useProject((s) => s.askClaude)
  const [kind, setKind] = useState<ImproveKind>('better')
  const [text, setText] = useState('')
  const k = KINDS.find((x) => x.id === kind)!
  const send = () => {
    if (!text.trim()) return
    void askClaude(improvePrompt(kind, text, { hasSpec: !!state.artifacts.spec }), k.label)
    setText('')
  }
  const fresh = !state.record?.idea
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles className="size-3.5 text-accent-ink" /> Make it better
        </h2>
        <Segmented className="ml-auto" label="What kind of change" value={kind} onChange={setKind} options={KINDS.map((x) => ({ id: x.id, label: x.label }))} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
        rows={2}
        aria-label={k.label}
        placeholder={k.placeholder}
        className={cn(field, 'mt-3 resize-y')}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PROJECT_ACTIONS.map((a) => (
          <button key={a.id} onClick={() => void askClaude(a.prompt, a.label)} title={a.hint} className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-surface-2">
            {a.label}
          </button>
        ))}
        {fresh && (
          <button
            onClick={() => void askClaude(autopilotPrompt({ name: projectName(state.dir), idea: 'The project in this folder: read it first, then take it from wherever it is.' }), 'ECC pipeline')}
            title="PRD, plan, build, review and polish with ECC, starting from what is already here"
            className="rounded-md border border-line px-2.5 py-1 text-[12px] hover:bg-surface-2"
          >
            Run ECC’s whole pipeline
          </button>
        )}
        <button
          onClick={send}
          disabled={!text.trim()}
          className="ml-auto flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          <Send className="size-3.5" /> Send to Claude
        </button>
      </div>
    </section>
  )
}

/** What ECC wrote: the PRD, the plan, the evaluator's spec and rubric, the build report and the README. */
function Artifacts({ state }: { state: ProjectState }) {
  const a = state.artifacts
  const rows: { label: string; icon: typeof FileText; path?: string; hint: string }[] = [
    { label: 'PRD', icon: FileText, path: a.prds[0], hint: 'What it is, for whom, and what is out of scope' },
    { label: 'Plan', icon: ListChecks, path: a.plans[0], hint: 'The stack and the steps' },
    { label: 'Build spec', icon: ScrollText, path: a.spec, hint: 'What the builder agent works to' },
    { label: 'Rubric', icon: Ruler, path: a.rubric, hint: 'How the evaluator scores it' },
    { label: 'Build report', icon: ClipboardCheck, path: a.report, hint: 'The build loop’s result' },
    { label: 'README', icon: FileText, path: a.readme, hint: 'How to run it' },
  ]
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 text-[13px] font-semibold">What ECC wrote</h2>
      <ul className="divide-y divide-line text-[12px]">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 py-1.5">
            <r.icon className={cn('size-3.5 shrink-0', r.path ? 'text-accent-ink' : 'text-muted/60')} />
            <span className={cn('w-24 shrink-0 font-medium', !r.path && 'text-muted')}>{r.label}</span>
            {r.path ? (
              <>
                <button onClick={() => void window.harness.openProjectFile(r.path!)} className="min-w-0 truncate text-left text-accent-ink hover:underline" title={r.path}>
                  {basename(r.path)}
                </button>
                <button onClick={() => void window.harness.revealFile(r.path!)} className="ml-auto rounded p-0.5 text-muted hover:text-fg" title="Show in folder" aria-label={`Show ${r.label} in folder`}>
                  <FolderOpen className="size-3.5" />
                </button>
              </>
            ) : (
              <span className="min-w-0 truncate text-muted">{r.hint}: not yet</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Commits({ state }: { state: ProjectState }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold">
        <GitCommitHorizontal className="size-3.5" /> Commits <span className="num font-normal text-muted">{state.commits}</span>
      </h2>
      {state.recent.length ? (
        <ul className="space-y-1 text-[12px]">
          {state.recent.map((c) => (
            <li key={c.hash} className="flex gap-2">
              <code className="shrink-0 text-muted">{c.hash}</code>
              <span className={cn('min-w-0 truncate', c.subject.startsWith('feat') && 'font-medium')}>{c.subject}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-muted">
          <Hammer className="mr-1 inline size-3" />
          Each slice ECC builds lands as its own feat: commit.
        </p>
      )}
    </section>
  )
}
