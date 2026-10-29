import { AlertTriangle, X } from 'lucide-react'
import { RUN_STAGES, type RunStage } from '@shared/run'
import { SectorSteps } from '@/ui/Sectors'
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
      <div className="flex justify-center border-b border-line px-6 py-3">
        <Stepper stage={run.stage} />
      </div>
      {error && (
        <div className="selectable mx-6 mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <button onClick={clearError} className="rounded p-0.5 hover:bg-danger/10" title="Dismiss">
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
  return <SectorSteps steps={RUN_STAGES} current={stage} labels={LABEL} label="Team run steps" className="w-full max-w-xl" />
}
