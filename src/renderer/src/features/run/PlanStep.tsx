import { ArrowLeft, Check, Flag, Pencil, Users } from 'lucide-react'
import { useState } from 'react'
import { canTake } from '@shared/crew'
import { useCrew } from '@/stores/crew'
import { useHackforge } from '@/stores/hackforge'
import { useRun, useRunStore } from '@/stores/run'
import { Markdown } from '../conversation/Markdown'
import { Inbox } from './Inbox'
import { LeadCard } from './LeadCard'
import { Card, Primary, Secondary, Working, useBusy } from './parts'

/** Steps 7–8: HackForge plans; the lead accepts it (or asks for changes) and the run starts. */
export function PlanStep() {
  const run = useRun()
  const snap = useHackforge(run.project?.dir)
  const crew = useCrew()
  const act = useRunStore((s) => s.act)
  const accepting = useBusy('accept')
  const revising = useBusy('revise')
  const [change, setChange] = useState('')
  const [editing, setEditing] = useState(false)
  const ready = run.step === 'plan-ready'
  const helpers = crew.members.filter(canTake)

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-8 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{ready ? 'The plan' : run.step === 'contracts' ? 'Getting the build ready' : 'Planning'}</h1>
          <p className="mt-1.5 text-muted">
            {ready
              ? 'Your Claude read the challenge, weighed the options and picked one. Accept it and Harness runs the build across the team.'
              : run.step === 'contracts'
                ? 'Your Claude is freezing the interfaces and writing a contract for each milestone, so the work can be split.'
                : 'Your Claude is reading the challenge and the rules, researching and choosing what to build.'}
          </p>
        </div>

        {!ready && (
          <Card>
            <Working>{run.step === 'contracts' ? 'Writing milestone contracts…' : 'Planning with HackForge…'}</Working>
          </Card>
        )}

        {snap?.decision && (
          <Card icon={<Flag className="size-4 text-accent-ink" />} title={snap.decision.title ?? 'What we’re building'}>
            <div className="max-h-[420px] overflow-y-auto text-[13px]">
              {/* The title is on the card already. */}
              <Markdown text={snap.decision.text.replace(/^\s*#{1,3} .*\n+/, '')} />
            </div>
          </Card>
        )}

        {snap && snap.milestones.length > 0 && (
          <Card title="Milestones" aside={<span className="text-[12px] text-muted">built one after another, each split across the team</span>}>
            <ol className="space-y-1.5">
              {snap.milestones.map((m) => (
                <li key={m.id} className="flex gap-2 text-[13px]">
                  <span className="w-8 shrink-0 font-mono text-muted">{m.id}</span>
                  <span className="min-w-0 flex-1">
                    {m.goal}
                    {m.covers && <span className="text-muted"> · {m.covers}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {ready && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Primary busy={accepting} onClick={() => void act('accept', () => window.harness.runAccept())}>
                <Check className="size-4" /> Accept and run
              </Primary>
              <Secondary onClick={() => setEditing(!editing)}>
                <Pencil className="size-3.5" /> Ask for changes
              </Secondary>
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                <Users className="size-3.5" />
                {helpers.length ? `You + ${helpers.map((h) => h.name).join(', ')}` : 'Just you (teammates can still join)'}
              </span>
            </div>
            {editing && (
              <div className="flex gap-2">
                <textarea
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="What should change? e.g. “Skip the mobile app, put the time into the live demo.”"
                  className="selectable min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] outline-none focus:border-accent-ink"
                />
                <Secondary
                  busy={revising}
                  disabled={!change.trim()}
                  onClick={() =>
                    void act('revise', async () => {
                      await window.harness.runRevise(change.trim())
                      setChange('')
                      setEditing(false)
                    })
                  }
                >
                  Send
                </Secondary>
              </div>
            )}
          </div>
        )}
        {!ready && run.step === 'planning' && (
          <button
            onClick={() => void act('go', () => window.harness.runGoTo('setup'))}
            className="flex items-center gap-1 text-[12px] text-muted hover:text-fg"
          >
            <ArrowLeft className="size-3.5" /> Back to setup (your Claude keeps its notes)
          </button>
        )}
      </div>
      <div className="space-y-4">
        <Inbox empty="Questions and approvals from your Claude show up here." />
        <LeadCard />
      </div>
    </div>
  )
}
