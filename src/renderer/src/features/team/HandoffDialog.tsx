import { GitBranch, Handshake, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildHandoffNote, type HandoffPlan } from '@shared/handoff'
import { relTo } from '@shared/paths'
import { basename, cn } from '@/lib/format'
import { ipcErrorMessage } from '@/lib/time'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { useTeam, useTeamState } from '@/stores/team'

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** The note, written from what Harness recorded of the session (works after the limit is hit). */
export function noteFor(session: SessionState, opts: { from: string; limited: boolean; resetsAt?: number; branch?: string }): string {
  const items = session.items
  const lastText = [...items].reverse().find((i) => i.kind === 'text')
  const lastError = [...items].reverse().find((i) => i.kind === 'error')
  return buildHandoffNote({
    title: session.title,
    from: opts.from,
    project: basename(session.cwd),
    prompts: items.flatMap((i) => (i.kind === 'user' ? [i.text] : [])),
    todos: session.todos,
    changedFiles: session.changes.map((c) => relTo(c.path, session.cwd) ?? c.path),
    lastReply: lastText?.kind === 'text' ? lastText.text : undefined,
    lastError: lastError?.kind === 'error' ? lastError.message : undefined,
    reason: opts.limited ? 'limit' : 'manual',
    resetsAt: opts.resetsAt ? clock(opts.resetsAt) : undefined,
    branch: opts.branch,
  })
}

/** Hand a session to the team: a note plus (when possible) the folder pushed as a branch. */
export function HandoffDialog() {
  const sessionId = useApp((s) => s.handoffFor)
  const session = useApp((s) => (s.handoffFor ? s.sessions[s.handoffFor] : undefined))
  const close = () => useApp.getState().openHandoff(null)
  const team = useTeamState()
  const [plan, setPlan] = useState<(HandoffPlan & { member: string | null }) | null>(null)
  const [note, setNote] = useState('')
  const [push, setPush] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const u = team?.myUsage
  const limited = u?.status === 'rejected' && (!u.resetsAt || u.resetsAt > Date.now())

  useEffect(() => {
    if (!sessionId || !session) return
    setPlan(null)
    setError(null)
    setDone(null)
    void window.harness.handoffPlan(sessionId).then(
      (p) => {
        setPlan(p)
        setPush(!p.problem)
        setNote(noteFor(session, { from: p.member ?? 'a teammate', limited, resetsAt: u?.resetsAt, branch: p.problem ? undefined : p.branch }))
      },
      (err: unknown) => setError(ipcErrorMessage(err)),
    )
    // Only when the dialog opens for a session; edits to the note are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  if (!sessionId || !session) return null
  const inTeam = !!team?.config

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await window.harness.handoffOffer({ sessionId, title: session.title || 'Untitled session', note, reason: limited ? 'limit' : 'manual', push: push && !!plan?.remote })
      useTeam.setState({ state: r.state })
      setDone(
        r.pushError
          ? `Posted to the team board, but without the files: ${r.pushError}`
          : push && plan?.remote
            ? `Posted. Your work is on ${plan.branch}; a teammate can take it over from the Team board.`
            : 'Posted to the team board.',
      )
    } catch (err) {
      setError(ipcErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onClick={close}>
      <div className="flex max-h-[90vh] w-[620px] flex-col rounded-2xl border border-line bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Handshake className="size-4 text-accent-ink" />
          <h2 className="font-display text-[18px] font-semibold">Hand off to the team</h2>
          <button onClick={close} className="ml-auto rounded p-1 text-muted hover:bg-hover">
            <X className="size-4" />
          </button>
        </div>
        <p className="mb-3 text-[12px] text-muted">
          {limited ? `Your usage limit is reached${u?.resetsAt ? ` until ${clock(u.resetsAt)}` : ''}. ` : ''}A teammate with usage left takes this over from their Team board: they get
          this note and your files, and continue in their own Claude session.
        </p>
        {!inTeam ? (
          <div className="rounded-lg bg-warn/[0.08] px-3 py-2 text-[12px]">
            Handoffs go through the team board. Create or join the team first (Hackathon › Schedule → Team).
            <button onClick={() => (close(), useApp.getState().openHackathon('schedule'))} className="ml-2 font-medium text-accent-ink hover:underline">
              Open the team
            </button>
          </div>
        ) : done ? (
          <div className="rounded-lg bg-ok/[0.08] px-3 py-2 text-[12px]">{done}</div>
        ) : (
          <>
            <label className="mb-1 text-[12px] font-medium">Handoff note (edit anything)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={14}
              className="selectable min-h-0 flex-1 resize-none rounded-lg border border-line bg-surface-2 p-2.5 font-mono text-[11px] leading-relaxed outline-none focus:border-accent-ink/60"
              placeholder="Loading…"
            />
            <div className="mt-3 rounded-lg border border-line p-2.5 text-[12px]">
              {plan ? (
                <>
                  <label className={cn('flex items-start gap-2', plan.problem && 'opacity-60')}>
                    <input type="checkbox" className="mt-0.5" checked={push && !plan.problem} disabled={!!plan.problem} onChange={(e) => setPush(e.target.checked)} />
                    <span>
                      <span className="flex items-center gap-1 font-medium">
                        <GitBranch className="size-3.5" /> Push my folder as <code className="font-mono text-[11px]">{plan.branch}</code>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        A snapshot with everything not yet committed ({plan.dirty} changed file{plan.dirty === 1 ? '' : 's'}) goes to origin. Your own branch and files stay exactly as they are.
                      </span>
                    </span>
                  </label>
                  {plan.problem && <div className="mt-1.5 text-[11px] text-warn-ink">{plan.problem}</div>}
                </>
              ) : (
                <span className="text-muted">Checking the folder…</span>
              )}
            </div>
          </>
        )}
        {error && <div className="selectable mt-2 text-[12px] text-danger-ink">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className="rounded-md border border-line px-3 py-1.5 text-[12px] hover:bg-surface-2">
            {done ? 'Close' : 'Cancel'}
          </button>
          {inTeam && !done && (
            <button
              disabled={busy || !plan || !note.trim()}
              onClick={() => void submit()}
              className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
            >
              {busy ? 'Handing off…' : 'Hand off'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
