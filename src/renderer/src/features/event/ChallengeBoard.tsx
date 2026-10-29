import { Bot, ChevronDown, ChevronRight, ClipboardPaste, ExternalLink, Plus, Search, Star, Trash2, Trophy, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  analyzePrompt,
  CHALLENGE_STATUSES,
  CRITERIA,
  importPrompt,
  rankChallenges,
  researchPrompt,
  scoreChallenge,
  type Challenge,
  type CriterionKey,
} from '@shared/challenges'
import type { EventState } from '@shared/event'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useEvent } from '@/stores/event'
import { Markdown } from '../conversation/Markdown'
import { Menu, menuItems } from '@/ui/Menu'
import { NextButton } from '@/ui/NextButton'

const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] outline-none focus:border-accent-ink/60'
const STATUS_LABEL: Record<Challenge['status'], string> = { candidate: 'Candidate', shortlist: 'Shortlist', chosen: 'Chosen', dropped: 'Dropped' }

/** Rank the partner challenges (team + Claude scores), research them, and pick one. */
export function ChallengeBoard({ state }: { state: EventState }) {
  const { askClaude } = useEvent()
  const [panel, setPanel] = useState<'add' | 'import' | null>(null)
  if (!state.projectDir) {
    return <Empty text="Set up or link the event project first (Build or Schedule). Challenges are saved in its challenges/ folder so the whole team shares them." />
  }
  const ranked = rankChallenges(state.challenges)
  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Trophy className="size-4 text-accent-ink" />
          <h2 className="text-[13px] font-semibold">Challenges</h2>
          <span className="text-[11px] text-muted">{state.challenges.length ? `${state.challenges.length} in challenges/` : 'paste them in when they are presented'}</span>
          <div className="ml-auto">
            {state.challenges.length ? (
              <NextButton
                icon={Bot}
                onClick={() => void askClaude(analyzePrompt(), 'Analysis of all challenges')}
                more={menuItems(
                  { label: 'Paste all', icon: ClipboardPaste, hint: 'The challenge page’s text; Claude splits it up', onSelect: () => setPanel('import') },
                  { label: 'Add one', icon: Plus, onSelect: () => setPanel('add') },
                )}
              >
                Analyze all with Claude
              </NextButton>
            ) : (
              <NextButton icon={ClipboardPaste} onClick={() => setPanel(panel === 'import' ? null : 'import')} more={menuItems({ label: 'Add one', icon: Plus, onSelect: () => setPanel('add') })}>
                Paste all
              </NextButton>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          {CRITERIA.map((c) => (
            <span key={c.key} title={c.hint}>
              {c.label} <b className="font-medium text-fg">{c.weight}%</b>
            </span>
          ))}
          <span>· your scores override Claude's (shown as rings)</span>
          <span>· Analyze and Research use web search, so approve it when Claude asks (or allow WebSearch and WebFetch in /permissions)</span>
        </div>
        {panel === 'add' && <AddForm partners={state.config.partners.map((p) => p.name)} onDone={() => setPanel(null)} />}
        {panel === 'import' && <ImportForm onDone={() => setPanel(null)} />}
      </section>
      {ranked.length === 0 ? (
        <Empty text="No challenges yet. At the opening ceremony, use “Paste all” with the challenge page's text and Claude splits it into one file per challenge. Then “Analyze all” scores them for your team." />
      ) : (
        ranked.map((c, i) => <ChallengeCard key={c.id} c={c} rank={i + 1} />)
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-[13px] text-muted">{text}</div>
}

function AddForm({ partners, onDone }: { partners: string[]; onDone: () => void }) {
  const add = useEvent((s) => s.addChallenge)
  const [v, setV] = useState({ partner: '', title: '', link: '', description: '' })
  return (
    <div className="mt-3 grid gap-2 rounded-xl bg-surface-2/50 p-3 md:grid-cols-3">
      <input value={v.partner} onChange={(e) => setV({ ...v, partner: e.target.value })} placeholder="Partner" list="partner-names" className={field} />
      <datalist id="partner-names">
        {partners.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Challenge title" className={cn(field, 'md:col-span-2')} />
      <input value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })} placeholder="Link (optional)" className={cn(field, 'md:col-span-3')} />
      <textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={6} placeholder="Paste the challenge description" className={cn(field, 'resize-y md:col-span-3')} />
      <div className="flex gap-2 md:col-span-3">
        <button
          disabled={!v.title.trim() || !v.description.trim()}
          onClick={() => void add(v).then((ok) => ok && onDone())}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Save challenge
        </button>
        <button onClick={onDone} className="rounded-md px-3 py-1.5 text-[12px] text-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  )
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const askClaude = useEvent((s) => s.askClaude)
  const [text, setText] = useState('')
  return (
    <div className="mt-3 rounded-xl bg-surface-2/50 p-3">
      <p className="mb-2 text-[12px] text-muted">
        Paste the whole challenge page (or several). Claude splits it into one file per challenge in <code>challenges/</code>, keeping each description word
        for word.
      </p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste here…" className={cn(field, 'resize-y')} />
      <div className="mt-2 flex gap-2">
        <button
          disabled={!text.trim()}
          onClick={() => {
            void askClaude(importPrompt(text), 'Challenge import')
            onDone()
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Split into challenges with Claude
        </button>
        <button onClick={onDone} className="rounded-md px-3 py-1.5 text-[12px] text-muted hover:text-fg">
          Cancel
        </button>
      </div>
    </div>
  )
}

function ChallengeCard({ c, rank }: { c: Challenge; rank: number }) {
  const { updateChallenge, deleteChallenge, chooseChallenge, askClaude } = useEvent()
  const [open, setOpen] = useState(c.status === 'chosen')
  const score = scoreChallenge(c)
  const dropped = c.status === 'dropped'
  const actions = menuItems(
    { label: 'Analyze with Claude', icon: Bot, onSelect: () => void askClaude(analyzePrompt(c.id), `Analysis of “${c.title}”`) },
    { label: 'Research the partner', icon: Search, onSelect: () => void askClaude(researchPrompt(c), `Research on ${c.partner}`) },
    !!c.link && { label: 'Open the challenge page', icon: ExternalLink, onSelect: () => void window.harness.openExternal(c.link!) },
    'separator',
    ...CHALLENGE_STATUSES.filter((x) => x !== 'chosen').map((x) => ({ label: `Mark as ${STATUS_LABEL[x].toLowerCase()}`, checked: c.status === x, onSelect: () => void updateChallenge(c.id, { status: x }) })),
    'separator',
    { label: 'Delete', icon: Trash2, danger: true, onSelect: () => window.confirm(`Delete “${c.title}”? Its file in challenges/ is removed.`) && void deleteChallenge(c.id) },
  )
  return (
    <section className={cn('rounded-2xl border p-4', c.status === 'chosen' ? 'border-ok/50 bg-ok/[0.04]' : 'border-line', dropped && 'opacity-55')}>
      <div className="flex items-start gap-3">
        <div className="flex w-12 shrink-0 flex-col items-center">
          <span className="text-[11px] text-muted">#{rank}</span>
          <span className={cn('num text-[24px] font-semibold', rank === 1 ? 'text-accent-ink' : score.total < 45 && 'text-muted')}>{score.total}</span>
          {score.coverage < 1 && <span className="text-[11px] text-muted" title="Share of the criteria that have a score">{Math.round(score.coverage * 100)}% scored</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-[12px] font-medium">{c.partner}</span>
            <button onClick={() => setOpen(!open)} className="flex min-w-0 items-center gap-1 text-left text-[14px] font-semibold hover:text-accent-ink">
              {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
              <span className="truncate">{c.title}</span>
            </button>
            {c.prize && <span className="text-[11px] text-muted">🏆 {c.prize}</span>}
            {c.status !== 'candidate' && c.status !== 'chosen' && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{STATUS_LABEL[c.status]}</span>}
            <div className="ml-auto flex items-center gap-1">
              {c.status === 'chosen' ? (
                <span className="flex items-center gap-1 rounded-md bg-ok px-2 py-0.5 text-[12px] font-medium text-white">
                  <Star className="size-3 fill-current" /> Chosen
                </span>
              ) : (
                <NextButton
                  tone={rank === 1 ? 'primary' : 'secondary'}
                  icon={Star}
                  onClick={() =>
                    window.confirm(`Choose “${c.title}”? This writes it to challenge/brief/ for HackForge and names it in hackforge.yaml.`) && void chooseChallenge(c.id)
                  }
                  more={actions}
                >
                  Choose
                </NextButton>
              )}
              {c.status === 'chosen' && <Menu items={actions} />}
            </div>
          </div>
          {c.ai?.summary && <div className="mt-1 text-[13px]">{c.ai.summary}</div>}
          {c.ai?.idea && (
            <div className="mt-1 text-[13px]">
              <span className="text-muted">Idea: </span>
              {c.ai.idea}
            </div>
          )}
          <Scores c={c} onSet={(k, v) => void updateChallenge(c.id, { scores: { [k]: v } })} />
          {open && <Details c={c} />}
        </div>
      </div>
    </section>
  )
}

/** Five dots per criterion: filled = your score, ring = Claude's. Click the same dot again to clear yours. */
function Scores({ c, onSet }: { c: Challenge; onSet: (k: CriterionKey, v: number | null) => void }) {
  return (
    <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {CRITERIA.map((cr) => {
        const team = c.scores[cr.key]
        const ai = c.ai?.scores[cr.key]
        return (
          <div key={cr.key} className="flex items-center gap-2 text-[12px]" title={cr.hint}>
            <span className="w-28 shrink-0 truncate text-muted">{cr.label}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onSet(cr.key, team === n ? null : n)}
                  aria-label={`${cr.label}: ${n}`}
                  className={cn(
                    'size-3.5 rounded-full border',
                    team !== undefined && n <= team ? 'border-accent-ink bg-accent' : 'border-line hover:border-accent-ink/60',
                    ai === n && 'ring-2 ring-info/70 ring-offset-1 ring-offset-[var(--surface)]',
                  )}
                />
              ))}
            </div>
            {team === undefined && ai !== undefined && <span className="text-[11px] text-info-ink">Claude {ai}</span>}
          </div>
        )
      })}
    </div>
  )
}

function Details({ c }: { c: Challenge }) {
  const update = useEvent((s) => s.updateChallenge)
  const [notes, setNotes] = useState(c.notes)
  /** c.notes when typing began; while set, changes from disk don't replace what's being typed. */
  const base = useRef<string | null>(null)
  useEffect(() => {
    if (base.current === null) setNotes(c.notes)
  }, [c.notes])
  return (
    <div className="mt-3 space-y-3">
      {(c.ai?.partnerTech || (c.ai?.risks.length ?? 0) > 0) && (
        <div className="rounded-lg bg-surface-2/60 px-3 py-2 text-[12px]">
          {c.ai?.partnerTech && (
            <div>
              <span className="text-muted">Runs on: </span>
              {c.ai.partnerTech}
            </div>
          )}
          {(c.ai?.risks.length ?? 0) > 0 && (
            <div className="mt-1">
              <span className="text-muted">Risks: </span>
              {c.ai!.risks.join(' · ')}
            </div>
          )}
        </div>
      )}
      <div className="max-h-72 overflow-y-auto rounded-lg border border-line px-3 py-2">
        <Markdown text={c.description || '_No description._'} className="text-[13px]" />
      </div>
      <label className="block">
        <div className="mb-1 text-[12px] font-medium">Mentor notes (what the partner said, constraints, data/APIs they give)</div>
        <textarea
          value={notes}
          onFocus={() => (base.current = c.notes)}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            const from = base.current ?? c.notes
            base.current = null
            if (notes !== from) void update(c.id, { notes, notesBase: from })
            else setNotes(c.notes)
          }}
          rows={4}
          placeholder="- They care most about…"
          className={cn(field, 'resize-y')}
        />
      </label>
    </div>
  )
}

export function Notice() {
  const { notice, dismissNotice } = useEvent()
  if (!notice) return null
  return <NoticeBar text={notice.text} sessionId={notice.sessionId} onClose={dismissNotice} />
}

function NoticeBar({ text, sessionId, onClose }: { text: string; sessionId: string; onClose: () => void }) {
  const status = useApp((s) => s.sessions[sessionId]?.status)
  const waiting = status === 'waiting'
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]',
        waiting ? 'border-warn/60 bg-warn/[0.1]' : 'border-line bg-surface-2',
      )}
    >
      <Bot className={cn('size-4', waiting ? 'text-warn-ink' : 'text-accent-ink')} />
      <span>
        {waiting
          ? 'Claude is waiting for your approval to continue.'
          : status === 'running'
            ? `${text} Claude is working; results appear here as it writes the files.`
            : `${text} Results appear here as Claude writes the files.`}
      </span>
      <WatchButton sessionId={sessionId} />
      <button onClick={onClose} className="rounded p-1 text-muted hover:text-fg" title="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  )
}

function WatchButton({ sessionId }: { sessionId: string }) {
  const select = useApp((s) => s.select)
  const setView = useApp((s) => s.setView)
  return (
    <button
      onClick={() => {
        select(sessionId)
        setView('chat')
      }}
      className="ml-auto rounded-md border border-line bg-surface px-2 py-0.5 text-[12px] hover:bg-surface-2"
    >
      Watch in chat
    </button>
  )
}
