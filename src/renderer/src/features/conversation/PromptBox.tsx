import { AlarmClock, ArrowUp, Square } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { PermissionMode } from '@shared/events'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { AUTO_MODEL } from '@shared/usageSaver'
import { SaverChip } from './SaverChip'
import { useLimit } from '../team/LimitBanner'
import { useResetQueue } from '@/stores/resetQueue'

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
  const { send, interrupt, setPermissionMode, setModel } = useApp()
  const saverOn = useApp((s) => session.saver?.enabled ?? s.settings?.usageSaver?.enabled ?? false)
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
  useEffect(() => ref.current?.focus(), [session.id, text === ''])

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
      <div className="rounded-2xl border border-line bg-surface shadow-[0_1px_8px_rgb(0_0_0/0.06)] focus-within:border-[var(--accent)]/50">
        <textarea
          data-prompt
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
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
                  : 'Ask Claude to do something…'
          }
          className="selectable block w-full resize-none bg-transparent px-4 pt-3 pb-1 leading-relaxed outline-none placeholder:text-muted"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <Select value={session.permissionMode} onChange={(v) => void setPermissionMode(v as PermissionMode)} options={PERMISSION_MODES} />
          <Select
            value={session.saver?.auto ? AUTO_MODEL : MODELS.some((m) => m.value === session.model) ? session.model! : ''}
            onChange={(v) => v && void setModel(v)}
            options={[
              ...(saverOn ? [AUTO_OPTION] : []),
              ...MODELS.map((m) => (m.value === '' && session.model && !session.saver?.auto ? { ...m, label: session.model } : m)),
            ]}
          />
          {!watching && <SaverChip session={session} />}
          <div className="ml-auto flex items-center gap-2">
            {busy && !watching && (
              <button onClick={() => void interrupt()} title="Stop (Esc)" className="flex size-7 items-center justify-center rounded-full bg-fg text-surface hover:opacity-80">
                <Square className="size-3 fill-current" />
              </button>
            )}
            {offerQueue && !queueing && (
              <button
                onClick={queue}
                disabled={!text.trim()}
                title={`Run this when your usage limit resets${resetLabel ? ` (${resetLabel})` : ''}`}
                className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-fg disabled:opacity-40 dark:hover:bg-white/10"
              >
                <AlarmClock className="size-4" />
              </button>
            )}
            <button
              onClick={submit}
              disabled={!text.trim()}
              title={queueing ? 'Queue for the reset (⏎)' : 'Send (⏎)'}
              className={cn(
                'flex size-7 items-center justify-center rounded-full text-white transition-opacity',
                text.trim() ? 'bg-[var(--accent)] hover:brightness-110' : 'bg-zinc-400/40',
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

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md bg-transparent px-1.5 py-1 text-[11.5px] text-muted outline-none hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
