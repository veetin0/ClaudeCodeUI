import type { SessionStatus } from '@shared/events'
import { cn } from '@/lib/format'

const COLORS: Record<SessionStatus, string> = {
  starting: 'bg-zinc-400 animate-soft-pulse',
  idle: 'bg-zinc-400',
  running: 'bg-emerald-500 animate-soft-pulse',
  waiting: 'bg-amber-500 animate-soft-pulse',
  compacting: 'bg-sky-500 animate-soft-pulse',
  closed: 'bg-red-500/60',
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
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', COLORS[status], className)} />
}
