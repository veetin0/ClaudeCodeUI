import { ChevronDown, Flame, Play, SquarePen, Terminal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { commandAction, fillTemplate, KNOWN_COMMANDS, QUICK_ACTIONS, visibleCommands, type QuickAction } from '@/lib/actions'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useHackforge } from '@/stores/hackforge'
import { HACKFORGE_ACTIONS, HACKFORGE_SETUP } from '@/lib/hackforgeActions'

/**
 * Buttons in place of typing /commands: each opens a small form prefilled with example
 * parameters and a live preview of the exact prompt that will be sent.
 */
export function ActionBar({ session }: { session: SessionState }) {
  const formId = useApp((s) => s.actionForm)
  const setForm = useApp((s) => s.setActionForm)
  const mode = useApp((s) => s.settings?.hackforgeMode ?? 'projects')
  const hf = useHackforge(session.cwd)
  // HackForge buttons: in projects that use it, or everywhere in "always" mode.
  const hfOn = mode !== 'off' && (hf?.present || mode === 'always')
  // Prefill from the project: Run starts on the profile hackforge.yaml already has.
  const hfAll = useMemo(
    () => HACKFORGE_ACTIONS.map((a) => (a.id === 'hf-run' && hf?.config.profile ? { ...a, params: a.params.map((p) => (p.key === 'profile' ? { ...p, example: hf.config.profile! } : p)) } : a)),
    [hf?.config.profile],
  )
  const hfActions = hfOn ? hfAll.filter((a) => hf?.initialized || HACKFORGE_SETUP.has(a.id)) : []
  const active: QuickAction | null = formId
    ? (QUICK_ACTIONS.find((a) => a.id === formId) ?? hfAll.find((a) => a.id === formId) ?? (formId.startsWith('cmd:') ? commandAction(formId.slice(4)) : null))
    : null
  const setActive = (a: QuickAction | null) => setForm(a?.id ?? null)
  const [commandsOpen, setCommandsOpen] = useState(false)
  const commands = visibleCommands(session.slashCommands).filter((c) => !(hfOn && c.startsWith('hackforge:')))

  return (
    <div className="mx-auto w-full max-w-3xl px-6">
      {active && <ActionForm key={active.id} action={active} cwd={session.cwd} onClose={() => setActive(null)} />}
      {hfActions.length > 0 && (
        <div className="relative flex items-center gap-1.5 overflow-x-auto pb-1.5 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none]">
          <span className="flex shrink-0 items-center gap-1 pr-1 text-[10.5px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400" title="HackForge commands">
            <Flame className="size-3.5" /> HackForge
          </span>
          {hfActions.map((a) => (
            <ActionButton key={a.id} action={a} hf selected={active?.id === a.id} onClick={() => setActive(active?.id === a.id ? null : a)} />
          ))}
        </div>
      )}
      <div className="relative flex items-center gap-1.5 overflow-x-auto pb-2 pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-32px),transparent)] [scrollbar-width:none]">
        {QUICK_ACTIONS.map((a) => (
          <ActionButton key={a.id} action={a} selected={active?.id === a.id} onClick={() => setActive(active?.id === a.id ? null : a)} />
        ))}
        {commands.length > 0 && (
          <button
              onClick={() => setCommandsOpen(!commandsOpen)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11.5px] text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <Terminal className="size-3.5" /> Commands <ChevronDown className="size-3" />
          </button>
        )}
      </div>
      {commandsOpen && (
        <CommandPicker
          commands={commands}
          onPick={(c) => {
            setCommandsOpen(false)
            setActive(commandAction(c))
          }}
          onClose={() => setCommandsOpen(false)}
        />
      )}
    </div>
  )
}

function ActionButton({ action, selected, disabled, hf, onClick }: { action: QuickAction; selected: boolean; disabled?: boolean; hf?: boolean; onClick: () => void }) {
  const Icon = action.icon
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={action.description}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-40',
        selected ? 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-fg' : 'border-line text-muted hover:bg-surface-2 hover:text-fg',
        hf && !selected && 'border-orange-500/30',
      )}
    >
      <Icon className="size-3.5" />
      {action.label}
    </button>
  )
}

