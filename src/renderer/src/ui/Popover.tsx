import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/format'

export interface PopoverProps {
  /** The button that opens it. */
  trigger: (p: { open: boolean; toggle: () => void }) => React.ReactNode
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
  align?: 'start' | 'end'
  side?: 'bottom' | 'top'
  className?: string
  /** Called when it opens or closes (to focus something inside, for example). */
  onOpenChange?: (open: boolean) => void
}

/**
 * A panel anchored to its trigger. It closes on Escape (before the app's own Escape handling)
 * and on a click outside.
 */
export function Popover({ trigger, children, align = 'end', side = 'bottom', className, onOpenChange }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const set = (v: boolean) => {
    setOpen(v)
    onOpenChange?.(v)
  }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) set(false)
    }
    // Capture: Escape closes this, not the sheet or session behind it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        set(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={ref} className="no-drag relative inline-flex">
      {trigger({ open, toggle: () => set(!open) })}
      {open && (
        <div
          className={cn(
            'absolute z-50 min-w-[200px] rounded-lg border border-line bg-surface p-1 text-[13px] text-fg shadow-[var(--shadow-pop)]',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {typeof children === 'function' ? children(() => set(false)) : children}
        </div>
      )}
    </div>
  )
}
