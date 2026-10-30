import { ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import { findAction } from '@/lib/actionMenu'
import { nextStep } from '@/lib/nextStep'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'

/** One suggestion above the prompt box, from the project's HackForge phase: Kickoff → Build → Verify → Pitch… */
export function NextStep({ session }: { session: SessionState }) {
  const hf = useHackforge(session.cwd)
  const mode = useApp((s) => s.settings?.hackforgeMode ?? 'projects')
  const setForm = useApp((s) => s.setActionForm)
  const [hidden, setHidden] = useState<string | null>(null)
  if ((session.observed && session.live) || session.status === 'running') return null
  const next = nextStep(hf, mode)
  const action = next && findAction(next.actionId, hf)
  if (!next || !action || hidden === `${session.id}:${action.id}`) return null
  return (
    <div className="mb-2 flex items-center gap-1">
      <button
        onClick={() => setForm(action.id)}
        title={next.why}
        className="flex items-center gap-1.5 rounded-sm border border-accent-ink/40 bg-accent/[0.07] px-3 py-1 text-[12px] hover:bg-accent/15"
      >
        <action.icon className="size-3.5 text-accent-ink" />
        <span className="text-muted">Next:</span>
        <span className="font-medium">{action.label}</span>
        <ArrowRight className="size-3.5 text-muted" />
      </button>
      <button onClick={() => setHidden(`${session.id}:${action.id}`)} title="Hide this suggestion" className="rounded-md p-1 text-muted hover:bg-hover hover:text-fg">
        <X className="size-3" />
      </button>
    </div>
  )
}
