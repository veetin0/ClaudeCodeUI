import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { QuickAction } from '@/lib/actions'
import { actionMenuItems, filterActions } from '@/lib/actionMenu'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'

/** The / menu's list for a session, filtered by what was typed. */
export function useActionList(session: SessionState, query: string) {
  const hf = useHackforge(session.cwd)
  const mode = useApp((s) => s.settings?.hackforgeMode ?? 'projects')
  return useMemo(() => filterActions(actionMenuItems({ hf, mode, slashCommands: session.slashCommands }), query), [hf, mode, session.slashCommands, query])
}

/**
 * Every action in one searchable list, opened by typing / or the + button: the suggested next
 * step, HackForge, quick actions and the project's commands. Picking one opens its form.
 */
export function ActionMenu({
  groups,
  flat,
  selected,
  setSelected,
  onPick,
  filter,
}: {
  groups: { heading: string; actions: QuickAction[] }[]
  flat: QuickAction[]
  selected: number
  setSelected: (i: number) => void
  onPick: (a: QuickAction) => void
  /** The + button's own filter field (typing / filters from the prompt instead). */
  filter?: { value: string; onChange: (v: string) => void; onKeyDown: (e: React.KeyboardEvent) => void }
}) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  return (
    <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_8px_32px_rgb(0_0_0/0.14)]" role="listbox" aria-label="Actions">
      {filter && (
        <label className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-3.5 text-muted" />
          <input
            autoFocus
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            onKeyDown={filter.onKeyDown}
            placeholder="Find an action or command…"
            className="selectable min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted"
          />
        </label>
      )}
      <div ref={list} className="max-h-[min(420px,50vh)] overflow-y-auto p-1.5">
        {flat.length === 0 && <div className="px-3 py-4 text-center text-[12px] text-muted">Nothing matches. Press Enter to send what you typed.</div>}
        {groups.map((g) => (
          <div key={g.heading}>
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{g.heading}</div>
            {g.actions.map((a) => {
              const i = flat.indexOf(a)
              const cmd = /^\/([\w:-]+)/.exec(a.template)?.[1]
              return (
                <button
                  key={a.id}
                  role="option"
                  aria-selected={i === selected}
                  data-selected={i === selected}
                  onMouseEnter={() => setSelected(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(a)}
                  className={cn('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left', i === selected && 'bg-accent/10')}
                >
                  <a.icon className={cn('size-4 shrink-0', g.heading === 'Suggested' ? 'text-accent-ink' : 'text-muted')} />
                  <span className="shrink-0 font-medium">{a.label}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{a.description}</span>
                  {cmd && !a.label.startsWith('/') && <span className="shrink-0 font-mono text-[11px] text-muted">/{cmd}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
