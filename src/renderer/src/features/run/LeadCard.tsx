import { Crown, ExternalLink, PlugZap } from 'lucide-react'
import type { SessionStatus } from '@shared/events'
import { headroom } from '@shared/team'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useRun, useRunStore } from '@/stores/run'
import { useTeamState } from '@/stores/team'
import { Secondary, UsageBar, useBusy } from './parts'

const STATUS: Partial<Record<SessionStatus, string>> = {
  starting: 'Starting',
  idle: 'Waiting',
  running: 'Working',
  waiting: 'Needs you (inbox)',
  compacting: 'Compacting',
  closed: 'Stopped',
}

/** Your own Claude in the run: what it's doing, and a way into its full conversation. */
export function LeadCard({ compact }: { compact?: boolean }) {
  const run = useRun()
  const team = useTeamState()
  const pct = team ? headroom(team.myUsage, Date.now()) : undefined
  const working = run.lead.status === 'running' || run.lead.status === 'compacting'
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'size-2 rounded-[2px]',
            !run.sessionLive ? 'bg-fg/25' : working ? 'bg-ok' : run.lead.status === 'waiting' ? 'bg-warn' : 'bg-idle',
          )}
        />
        <Crown className="size-3.5 text-accent-ink" />
        <span className="font-semibold">Your Claude</span>
        <span className="text-[12px] text-muted">
          {run.sessionLive ? (STATUS[(run.lead.status ?? 'idle') as SessionStatus] ?? run.lead.status) : 'Not connected'}
        </span>
        {run.sessionId && run.sessionLive && (
          <button
            onClick={() => useApp.getState().select(run.sessionId!)}
            className="ml-auto flex items-center gap-1 text-[12px] text-muted hover:text-fg"
            title="Open the full conversation"
          >
            Watch <ExternalLink className="size-3" />
          </button>
        )}
      </div>
      {pct !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1">
            <UsageBar pct={pct} />
          </div>
          <span className="text-[12px] num text-muted">{pct}% usage left</span>
        </div>
      )}
      {run.sessionLive && run.lead.activity && <div className="selectable mt-2 truncate font-mono text-[12px] text-muted">{run.lead.activity}</div>}
      {!compact && run.sessionLive && run.lead.lastText && (
        <div className="selectable mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] text-muted">{run.lead.lastText.slice(-600)}</div>
      )}
      {!run.sessionLive && run.sessionId && <Reconnect id={run.sessionId} />}
    </div>
  )
}

function Reconnect({ id }: { id: string }) {
  const busy = useBusy('reconnect')
  return (
    <div className="mt-2 flex items-center gap-2 text-[12px]">
      <span className="text-muted">Harness restarted or the session stopped. Your Claude picks up where it was.</span>
      <Secondary
        busy={busy}
        className="ml-auto shrink-0"
        onClick={() =>
          void useRunStore.getState().act('reconnect', async () => {
            await useApp.getState().resumeQuiet(id, 'acceptEdits')
            await window.harness.runReconnect(id)
          })
        }
      >
        <PlugZap className="size-3.5" /> Reconnect
      </Secondary>
    </div>
  )
}
