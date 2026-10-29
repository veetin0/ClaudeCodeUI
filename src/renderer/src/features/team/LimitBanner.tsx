import { AlarmClock, Handshake, Hourglass, X } from 'lucide-react'
import { cn } from '@/lib/format'
import { useNow } from '@/stores/event'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useResetQueue } from '@/stores/resetQueue'
import { useTeamState } from '@/stores/team'

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Whether this laptop's usage limit is reached right now, and until when. */
export function useLimit(): { limited: boolean; resetsAt?: number; nearPct?: number } {
  const u = useTeamState()?.myUsage
  const now = useNow(30_000)
  if (!u || u.source !== 'plan') return { limited: false }
  const limited = u.status === 'rejected' && (!u.resetsAt || u.resetsAt > now)
  const five = u.fiveHour && (!u.fiveHour.resetsAt || u.fiveHour.resetsAt > now) ? u.fiveHour.pct : undefined
  return { limited, resetsAt: limited ? (u.resetsAt ?? u.fiveHour?.resetsAt) : u.fiveHour?.resetsAt, nearPct: five }
}

/** Above the prompt when the usage limit is hit: hand off, or let messages wait for the reset. */
export function LimitBanner({ session }: { session: SessionState }) {
  const { limited, resetsAt } = useLimit()
  const inTeam = !!useTeamState()?.config
  const queue = useResetQueue((s) => s.state)
  const setEnabled = useResetQueue((s) => s.setEnabled)
  if (!limited) return null
  const on = queue?.enabled ?? true
  return (
    <div className="mx-auto mb-2 w-full max-w-3xl px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[12px]">
        <Hourglass className="size-3.5 text-danger-ink" />
        <span className="font-medium">Usage limit reached{resetsAt ? ` until ${clock(resetsAt)}` : ''}.</span>
        <span className="text-muted">{on ? 'Messages you send now wait and run at the reset.' : 'Run-at-reset is off: messages are sent now and will fail.'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => void setEnabled(!on)}
            title="Run queued messages automatically when the limit resets"
            className={cn('flex items-center gap-1 rounded-md border px-2 py-0.5 text-[12px]', on ? 'border-ok/40 bg-ok/10 text-ok-ink' : 'border-line text-muted')}
          >
            <AlarmClock className="size-3" /> Run at reset: {on ? 'on' : 'off'}
          </button>
          {inTeam && (
            <button onClick={() => useApp.getState().openHandoff(session.id)} className="flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-[12px] font-medium text-white hover:brightness-110">
              <Handshake className="size-3" /> Hand off to the team
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** This session's messages waiting for the reset, with cancel and the on/off switch. */
export function QueuedMessages({ session }: { session: SessionState }) {
  const queue = useResetQueue((s) => s.state)
  const { remove, setEnabled } = useResetQueue()
  const mine = queue?.items.filter((i) => i.sessionId === session.id) ?? []
  if (!queue || !mine.length) return null
  return (
    <div className="mx-auto mb-2 w-full max-w-3xl px-6">
      <div className="rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12px]">
        <div className="mb-1 flex items-center gap-2">
          <AlarmClock className="size-3.5 text-accent-ink" />
          <span className="font-medium">
            {mine.length} message{mine.length === 1 ? '' : 's'} {queue.enabled ? `run${mine.length === 1 ? 's' : ''} ${queue.runsAt ? `at ${clock(queue.runsAt)}` : 'when the limit resets'}` : 'waiting (run-at-reset is off)'}
          </span>
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={queue.enabled} onChange={(e) => void setEnabled(e.target.checked)} /> Run at reset
          </label>
        </div>
        {mine.map((i) => (
          <div key={i.id} className="flex items-center gap-2 py-0.5">
            <span className="selectable min-w-0 flex-1 truncate text-muted" title={i.text}>
              {i.text}
            </span>
            <button onClick={() => void remove(i.id)} title="Remove from the queue" className="rounded p-0.5 text-muted hover:bg-hover hover:text-fg">
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
