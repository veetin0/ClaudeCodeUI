import { Check, FolderOpen, MessageSquare, RotateCcw, Trophy } from 'lucide-react'
import { formatDuration } from '@shared/run'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import { useRun, useRunStore } from '@/stores/run'
import { Card, Primary, Secondary } from './parts'

/** Step 22: what got built, how it scores, and what's left to do by hand (submitting). */
export function DoneStep() {
  const run = useRun()
  const snap = useHackforge(run.project?.dir)
  const score = snap?.loop?.bestScore ?? snap?.verify?.mockScore
  const took = run.startedAt && run.done ? run.done.at - run.startedAt : undefined
  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-500/15">
          <Trophy className="size-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{run.done?.reason === 'Stopped by the lead' ? 'Run stopped' : 'Done'}</h1>
          <p className="text-muted">
            {run.done?.reason}
            {took ? ` · ${formatDuration(took)}` : ''}
            {score !== undefined && ` · mock judge score ${score.toFixed(1)}`}
          </p>
        </div>
      </div>

      {run.milestones.length > 0 && (
        <Card className="mt-6" title="Milestones">
          <ul className="space-y-1.5 text-[12.5px]">
            {run.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                {m.status === 'done' ? <Check className="size-4 text-emerald-600" /> : <span className="size-4 text-center text-muted">–</span>}
                <span className="font-mono">{m.id}</span>
                <span className="min-w-0 flex-1 truncate">{m.goal}</span>
                <span className="text-[11.5px] text-muted">
                  {m.status === 'done'
                    ? m.startedAt && m.endedAt
                      ? formatDuration(m.endedAt - m.startedAt)
                      : 'done'
                    : m.status === 'stuck'
                      ? 'not finished'
                      : 'cut'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {snap?.verify && snap.verify.findings.length > 0 && (
        <Card className="mt-4" title="What the mock judges would still fix">
          <ul className="list-disc space-y-1 pl-5 text-[12.5px]">
            {snap.verify.findings.slice(0, 5).map((f, i) => (
              <li key={i}>{f.title}</li>
            ))}
          </ul>
        </Card>
      )}

      <p className="mt-6 text-[12.5px] text-muted">
        Harness never submits for you. The submission checklist and the steps are in <code>.hackforge/VERIFY.md</code> and the pitch in <code>pitch/</code>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {run.project && (
          <Primary onClick={() => void window.harness.revealFile(run.project!.dir)}>
            <FolderOpen className="size-4" /> Open the project
          </Primary>
        )}
        {run.sessionId && (
          <Secondary
            onClick={() =>
              void useApp
                .getState()
                .openSaved(run.sessionId!)
                .then(() => useApp.getState().select(run.sessionId!))
            }
          >
            <MessageSquare className="size-3.5" /> Talk to your Claude
          </Secondary>
        )}
        <Secondary
          onClick={() =>
            window.confirm('Start a new run? The project stays on disk.') && void useRunStore.getState().act('reset', () => window.harness.runReset())
          }
        >
          <RotateCcw className="size-3.5" /> New run
        </Secondary>
      </div>
    </div>
  )
}
