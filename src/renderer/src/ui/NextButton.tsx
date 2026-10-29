import { ChevronDown, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/format'
import { Menu, type MenuItem } from './Menu'

/**
 * A screen's or card's one main action. Its alternatives sit behind the ▾, so the
 * next thing to do is obvious and nothing else is lost.
 */
export function NextButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  busy,
  title,
  more,
  tone = 'primary',
  className,
}: {
  icon?: LucideIcon
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  busy?: boolean
  title?: string
  more?: MenuItem[]
  tone?: 'primary' | 'secondary'
  className?: string
}) {
  const primary = tone === 'primary'
  const hasMore = !!more && more.length > 0
  return (
    <div className={cn('inline-flex items-stretch', className)}>
      <button
        onClick={onClick}
        disabled={disabled || busy}
        title={title}
        className={cn(
          'flex h-7 items-center gap-1.5 px-3 text-[13px] font-medium disabled:opacity-50',
          hasMore ? 'rounded-l-lg' : 'rounded-lg',
          primary ? 'bg-accent text-white hover:brightness-110 active:brightness-95' : 'border border-line bg-surface hover:bg-hover',
          !primary && hasMore && 'border-r-0',
        )}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : Icon && <Icon className="size-3.5" />}
        {children}
      </button>
      {hasMore && (
        <Menu
          items={more}
          label="More options"
          trigger={<ChevronDown className="size-3.5" />}
          triggerClassName={cn(
            'h-full rounded-l-none rounded-r-lg px-1.5',
            primary
              ? 'border-l border-white/25 bg-accent text-white hover:bg-accent hover:text-white hover:brightness-110'
              : 'border border-line bg-surface text-fg hover:bg-hover',
          )}
        />
      )}
    </div>
  )
}
