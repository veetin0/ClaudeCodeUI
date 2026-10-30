import { ChevronRight, Flame, OctagonX, Rocket } from 'lucide-react'
import { useState } from 'react'
import { FilesPanel } from '@/features/files/FilesPanel'
import { AgentsPanel } from '@/features/agents/AgentsPanel'
import { TasksPanel } from '@/features/tasks/TasksPanel'
import { HACKFORGE_PHASES } from '@shared/hackforge'
import { HACKFORGE_ACTIONS } from '@/lib/hackforgeActions'
import { nextStep } from '@/lib/nextStep'
import { cn } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import { useEvent } from '@/stores/event'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'
import { Sectors } from '@/ui/Sectors'

/** The session's side panel: one scroll of what's happening, instead of four tabs. */
export function SidePanel({ session }: { session: SessionState }) {
  const tasks = session.todos.filter((t) => t.status !== 'completed').length
  const running = Object.values(session.subagents).filter((s) => s.status === 'running').length
  return (
    <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface-2/40 p-3" aria-label="Side panel">
      <HackforgeSection session={session} />
      <Section title="Tasks" count={tasks}>
        <TasksPanel todos={session.todos} />
      </Section>
      <Section title="Files" count={session.changes.length} countLabel="changed">
        <FilesPanel session={session} />
      </Section>
      <Section title="Agents" count={running} countLabel="running">
        <AgentsPanel session={session} />
      </Section>
    </aside>
  )
}

function Section({ title, count, countLabel, children, defaultOpen = true }: { title: string; count?: number; countLabel?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-3">
      <button onClick={() => setOpen(!open)} className="mb-1 flex w-full items-center gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        {title}
        {!!count && (
          <span className="num ml-auto rounded-sm bg-fg px-1.5 text-[12px] font-semibold normal-case leading-4 tracking-normal text-surface">
            {count}
            {countLabel && ` ${countLabel}`}
          </span>
        )}
      </button>
      {open && children}
    </section>
  )
}

/** HackForge at a glance for this project: phase, score, the loop, and what to do next. */
function HackforgeSection({ session }: { session: SessionState }) {
  const hf = useHackforge(session.cwd)
  const mode = useApp((s) => s.settings?.hackforgeMode ?? 'projects')
  const eventProject = useApp((s) => s.settings?.eventProject)
  const [stopError, setStopError] = useState<string | null>(null)
  if (mode === 'off' || !hf?.present) return null
  const next = nextStep(hf, mode)
  const action = next && HACKFORGE_ACTIONS.find((a) => a.id === next.actionId)
  const done = hf.milestones.filter((m) => m.status === 'done').length
  const phase = hf.state.phaseIndex
  const isEvent = eventProject === session.cwd
  return (
    <Section title="HackForge">
      <div className="space-y-2 rounded-lg border border-line bg-surface p-3 text-[12px]">
        <div className="flex items-center gap-2">
          <Flame className="size-4 text-forge" />
          <span className="font-medium">{hf.initialized ? (hf.state.phase ? `Phase: ${hf.state.phase}` : 'Kicked off') : 'Ready for kickoff'}</span>
          {phase !== undefined && <span className="ml-auto num text-muted">{phase + 1} / {HACKFORGE_PHASES.length}</span>}
        </div>
        {phase !== undefined && (
          <Sectors items={HACKFORGE_PHASES.map((p, i) => ({ tone: i < phase ? 'done' : i === phase ? 'live' : 'todo', title: p }))} label="HackForge phases" />
        )}
        {hf.initialized && (
          <div className="flex gap-4 text-muted">
            <span>
              Score <b className="text-fg num">{(hf.verify?.mockScore ?? hf.state.latestMockScore)?.toFixed(1) ?? '—'}</b>
            </span>
            {hf.milestones.length > 0 && (
              <span>
                Milestones <b className="text-fg num">{done}/{hf.milestones.length}</b>
              </span>
            )}
          </div>
        )}
        {hf.loop?.active && (
          <div className="flex items-center gap-2 rounded-lg bg-forge/[0.08] px-2 py-1.5">
            <span className="min-w-0 flex-1">
              Loop #{hf.loop.iteration} of {hf.loop.maxIterations}
              {hf.loop.bestScore !== undefined && <span className="text-muted"> · best {hf.loop.bestScore.toFixed(1)}</span>}
            </span>
            <button
              disabled={hf.stopRequested}
              onClick={() => window.harness.hackforgeStopLoop(hf.cwd).catch((err: unknown) => setStopError(`Couldn't stop the loop: ${ipcErrorMessage(err)}`))}
              title="The loop finishes its iteration, writes a summary and stops"
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-danger-ink hover:bg-danger/10 disabled:opacity-50"
            >
              <OctagonX className="size-3.5" /> {hf.stopRequested ? 'Stopping…' : 'Stop'}
            </button>
          </div>
        )}
        {stopError && <div className="selectable text-danger-ink">{stopError}</div>}
        {action && (
          <button
            onClick={() => {
              useApp.getState().setView('chat')
              useApp.getState().setActionForm(action.id)
            }}
            title={next!.why}
            className="flex w-full items-center gap-2 rounded-lg bg-accent px-2.5 py-1.5 font-medium text-white hover:brightness-110"
          >
            <action.icon className="size-3.5" /> Next: {action.label}
          </button>
        )}
        <button
          onClick={() => (isEvent ? useApp.getState().openHackathon('build') : void useEvent.getState().link(session.cwd).then(() => useApp.getState().openHackathon('build')))}
          className="flex w-full items-center gap-1.5 text-[12px] text-muted hover:text-fg"
          title={isEvent ? 'The full dashboard: rules, milestones, fix order, the loop' : 'Make this the hackathon project: team run, challenges and pitch work on it'}
        >
          <Rocket className="size-3.5" /> {isEvent ? 'Open in Hackathon' : 'Use for the hackathon'}
        </button>
      </div>
    </Section>
  )
}
