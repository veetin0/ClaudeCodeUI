import { cn } from '@/lib/format'

/**
 * Mini-sectors: progress and history as a row of segments, like a lap split into timed
 * sectors. Green is done, the live one sweeps, yellow waits for you, red failed, violet is
 * the best result, ink is a plain amount (usage, context), grey is still to come.
 */
export type SectorTone = 'done' | 'live' | 'wait' | 'fail' | 'best' | 'fill' | 'todo'

export interface Sector {
  tone: SectorTone
  /** A data colour (a tool kind) instead of the tone's. */
  color?: string
  title?: string
}

const TONE: Record<SectorTone, string> = {
  done: 'bg-ok',
  live: 'bg-ok sector-live',
  wait: 'bg-warn',
  fail: 'bg-danger',
  best: 'bg-accent',
  fill: 'bg-fg/70',
  todo: '',
}

export function Sectors({ items, height = 4, className, label }: { items: Sector[]; height?: number; className?: string; label?: string }) {
  return (
    <div className={cn('sectors', className)} style={{ height }} aria-label={label} role={label ? 'img' : undefined}>
      {items.map((s, i) => (
        <span
          key={i}
          title={s.title}
          className={cn('sector', TONE[s.tone], s.color && s.tone === 'live' && 'sector-live')}
          style={s.color && s.tone !== 'fail' ? { backgroundColor: s.color } : undefined}
        />
      ))}
    </div>
  )
}

/** A value as filled sectors (plan usage, context, progress). */
export function SectorMeter({
  value,
  count = 20,
  tone = 'done',
  height = 4,
  className,
  label,
}: {
  /** 0–1. */
  value: number
  count?: number
  tone?: SectorTone
  height?: number
  className?: string
  label?: string
}) {
  const v = Math.max(0, Math.min(1, value))
  const filled = v > 0 ? Math.max(1, Math.round(v * count)) : 0
  // Only the leading sector of a live meter sweeps; the ones behind it are done.
  const items: Sector[] = Array.from({ length: count }, (_, i) => ({
    tone: i >= filled ? 'todo' : tone === 'live' && i < filled - 1 ? 'done' : tone,
  }))
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label} className={className}>
      <Sectors items={items} height={height} />
    </div>
  )
}

/** Named steps as sectors with their labels under them; the current one is live. */
export function SectorSteps<T extends string>({
  steps,
  current,
  labels,
  waiting,
  className,
  label,
}: {
  steps: readonly T[]
  /** Nothing is current before the first step starts. */
  current: T | undefined
  labels: Record<T, string>
  /** The current step is waiting for you rather than running. */
  waiting?: boolean
  className?: string
  label?: string
}) {
  const at = current === undefined ? -1 : steps.indexOf(current)
  return (
    <ol className={cn('grid gap-[2px]', className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label={label}>
      {steps.map((s, i) => {
        const tone: SectorTone = i < at ? 'done' : i === at ? (waiting ? 'wait' : 'live') : 'todo'
        return (
          <li key={s} aria-current={i === at ? 'step' : undefined} className="min-w-0">
            <span className={cn('sector block h-1', TONE[tone])} />
            <span className={cn('num mt-1.5 block truncate text-[12px] font-semibold uppercase tracking-[0.06em]', i === at ? 'text-fg' : 'text-muted')}>
              {labels[s]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
