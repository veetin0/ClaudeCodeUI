import { X } from 'lucide-react'
import { cn } from '@/lib/format'

/** A large panel over whatever place you're in: Settings and Usage. Escape is handled by the app. */
export function Sheet({
  title,
  icon,
  header,
  onClose,
  children,
  wide,
}: {
  title: string
  icon?: React.ReactNode
  /** Tabs or controls next to the title. */
  header?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgb(14_15_20/0.45)] p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-label={title}
        className={cn('flex max-h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]', wide ? 'h-[min(860px,100%)] max-w-5xl' : 'max-h-[min(820px,100%)] max-w-2xl')}
      >
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-5 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            {icon}
            {title}
          </h2>
          {header}
          <button onClick={onClose} className="ml-auto rounded-md p-1 text-muted hover:bg-hover hover:text-fg" title="Close (Esc)" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