function ActionForm({ action, cwd, onClose }: { action: QuickAction; cwd: string; onClose: () => void }) {
  const { send, setDraft } = useApp()
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(action.params.map((p) => [p.key, p.example])))
  const prompt = useMemo(() => fillTemplate(action.template, values), [action, values])
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const Icon = action.icon

  useEffect(() => {
    first.current?.focus()
    first.current?.select()
  }, [])

  const run = () => {
    onClose()
    void (async () => {
      try {
        await action.beforeRun?.(values, cwd)
      } catch (err) {
        console.error(err)
      }
      await send(prompt)
    })()
  }

  return (
    <div
      className="mb-2 rounded-2xl border border-line bg-surface p-4 shadow-[0_4px_24px_rgb(0_0_0/0.08)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          run()
        }
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <Icon className="size-4 text-[var(--accent)]" />
        <span className="font-semibold">{action.label}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10" title="Close (Esc)">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mb-3 text-[12px] text-muted">{action.description}</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {action.params.map((p, i) => (
          <label key={p.key} className={cn('block', p.multiline && 'col-span-full')}>
            <div className="mb-1 flex items-baseline gap-2 text-[11.5px] font-medium">
              {p.label}
              {p.hint && <span className="font-normal text-muted">{p.hint}</span>}
            </div>
            {p.options ? (
              <div className="flex flex-wrap gap-1">
                {p.options.map((o) => (
                  <button
                    key={o}
                    onClick={() => setValues({ ...values, [p.key]: o })}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-[12px]',
                      values[p.key] === o ? 'border-[var(--accent)]/60 bg-[var(--accent)]/10 font-medium' : 'border-line text-muted hover:text-fg',
                    )}
                  >
                    {o || 'default'}
                  </button>
                ))}
              </div>
            ) : p.multiline ? (
              <textarea
                ref={i === 0 ? first : undefined}
                rows={2}
                value={values[p.key]}
                placeholder={p.example}
                onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
                className="selectable w-full resize-none rounded-md border border-line bg-surface-2 px-2.5 py-1.5 outline-none focus:border-[var(--accent)]/60"
              />
            ) : (
              <input
                ref={i === 0 ? first : undefined}
                value={values[p.key]}
                placeholder={p.example}
                onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
                className="selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 outline-none focus:border-[var(--accent)]/60"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
        <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Will send</div>
        <div className="selectable whitespace-pre-wrap text-[12px] leading-relaxed">{prompt}</div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={run} className="flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
          <Play className="size-3.5 fill-current" /> Run <kbd className="opacity-70">⌘⏎</kbd>
        </button>
        <button
          onClick={() => {
            setDraft(prompt)
            onClose()
          }}
          className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2"
        >
          <SquarePen className="size-3.5" /> Edit in prompt
        </button>
      </div>
    </div>
  )
}

function CommandPicker({ commands, onPick, onClose }: { commands: string[]; onPick: (c: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const known = commands.filter((c) => KNOWN_COMMANDS[c])
  const others = commands.filter((c) => !KNOWN_COMMANDS[c])
  const match = (c: string) => c.includes(q.toLowerCase())
  return (
    <div className="mb-2 rounded-2xl border border-line bg-surface p-2 shadow-[0_4px_24px_rgb(0_0_0/0.08)]" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter commands and skills…"
        className="selectable mb-1 w-full rounded-md bg-surface-2 px-2.5 py-1.5 outline-none"
      />
      <div className="max-h-64 overflow-y-auto">
        {[...known.filter(match), ...others.filter(match)].map((c) => {
          const info = KNOWN_COMMANDS[c]
          const Icon = info?.icon ?? Terminal
          return (
            <button key={c} onClick={() => onPick(c)} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left hover:bg-surface-2">
              <Icon className="size-3.5 shrink-0 text-muted" />
              <span className="font-mono text-[12px]">/{c}</span>
              {info && <span className="truncate text-[11.5px] text-muted">{info.description}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
