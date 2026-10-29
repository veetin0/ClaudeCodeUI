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
    <div role="tablist" aria-label={label} className={cn('no-drag flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={cn(
            'flex h-6 items-center gap-1.5 rounded-md px-2.5 text-[12px] transition-colors',
            value === o.id ? 'bg-surface font-medium text-fg shadow-[0_1px_2px_rgb(21_22_29/0.12)]' : 'text-muted hover:bg-hover hover:text-fg',
          )}
        >
          {o.icon && <o.icon className="size-3.5" aria-hidden />}
          {o.label}
          {o.dot && <span className={cn('size-1.5 rounded-[1px]', o.dot === 'live' ? 'bg-ok' : 'bg-accent')} />}
          {o.badge !== undefined && o.badge !== '' && o.badge !== 0 && (
            <span className="num rounded-sm bg-accent px-1 text-[12px] font-semibold leading-4 text-white">{o.badge}</span>
          )}
        </button>
      ))}
    </div>
  )
}
