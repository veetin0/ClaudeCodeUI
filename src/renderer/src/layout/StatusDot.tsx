import type { SessionStatus } from '@shared/events'
import { cn } from '@/lib/format'

/** Timing flags: green running, yellow waiting for you, grey ready, red ended. */
const COLORS: Record<SessionStatus, string> = {
  starting: 'bg-idle animate-soft-pulse',
  idle: 'bg-idle',
  running: 'bg-ok animate-soft-pulse',
  waiting: 'bg-warn animate-soft-pulse',
  compacting: 'bg-info animate-soft-pulse',
  closed: 'bg-danger/60',
}

export const STATUS_LABEL: Record<SessionStatus, string> = {
  starting: 'Starting',
  idle: 'Ready',
  running: 'Working',
  waiting: 'Needs you',
  compacting: 'Compacting',
  closed: 'Ended',
}

export function StatusDot({ status, className }: { status: SessionStatus; className?: string }) {
  return <span role="img" aria-label={STATUS_LABEL[status]} className={cn('inline-block size-2 shrink-0 rounded-[2px]', COLORS[status], className)} />
}
