import { HelpCircle, Inbox as InboxIcon, MessageSquare, ShieldQuestion, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { CrewAskView } from '@shared/crew'
import type { InboxItem } from '@shared/run'
import { cn } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useCrew } from '@/stores/crew'
import { useRun, useRunStore } from '@/stores/run'
import { Markdown } from '../conversation/Markdown'
import { Card } from './parts'
import { NextButton } from '@/ui/NextButton'

/**
 * Everything that needs the lead, in one place: your Claude's permission prompts and questions,
 * crew Claudes' permission prompts, decisions your Claude escalated (with its suggestion), and
 * Harness asking how to go on.
 */
export function Inbox({ empty }: { empty?: string }) {
  const run = useRun()
  const crew = useCrew()
  const count = run.inbox.length + crew.asks.length
  if (!count && !empty) return null
  return (
    <Card
      icon={<InboxIcon className="size-4 text-accent-ink" />}
      title="Inbox"
      aside={count > 0 && <span className="num rounded-sm bg-warn px-2 text-[12px] font-semibold text-rail">{count}</span>}
      className={cn(count > 0 && 'border-accent-ink/40')}
    >
      {!count && <div className="text-[12px] text-muted">{empty}</div>}
      <div className="space-y-3">
        {run.inbox.map((item) => (
          <Item key={item.id} item={item} />
        ))}
        {crew.asks.map((a) => (
          <CrewAsk key={a.id} a={a} />
        ))}
      </div>
    </Card>
  )
}

const answer = (id: string, a: Parameters<typeof window.harness.runAnswer>[1]) =>
  useRunStore.getState().act(`answer-${id}`, () => window.harness.runAnswer(id, a))

function Item({ item }: { item: InboxItem }) {
  const Icon = item.kind === 'approval' ? ShieldQuestion : item.kind === 'question' ? HelpCircle : item.kind === 'decision' ? Sparkles : MessageSquare
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 p-3 text-[13px]">
      <div className="mb-1 flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0 text-accent-ink" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.title}</div>
          <div className="text-[11px] text-muted">
            {item.from} · {relativeTime(item.at)}
          </div>
        </div>
      </div>
      {item.kind === 'approval' && <Approval item={item} />}
      {item.kind === 'question' && <Questions item={item} />}
      {item.kind === 'decision' && <Decision item={item} />}
      {item.kind === 'reply' && <Reply item={item} />}
    </div>
  )
}

function Approval({ item }: { item: InboxItem }) {
  return (
    <>
      {item.detail && (
        <code className="selectable mt-1 block whitespace-pre-wrap break-all rounded bg-surface px-2 py-1 font-mono text-[12px]">{item.detail}</code>
      )}
      <div className="mt-2 flex gap-1.5">
        <Btn primary onClick={() => void answer(item.id, { allow: true })}>
          Allow
        </Btn>
        <Btn onClick={() => void answer(item.id, { allow: true, always: true })} title="Allow this kind of call for the rest of the run">
          Always
        </Btn>
        <Btn onClick={() => void answer(item.id, { allow: false })}>Deny</Btn>
      </div>
    </>
  )
}

function Questions({ item }: { item: InboxItem }) {
  const qs = item.questions ?? []
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const toggle = (q: string, opt: string, multi?: boolean) =>
    setPicked((p) => ({ ...p, [q]: multi ? (p[q]?.includes(opt) ? p[q].filter((x) => x !== opt) : [...(p[q] ?? []), opt]) : [opt] }))
  const answerFor = (q: string) => other[q]?.trim() || (picked[q] ?? []).join(', ')
  const ready = qs.every((q) => answerFor(q.question))
  return (
    <div className="mt-2 space-y-3">
      {qs.map((q) => (
        <div key={q.question}>
          {qs.length > 1 && <div className="mb-1 font-medium">{q.question}</div>}
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button
                key={o}
                onClick={() => toggle(q.question, o, q.multiSelect)}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-[12px]',
                  picked[q.question]?.includes(o) ? 'border-accent-ink bg-accent/10 font-medium' : 'border-line hover:bg-surface',
                )}
              >
                {o}
              </button>
            ))}
          </div>
          <input
            value={other[q.question] ?? ''}
            onChange={(e) => setOther((p) => ({ ...p, [q.question]: e.target.value }))}
            placeholder="Or type an answer"
            className="selectable mt-1.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent-ink"
          />
        </div>
      ))}
      <Btn primary disabled={!ready} onClick={() => void answer(item.id, { answers: Object.fromEntries(qs.map((q) => [q.question, answerFor(q.question)])) })}>
        Answer
      </Btn>
    </div>
  )
}

