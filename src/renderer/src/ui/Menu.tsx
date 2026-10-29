import { Check, MoreHorizontal, type LucideIcon } from 'lucide-react'
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
            'flex items-center gap-1 rounded-md text-muted hover:bg-hover hover:text-fg',
            trigger ? 'px-2 py-1 text-[12px]' : 'p-1',
            open && 'bg-hover text-fg',
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
          <div key={i} className="label-caps px-2.5 pb-0.5 pt-1.5 text-[11px]">
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
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-hover focus-visible:bg-hover disabled:opacity-40',
              item.danger && 'text-danger-ink',
            )}
          >
            {item.icon ? <item.icon className="size-4 shrink-0 text-muted" aria-hidden /> : item.checked !== undefined ? <span className="size-4" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{item.label}</span>
              {item.hint && <span className="block truncate text-[11px] text-muted">{item.hint}</span>}
            </span>
            {item.checked && <Check className="size-3.5 shrink-0 text-accent-ink" aria-label="Selected" />}
            {item.keys && <kbd className="num shrink-0 text-[12px] text-muted">{item.keys}</kbd>}
          </button>
        ),
      )}
    </div>
  )
}
