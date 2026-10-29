import { AlarmClock, ArrowUp, Plus, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PermissionMode } from '@shared/events'
import type { QuickAction } from '@/lib/actions'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { AUTO_MODEL } from '@shared/usageSaver'
import { useLimit } from '../team/LimitBanner'
import { useResetQueue } from '@/stores/resetQueue'
import { ActionMenu, useActionList } from './ActionMenu'
import { ModeChip } from './ModeChip'

export const PERMISSION_MODES: { value: PermissionMode; label: string }[] = [
  { value: 'default', label: 'Ask before acting' },
  { value: 'acceptEdits', label: 'Auto-accept edits' },
  { value: 'plan', label: 'Plan only' },
  { value: 'auto', label: 'Auto (classifier)' },
  { value: 'bypassPermissions', label: 'Bypass permissions' },
]

/** Offered while the Usage saver is on: it picks Opus or Sonnet for each message. */
export const AUTO_OPTION = { value: AUTO_MODEL, label: 'Auto (Usage saver)' }

export const MODELS = [
  { value: '', label: 'Default model' },
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
]

export function PromptBox({ session }: { session: SessionState }) {
  const text = useApp((s) => s.drafts[session.id] ?? '')
  const setText = useApp((s) => s.setDraft)
  const ref = useRef<HTMLTextAreaElement>(null)
  const { send, interrupt, setActionForm } = useApp()
  const limit = useLimit()
  const queueOn = useResetQueue((s) => s.state?.enabled ?? true)
  const queued = useResetQueue((s) => s.state?.items.some((i) => i.sessionId === session.id) ?? false)
  // At the limit (with run-at-reset on), Enter queues the message instead of sending it.
  const queueing = limit.limited && queueOn
  const offerQueue = !session.observed && (limit.limited || (limit.nearPct ?? 0) >= 80 || queued)
  const resetLabel = limit.resetsAt ? new Date(limit.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined
  const queue = () => {
    const t = text.trim()
    if (!t) return
    void useResetQueue.getState().add({ sessionId: session.id, cwd: session.cwd, title: session.title, text: t })
    setText('')
  }
  const busy = session.status === 'running' || session.status === 'waiting' || session.status === 'compacting'
  // A saved (not live) session accepts input: sending resumes it.
  const saved = !session.live
  // A terminal session being watched: Harness can't type into another process's conversation.
  const watching = session.observed && session.live
  // Back to the prompt after sending, unless an action's form above it has the focus.
  useEffect(() => {
    if (!useApp.getState().actionForm) ref.current?.focus()
  }, [session.id, text === ''])

  // The / menu: typing "/" filters by the first word (a space means arguments, so it closes and
  // Enter sends the raw command); the + button opens it with its own filter field.
  const [plus, setPlus] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [selected, setSelected] = useState(0)
  const slash = !plus && !dismissed && /^\/[^\s]*$/.test(text)
  const menuOpen = plus !== null || slash
  const query = plus ?? (slash ? text : '')
  const { groups, flat, best } = useActionList(session, query)
  useEffect(() => setSelected(best), [query, best])
  useEffect(() => {
    if (!text.startsWith('/')) setDismissed(false)
  }, [text])
  const closeMenu = () => {
    setPlus(null)
    if (slash) setDismissed(true)
  }
  const pick = (a: QuickAction) => {
    if (slash) setText('')
    setPlus(null)
    setActionForm(a.id)
  }
  // Arrow keys, Enter and Tab drive the menu while it's open; Escape closes it.
  const menuKeys = (e: React.KeyboardEvent): boolean => {
    if (!menuOpen) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flat.length) setSelected((selected + (e.key === 'ArrowDown' ? 1 : flat.length - 1)) % flat.length)
      return true
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && flat[selected]) {
      e.preventDefault()
      pick(flat[selected])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
      ref.current?.focus()
      return true
    }
    return false
  }

  // Grow with content up to a cap.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`
  }, [text])

  const submit = () => {
    const t = text.trim()
    if (!t || watching) return
    if (queueing) return queue()
    // Messages sent while the agent is working are queued by the SDK and picked up next.
    void send(t)
    setText('')
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-5">
      <div className="relative rounded-xl border border-line bg-surface shadow-[0_6px_20px_-8px_rgb(21_22_29/0.18)] focus-within:border-accent-ink/60">
        {menuOpen && (
          <ActionMenu
            groups={groups}
            flat={flat}
            selected={selected}
            setSelected={setSelected}
            onPick={pick}
            filter={plus !== null ? { value: plus, onChange: setPlus, onKeyDown: (e) => void menuKeys(e) } : undefined}
          />
        )}
        <textarea
          data-prompt
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (menuKeys(e)) return
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          rows={1}
          disabled={watching}
          placeholder={
            watching
              ? 'Watching a session running in your terminal. Reply there.'
              : queueing
                ? `Usage limit reached: this message runs when it resets${resetLabel ? ` at ${resetLabel}` : ''}…`
                : saved
                ? 'Send a message to resume this session…'
                : busy
                  ? 'Queue a follow-up…'
                  : 'Ask Claude to do something, or type / for actions…'
          }
          className="selectable block w-full resize-none bg-transparent px-4 pt-3 pb-1 leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2">
          {!watching && (
            <button
              onClick={() => (plus === null ? setPlus('') : closeMenu())}
              title="Actions and commands (or type /)"
              aria-label="Actions"
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg',
                plus !== null && 'bg-active text-fg',
              )}
            >
              <Plus className="size-4" />
            </button>
          )}
          <ModeChip session={session} />
          <div className="ml-auto flex items-center gap-2">
            {busy && !watching && (
              <button onClick={() => void interrupt()} title="Stop (Esc)" aria-label="Stop" className="flex size-7 items-center justify-center rounded-md bg-fg text-surface hover:opacity-80">
                <Square className="size-3 fill-current" />
              </button>
            )}
            {offerQueue && !queueing && (
              <button
                onClick={queue}
                disabled={!text.trim()}
                title={`Run this when your usage limit resets${resetLabel ? ` (${resetLabel})` : ''}`}
                aria-label="Queue for the reset" className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg disabled:opacity-40"
              >
                <AlarmClock className="size-4" />
              </button>
            )}
            <button
              onClick={submit}
              disabled={!text.trim()}
              title={queueing ? 'Queue for the reset (⏎)' : 'Send (⏎)'}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-white transition-opacity',
                text.trim() ? 'bg-accent hover:brightness-110' : 'bg-idle/50',
              )}
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
