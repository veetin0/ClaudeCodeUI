import { AlertTriangle, RotateCcw, X } from 'lucide-react'
import { RUN_STAGES, type RunStage } from '@shared/run'
import { SectorSteps } from '@/ui/Sectors'
import { Menu } from '@/ui/Menu'
import { useRun, useRunStore } from '@/stores/run'
import { TeamStep } from './TeamStep'
import { SetupStep } from './SetupStep'
import { PlanStep } from './PlanStep'
import { RunBoard } from './RunBoard'
import { DoneStep } from './DoneStep'

const LABEL: Record<RunStage, string> = { team: 'Team', setup: 'Setup', plan: 'Plan', run: 'Run', done: 'Done' }

const KEEPS = 'The project folder and its files stay on disk, and your team stays together.'
const START_OVER: Record<RunStage, string> = {
  team: `Start the team run over? ${KEEPS}`,
  setup: `Start over from the Team step? ${KEEPS}`,
  plan: `Start over? The plan is dropped and anything your Claude is waiting on is declined. ${KEEPS}`,
  run: `Stop and start over? Crew tasks stop, your Claude stops after its current step, and the board is cleared. ${KEEPS}`,
  done: `Start a new run? ${KEEPS}`,
}

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
      <div className="relative flex justify-center border-b border-line px-12 py-3">
        <Stepper stage={run.stage} />
        {(run.stage !== 'team' || run.project) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Menu
              label="Team run"
              items={[
                {
                  label: 'Start over…',
                  icon: RotateCcw,
                  danger: true,
                  hint: 'Back to the Team step; the project folder stays on disk',
                  onSelect: () => window.confirm(START_OVER[run.stage]) && void useRunStore.getState().act('reset', () => window.harness.runReset()),
                },
              ]}
            />
          </div>
        )}
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
