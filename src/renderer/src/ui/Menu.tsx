import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/format'
import { Popover } from './Popover'

export type MenuItem =
  | { label: string; icon?: LucideIcon; keys?: string; hint?: string; onSelect: () => void; disabled?: boolean; danger?: boolean; checked?: boolean }
  | { heading: string }
  | 'separator'

/** Drops falsy entries so callers can write `cond && { … }`. */
export const menuItems = (...items: (MenuItem | false | null | undefined | '' | 0)[]): MenuItem[] => items.filter((i): i is MenuItem => !!i)

/**
 * The ⋯ menu: everything that isn't a screen's one main action lives here.
 * Arrow keys move between items; Enter picks one.
 */
export function Menu({
  items,
  label = 'More',
  align = 'end',
  side = 'bottom',
  trigger,
  triggerClassName,
}: {
  items: MenuItem[]
  label?: string
  align?: 'start' | 'end'
  side?: 'bottom' | 'top'
  /** Custom trigger content; a ⋯ icon by default. */
  trigger?: React.ReactNode
  triggerClassName?: string
}) {
  if (items.length === 0) return null
  return (
    <Popover
      align={align}
      side={side}
      className="w-max min-w-[220px] max-w-[340px]"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          className={cn(
            'flex items-center gap-1 rounded-md text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10',
            trigger ? 'px-2 py-1 text-[12px]' : 'p-1',
            open && 'bg-black/5 text-fg dark:bg-white/10',
            triggerClassName,
          )}
        >
          {trigger ?? <MoreHorizontal className="size-4" />}
        </button>
      )}
    >
      {(close) => <MenuList items={items} close={close} />}
    </Popover>
  )
}

function MenuList({ items, close }: { items: MenuItem[]; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(), [])
  return (
    <div
      role="menu"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const i = all.indexOf(document.activeElement as HTMLButtonElement)
        all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
      }}
    >
      {items.map((item, i) =>
        item === 'separator' ? (
          <div key={i} className="my-1 h-px bg-line" />
        ) : 'heading' in item ? (
          <div key={i} className="px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            {item.heading}
          </div>
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              close()
              item.onSelect()
            }}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-black/5 focus-visible:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10 dark:focus-visible:bg-white/10',
              item.danger && 'text-red-600 dark:text-red-400',
            )}
          >
            {item.icon ? <item.icon className="size-4 shrink-0 text-muted" /> : item.checked !== undefined ? <span className="size-4" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              {item.hint && <span className="block truncate text-[11px] text-muted">{item.hint}</span>}
            </span>
            {item.checked && <span className="text-[var(--accent)]">✓</span>}
            {item.keys && <kbd className="shrink-0 text-[11px] text-muted">{item.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}
