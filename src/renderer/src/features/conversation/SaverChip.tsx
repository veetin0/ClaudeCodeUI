import { Check, Leaf, Settings2, Zap } from 'lucide-react'
import { cn } from '@/lib/format'
import { saverStatus } from '@/lib/saver'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/** Whether this session is saving usage right now, and what the Usage saver did (in the mode chip). */
export function SaverDetails({ session }: { session: SessionState }) {
  const status = saverStatus(session)
  if (!status || !session.saver) return null
  const v = session.saver
  const st = v.stats
  const Icon = status.tone === 'power' ? Zap : Leaf
  return (
    <div className="text-[12px]" data-saver={status.tone}>
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <Icon className={cn('size-3.5', status.tone === 'saving' ? 'text-emerald-500' : status.tone === 'power' ? 'text-amber-500' : 'text-muted')} />
        Usage saver · {status.label}
      </div>
      <p className="mb-2.5 leading-relaxed text-muted">{status.detail}</p>
      {v.enabled && (
        <>
          <ul className="mb-2.5 space-y-0.5 text-muted">
            <li>
              {st.sonnetTurns} turn{st.sonnetTurns === 1 ? '' : 's'} on Sonnet, {st.opusTurns} on Opus
              {st.takeovers > 0 && `, ${st.takeovers} Opus takeover${st.takeovers === 1 ? '' : 's'} mid-task`}
            </li>
            <li>
              {st.compactions ? `Compacted ${st.compactions}× between tasks (${k(st.compactedTokens)} tokens no longer re-read each step)` : 'Not compacted yet (starts at ~100k tokens, between tasks)'}
            </li>
            {st.skipped > 0 && (
              <li>
                Skipped {st.skipped} generated file{st.skipped === 1 ? '' : 's'} (~{k(st.skippedTokens)} tokens)
              </li>
            )}
          </ul>
          <div className="mb-2.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
            <Feature on={v.auto} label="Auto model" />
            <Feature on={v.compact} label="Compact between tasks" />
            <Feature on={v.skipGenerated} label="Skip generated files" />
            <Feature on={v.leanOutput} label="Lean output" />
          </div>
        </>
      )}
      <button
        onClick={() => useApp.getState().setSettingsOpen(true, 'advanced')}
        className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11.5px] hover:bg-surface-2"
      >
        <Settings2 className="size-3.5" /> Saver settings
      </button>
    </div>
  )
}

function Feature({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cn('flex items-center gap-1', on ? 'text-fg' : 'text-muted line-through')}>
      <Check className={cn('size-3', on ? 'text-emerald-500' : 'opacity-0')} />
      {label}
    </span>
  )
}
