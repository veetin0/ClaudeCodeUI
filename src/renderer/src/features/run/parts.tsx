import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/format'
import { useRunStore } from '@/stores/run'
import { SectorMeter } from '@/ui/Sectors'

/** The one obvious next action on a step. */
export function Primary({ busy, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 py-2 font-medium text-white hover:brightness-110 disabled:opacity-40',
        className,
      )}
    >
      {busy && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Secondary({ busy, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 py-1.5 text-[13px] hover:bg-surface-2 disabled:opacity-40',
        className,
      )}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  )
}

export function Card({
  title,
  icon,
  aside,
  children,
  className,
}: {
  title?: ReactNode
  icon?: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface p-4', className)}>
      {(title || aside) && (
        <div className="mb-3 flex items-center gap-2">
          {icon}
          {title && <h2 className="text-[13px] font-semibold">{title}</h2>}
          {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Working({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      <Loader2 className="size-4 animate-spin text-muted" />
      {children}
    </div>
  )
}

/** The busy label of the action running now, if it's this one. */
export const useBusy = (label: string) => useRunStore((s) => s.busy === label)

/** Usage left as sectors. */
export function UsageBar({ pct }: { pct: number }) {
  return <SectorMeter value={pct / 100} tone={pct <= 10 ? 'fail' : pct <= 30 ? 'wait' : 'fill'} height={3} label="Plan usage left" />
}