function Decision({ item }: { item: InboxItem }) {
  const [text, setText] = useState('')
  return (
    <div className="mt-1.5 space-y-2">
      {item.detail && <div className="selectable whitespace-pre-wrap text-[12px] text-muted">{item.detail}</div>}
      {item.suggestion && (
        <div className="rounded-md border border-accent-ink/30 bg-accent/[0.06] px-2.5 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-ink">Suggested</span>
          <div className="selectable">{item.suggestion}</div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {item.options?.length ? (
          item.options.map((o) => (
            <Btn key={o} primary={o === item.suggestion} onClick={() => void answer(item.id, { text: o })}>
              {o}
            </Btn>
          ))
        ) : (
          <Btn primary onClick={() => void answer(item.id, { text: item.suggestion ?? '' })}>
            Go with the suggestion
          </Btn>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && text.trim() && void answer(item.id, { text: text.trim() })}
          placeholder="Or write your own answer"
          className="selectable min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[12px] outline-none focus:border-accent-ink"
        />
        <Btn disabled={!text.trim()} onClick={() => void answer(item.id, { text: text.trim() })}>
          Send
        </Btn>
      </div>
    </div>
  )
}

function Reply({ item }: { item: InboxItem }) {
  const [text, setText] = useState('')
  return (
    <div className="mt-1.5 space-y-2">
      {item.detail && (
        <div className="max-h-56 overflow-y-auto rounded-md bg-surface px-2.5 py-1.5 text-[12px]">
          <Markdown text={item.detail} />
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Reply to your Claude"
        rows={2}
        className="selectable w-full resize-y rounded-md border border-line bg-surface px-2 py-1.5 text-[12px] outline-none focus:border-accent-ink"
      />
      <Btn primary disabled={!text.trim()} onClick={() => void answer(item.id, { text: text.trim() })}>
        Send
      </Btn>
    </div>
  )
}

function CrewAsk({ a }: { a: CrewAskView }) {
  const [sent, setSent] = useState(false)
  const reply = (allow: boolean, always?: boolean) => {
    setSent(true)
    void window.harness.crewAnswer(a.id, allow, always)
  }
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/[0.06] p-3 text-[13px]">
      <div className="flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-warn-ink" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{a.fromName}’s Claude wants to run</div>
          <code className="selectable mt-1 block break-all rounded bg-surface px-2 py-1 font-mono text-[12px]">{a.summary}</code>
          {a.missionTitle && <div className="mt-1 text-[11px] text-muted">{a.missionTitle}</div>}
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        <NextButton disabled={sent} onClick={() => reply(true)} more={[{ label: 'Always allow this kind', hint: 'For the rest of the task', disabled: sent, onSelect: () => reply(true, true) }]}>
          Allow
        </NextButton>
        <Btn disabled={sent} onClick={() => reply(false)}>
          Deny
        </Btn>
      </div>
    </div>
  )
}

function Btn({ primary, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...rest}
      className={cn(
        'rounded-md px-2.5 py-1 text-[12px] disabled:opacity-40',
        primary ? 'bg-accent font-medium text-white hover:brightness-110' : 'border border-line hover:bg-surface',
        className,
      )}
    />
  )
}
