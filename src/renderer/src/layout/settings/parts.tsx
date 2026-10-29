import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </label>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-accent' : 'bg-muted/35')}
    >
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  )
}

/**
 * One setting or tool: a name, what it does, one switch, and its status. What it needs while on
 * shows below; finer options sit behind "Options".
 */
export function Row({
  icon,
  title,
  via,
  description,
  on,
  onToggle,
  control,
  status,
  options,
  children,
}: {
  icon?: React.ReactNode
  title: string
  via?: string
  description: React.ReactNode
  on?: boolean
  onToggle?: (on: boolean) => void
  /** In place of the switch (e.g. a select). */
  control?: React.ReactNode
  status?: React.ReactNode
  options?: React.ReactNode
  children?: React.ReactNode
}) {
  const [showOptions, setShowOptions] = useState(false)
  const active = onToggle ? !!on : true
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-medium">
            {icon}
            {title}
            {via && <span className="text-[11px] font-normal text-muted">· {via}</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">{description}</div>
          {status && <div className="mt-1 text-[11px] leading-5 text-muted [&_button]:ml-1.5">{status}</div>}
          {active && options && (
            <button onClick={() => setShowOptions(!showOptions)} className="mt-1 flex items-center gap-0.5 text-[11px] text-muted hover:text-fg">
              Options <ChevronDown className={cn('size-3 transition-transform', !showOptions && '-rotate-90')} />
            </button>
          )}
        </div>
        {control ?? (onToggle && <Switch on={!!on} onChange={onToggle} label={title} />)}
      </div>
      {active && options && showOptions && <div className="mt-2 space-y-2 border-t border-line pt-2 text-[12px]">{options}</div>}
      {active && children && <div className="mt-3 border-t border-line pt-3">{children}</div>}
    </div>
  )
}

export const warn = 'text-warn-ink'
export const ok = 'text-ok-ink'
export const smallBtn = 'rounded border border-line px-1.5 py-px text-fg hover:bg-surface-2'

export function ExtLink({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <button onClick={() => void window.harness.openExternal(url)} className="underline hover:text-fg">
      {children}
    </button>
  )
}
