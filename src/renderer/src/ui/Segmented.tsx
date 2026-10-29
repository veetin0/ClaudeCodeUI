import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/format'

export interface SegmentedOption<T extends string> {
  id: T
  label: string
  icon?: LucideIcon
  badge?: string | number
  /** A small status dot: something is live there. */
  dot?: 'live' | 'ready'
  title?: string
}

/** The one tab style: session views, Hackathon tabs, Agents modes, Settings tabs. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: SegmentedOption<T>[]
  className?: string
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('no-drag flex items-center gap-0.5 rounded-lg bg-black/[0.05] p-0.5 dark:bg-white/[0.07]', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors',
            value === o.id ? 'bg-surface font-medium text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.icon && <o.icon className="size-3.5" />}
          {o.label}
          {o.dot && <span className={cn('size-1.5 rounded-full', o.dot === 'live' ? 'bg-emerald-500' : 'bg-[var(--accent)]')} />}
          {o.badge !== undefined && o.badge !== '' && o.badge !== 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold leading-4 text-white tabular-nums">{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
