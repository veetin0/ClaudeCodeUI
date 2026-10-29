import { Play, SquarePen, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fillTemplate, type QuickAction } from '@/lib/actions'
import { findAction } from '@/lib/actionMenu'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useHackforge } from '@/stores/hackforge'
import type { SessionState } from '@/stores/reducer'
import { shortcut } from '@/lib/keys'
import { NextStep } from './NextStep'

/**
 * Above the prompt box: the open action's form (prefilled parameters and a live preview of the
 * exact prompt), or else the one suggested next step.
 */
export function ActionDock({ session }: { session: SessionState }) {
  const formId = useApp((s) => s.actionForm)
  const setForm = useApp((s) => s.setActionForm)
  const hf = useHackforge(session.cwd)
  const action = formId ? findAction(formId, hf) : null
  return (
    <div className="mx-auto w-full max-w-3xl px-6">
      {action ? <ActionForm key={action.id} action={action} cwd={session.cwd} onClose={() => setForm(null)} /> : <NextStep session={session} />}
    </div>
  )
}

export function ActionForm({ action, cwd, onClose }: { action: QuickAction; cwd: string; onClose: () => void }) {
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
        <Icon className="size-4 text-accent-ink" />
        <span className="font-semibold">{action.label}</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-muted hover:bg-hover" title="Close (Esc)">
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mb-3 text-[12px] text-muted">{action.description}</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {action.params.map((p, i) => (
          <label key={p.key} className={cn('block', p.multiline && 'col-span-full')}>
            <div className="mb-1 flex items-baseline gap-2 text-[12px] font-medium">
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
                      values[p.key] === o ? 'border-accent-ink/60 bg-accent/10 font-medium' : 'border-line text-muted hover:text-fg',
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
                className="selectable w-full resize-none rounded-md border border-line bg-surface-2 px-2.5 py-1.5 outline-none focus:border-accent-ink/60"
              />
            ) : (
              <input
                ref={i === 0 ? first : undefined}
                value={values[p.key]}
                placeholder={p.example}
                onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}
                className="selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 outline-none focus:border-accent-ink/60"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
        <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Will send</div>
        <div className="selectable whitespace-pre-wrap text-[12px] leading-relaxed">{prompt}</div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button onClick={run} className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110">
          <Play className="size-3.5 fill-current" /> Run <kbd className="opacity-70">{shortcut('⌘⏎')}</kbd>
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
