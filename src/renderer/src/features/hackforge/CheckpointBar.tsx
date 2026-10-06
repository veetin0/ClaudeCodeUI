import { Check, PencilLine } from 'lucide-react'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'

/** HackForge checkpoints end a turn asking for "go" or "adjust …". */
const CHECKPOINT = /\bgo\b[^.\n]{0,40}\badjust\b|\breply\s+["'“]?go\b|\bwait(?:ing)? for (?:your )?["'“]?go\b/i

/** One-click replies when HackForge stops at a checkpoint (decision, plan, before_submit). */
export function CheckpointBar({ session }: { session: SessionState }) {
  const hf = useHackforge(session.cwd)
  const send = useApp((s) => s.send)
  const setDraft = useApp((s) => s.setDraft)
  if (!hf?.present || session.status !== 'idle' || session.permissions.length) return null
  const last = session.items.findLast((i) => i.kind === 'text' || i.kind === 'user')
  if (last?.kind !== 'text' || !CHECKPOINT.test(last.text.slice(-1500))) return null
  return (
    <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 px-6 text-[12px]">
      <span className="text-muted">HackForge is waiting at a checkpoint.</span>
      <button onClick={() => void send('go')} className="ml-auto flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1 font-medium text-white hover:brightness-110">
        <Check className="size-3.5" /> Go
      </button>
      <button
        onClick={() => {
          setDraft('adjust: ')
          requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[data-prompt]')?.focus())
        }}
        className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1 hover:bg-surface-2"
      >
        <PencilLine className="size-3.5" /> Adjust…
      </button>
    </div>
  )
}
