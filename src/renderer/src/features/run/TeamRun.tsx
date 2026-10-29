import { AlertTriangle, Check, X } from 'lucide-react'
import { RUN_STAGES, type RunStage } from '@shared/run'
import { cn } from '@/lib/format'
import { useRun, useRunStore } from '@/stores/run'
import { TeamStep } from './TeamStep'
import { SetupStep } from './SetupStep'
import { PlanStep } from './PlanStep'
import { RunBoard } from './RunBoard'
import { DoneStep } from './DoneStep'

const LABEL: Record<RunStage, string> = { team: 'Team', setup: 'Setup', plan: 'Plan', run: 'Run', done: 'Done' }

/**
 * Hackathon › Build: one straight line from starting the team to a finished submission. Each
 * step shows only what's needed to get to the next one. (The countdown and the next thing to do
 * are in the Hackathon's header.)
 */
export function TeamRun({ children }: { children?: React.ReactNode }) {
  const run = useRun()
  const error = useRunStore((s) => s.error)
  const clearError = useRunStore((s) => s.clearError)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex justify-center border-b border-line px-6 py-2.5">
        <Stepper stage={run.stage} />
      </div>
      {error && (
        <div className="selectable mx-6 mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-[12.5px] text-red-600 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={clearError} className="rounded p-0.5 hover:bg-red-500/10" title="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {run.stage === 'team' && <TeamStep />}
        {run.stage === 'setup' && <SetupStep />}
        {run.stage === 'plan' && <PlanStep />}
        {run.stage === 'run' && <RunBoard />}
        {run.stage === 'done' && <DoneStep />}
        {children}
      </div>
    </div>
  )
}

function Stepper({ stage }: { stage: RunStage }) {
  const at = RUN_STAGES.indexOf(stage)
  return (
    <ol className="flex items-center gap-1.5" aria-label="Team run steps">
      {RUN_STAGES.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          {i > 0 && <span className={cn('h-px w-5', i <= at ? 'bg-[var(--accent)]' : 'bg-line')} />}
          <span
            aria-current={i === at ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium',
              i === at ? 'bg-[var(--accent)] text-white' : i < at ? 'text-fg' : 'text-muted',
            )}
          >
            {i < at ? <Check className="size-3.5 text-[var(--accent)]" /> : <span className="tabular-nums">{i + 1}</span>}
            {LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  )
}
