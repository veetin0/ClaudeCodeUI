import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { PermissionRequest } from '@/stores/reducer'

interface Question {
  question: string
  header?: string
  multiSelect?: boolean
  options?: { label: string; description?: string }[]
}

/**
 * Claude's AskUserQuestion tool (HackForge uses it at checkpoints): options as buttons, plus a
 * free-text answer. Answers go back through the permission round-trip as `updatedInput.answers`.
 */
export function QuestionCard({ req }: { req: PermissionRequest }) {
  const respond = useApp((s) => s.respondPermission)
  const questions = (Array.isArray(req.input.questions) ? req.input.questions : []) as Question[]
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})

  const answerFor = (q: Question) => [...(picked[q.question] ?? []), ...(other[q.question]?.trim() ? [other[q.question].trim()] : [])].join(', ')
  const complete = questions.every((q) => answerFor(q))
  const submit = () => {
    const answers = Object.fromEntries(questions.map((q) => [q.question, answerFor(q)]))
    void respond(req.requestId, { behavior: 'allow', updatedInput: { ...req.input, answers } })
  }
  const toggle = (q: Question, label: string) => {
    const cur = picked[q.question] ?? []
    const next = q.multiSelect ? (cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label]) : [label]
    setPicked({ ...picked, [q.question]: next })
    if (!q.multiSelect) setOther({ ...other, [q.question]: '' })
  }

  return (
    <div className="rounded-lg border border-warn/50 bg-warn/[0.06] p-3">
      <div className="mb-2 flex items-center gap-2">
        <MessageCircleQuestion className="size-4 text-warn-ink" />
        <span className="font-medium">Claude has {questions.length === 1 ? 'a question' : `${questions.length} questions`}</span>
        {req.agentId && <span className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] text-info-ink">subagent</span>}
      </div>
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.question}>
            {q.header && <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{q.header}</div>}
            <div className="mb-1.5 text-[13px]">{q.question}</div>
            <div className="flex flex-wrap gap-1.5">
              {(q.options ?? []).map((o) => {
                const on = picked[q.question]?.includes(o.label)
                return (
                  <button
                    key={o.label}
                    onClick={() => toggle(q, o.label)}
                    title={o.description}
                    className={cn(
                      'max-w-[280px] rounded-lg border px-2.5 py-1.5 text-left text-[12px]',
                      on ? 'border-accent-ink/60 bg-accent/10' : 'border-line bg-surface hover:bg-surface-2',
                    )}
                  >
                    <div className="font-medium">{o.label}</div>
                    {o.description && <div className="line-clamp-2 text-[11px] text-muted">{o.description}</div>}
                  </button>
                )
              })}
            </div>
            <input
              value={other[q.question] ?? ''}
              onChange={(e) => {
                setOther({ ...other, [q.question]: e.target.value })
                if (!q.multiSelect && e.target.value) setPicked({ ...picked, [q.question]: [] })
              }}
              onKeyDown={(e) => e.key === 'Enter' && complete && submit()}
              placeholder="Or type your own answer…"
              className="selectable mt-1.5 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-accent-ink/60"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!complete}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Answer
        </button>
        <button
          onClick={() => void respond(req.requestId, { behavior: 'deny', message: 'The user skipped these questions.' })}
          className="ml-auto rounded-md px-3 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-fg"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
