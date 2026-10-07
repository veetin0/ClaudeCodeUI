import { AlertTriangle, Check, Copy, GitBranch, LogOut, Radio, Server, Sparkles, Users, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatInZone } from '@shared/event'
import { isOnline, makeJoinCode, usageAdvice, type MemberStatus, type PlanUsage, type UsageWindow } from '@shared/team'
import { cn } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { StatusDot } from '@/layout/StatusDot'
import { useTeam, useTeamState } from '@/stores/team'

/**
 * The team board: every teammate's Harness reports what they're on, their sessions, plan usage and
 * HackForge state through a relay, so four laptops and four Claude plans read as one team.
 */
export function TeamPanel({ timezone, now, suggestedNames }: { timezone: string; now: number; suggestedNames: string[] }) {
  const state = useTeamState()
  if (!state) return null
  return state.config ? <Board timezone={timezone} now={now} /> : <Setup suggestedNames={suggestedNames} />
}

const time = (tz: string) => (ms: number) => formatInZone(ms, tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function Setup({ suggestedNames }: { suggestedNames: string[] }) {
  const { create, join, error, busy } = useTeam()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'host' | 'relay'>('host')
  const [url, setUrl] = useState('')
  const [code, setCode] = useState('')
  const names = suggestedNames.filter((n) => !/^Member \d+$/.test(n))
  const field = 'selectable w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--accent)]/60'
  return (
    <section className="rounded-2xl border border-dashed border-[var(--accent)]/50 p-4">
      <div className="mb-1 flex items-center gap-2">
        <Users className="size-4 text-[var(--accent)]" />
        <h2 className="text-[13px] font-semibold">Team board</h2>
      </div>
      <p className="mb-3 text-[12px] text-muted">
        See all four laptops in one place: who is working on what, their sessions, and how much of each Claude plan is left, so the next task goes to whoever has
        the most room. Everyone keeps using their own login.
      </p>
      <label className="mb-3 block max-w-xs">
        <div className="mb-1 text-[11.5px] font-medium">Your name</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={names[0] ?? 'e.g. Veeti'} list="team-names" className={field} />
        <datalist id="team-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-[12.5px] font-semibold">Create the team</div>
          {(['host', 'relay'] as const).map((m) => (
            <label key={m} className="mb-1.5 flex items-start gap-2 text-[12px]">
              <input type="radio" className="mt-0.5" checked={mode === m} onChange={() => setMode(m)} />
              <span>
                {m === 'host' ? (
                  <>
                    <b>Host on this computer.</b> <span className="text-muted">Teammates on the same network connect to it. Good for practice runs.</span>
                  </>
                ) : (
                  <>
                    <b>Use a relay server.</b> <span className="text-muted">Works across any network (best at the venue). See relay/README.md.</span>
                  </>
                )}
              </span>
            </label>
          ))}
          {mode === 'relay' && <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://our-relay.example.com" className={cn(field, 'mt-1')} />}
          <button
            disabled={busy || !name.trim() || (mode === 'relay' && !url.trim())}
            onClick={() => void create({ name, host: mode === 'host', relayUrl: url })}
            className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            Create team
          </button>
        </div>
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-[12.5px] font-semibold">Join with a code</div>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={3} placeholder="HT1.… (the team creator copies it from their board)" className={cn(field, 'resize-none font-mono text-[11px]')} />
          <button
            disabled={busy || !name.trim() || !code.trim()}
            onClick={() => void join(code, name)}
            className="mt-2 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            Join team
          </button>
        </div>
      </div>
      {error && <div className="selectable mt-3 text-[12px] text-red-500">{error}</div>}
    </section>
  )
}

function Board({ timezone, now }: { timezone: string; now: number }) {
  const state = useTeamState()!
  const { leave, error } = useTeam()
  const [copied, setCopied] = useState(false)
  const config = state.config!
  const online = state.members.filter((m) => isOnline(m, now))
  const advice = usageAdvice(state.members, now, time(timezone))
  const code = makeJoinCode(config.hosting && state.hostUrls?.[0] ? state.hostUrls[0] : config.relayUrl, config.token)
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Users className="size-4 text-[var(--accent)]" />
        <h2 className="text-[13px] font-semibold">Team</h2>
        <span className="text-[11px] text-muted">
          {online.length} / {state.members.length} online
        </span>
        <span className={cn('flex items-center gap-1 text-[11px]', state.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500')} title={state.error}>
          {state.connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
          {state.connected ? (config.hosting ? 'hosting the relay' : 'connected') : state.error ?? 'not connected'}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => {
              void navigator.clipboard.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            title={code}
            className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11.5px] hover:bg-surface-2"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy join code'}
          </button>
          <button
            onClick={() => window.confirm('Leave the team? You can join again with the code.') && void leave()}
            title="Leave the team"
            className="rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-fg dark:hover:bg-white/10"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </div>
      {config.hosting && (
        <div className="mb-3 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] text-muted">
          <Radio className="mt-0.5 size-3.5 shrink-0" />
          <span>
            This computer hosts the relay at {state.hostUrls?.join(', ') || 'no network address'}. Keep Harness open. If teammates can't connect (venue wifi often
            blocks this), switch everyone to a phone hotspot or a relay server.
          </span>
        </div>
      )}
      {error && <div className="selectable mb-2 text-[12px] text-red-500">{error}</div>}
      {(advice.best || advice.warnings.length > 0) && (
        <div className="mb-3 space-y-1">
          {advice.best && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/[0.08] px-3 py-1.5 text-[12px]">
              <Sparkles className="size-3.5 text-emerald-600" />
              <span>
                <b>{advice.best.name}</b> has the most usage left, so give them the next milestone.
              </span>
            </div>
          )}
          {advice.warnings.map((w) => (
            <div key={w.member.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]', w.severity === 'stop' ? 'bg-red-500/[0.08]' : 'bg-amber-500/[0.08]')}>
              <AlertTriangle className={cn('size-3.5', w.severity === 'stop' ? 'text-red-500' : 'text-amber-600')} />
              {w.text}
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {state.members.map((m) => (
          <MemberCard key={m.id} m={m} me={m.id === config.memberId} now={now} fmt={time(timezone)} />
        ))}
      </div>
    </section>
  )
}

function MemberCard({ m, me, now, fmt }: { m: MemberStatus; me: boolean; now: number; fmt: (ms: number) => string }) {
  const online = me || isOnline(m, now)
  return (
    <div className={cn('rounded-xl border p-3', me ? 'border-[var(--accent)]/40' : 'border-line', !online && 'opacity-55')}>
      <div className="flex items-center gap-2">
        <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-fg/30')} />
        <span className="font-semibold">{m.name}</span>
        {me && <span className="text-[11px] text-muted">(you)</span>}
        {!online && <span className="text-[11px] text-muted">last seen {relativeTime(m.updatedAt)}</span>}
        {m.branch && (
          <span className="ml-auto flex max-w-[45%] items-center gap-1 truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted" title={m.branch}>
            <GitBranch className="size-3 shrink-0" /> {m.branch}
          </span>
        )}
      </div>
      {me ? <FocusInput value={m.focus ?? ''} /> : <div className="mt-1 text-[12.5px]">{m.focus || <span className="text-muted">No focus set</span>}</div>}
      <Usage u={m.usage} now={now} fmt={fmt} />
      {m.hackforge && (m.hackforge.phase || m.hackforge.milestone) && (
        <div className="mt-1.5 truncate text-[11.5px] text-muted">
          HackForge: {[m.hackforge.phase, m.hackforge.milestone, m.hackforge.mockScore !== undefined && `score ${m.hackforge.mockScore.toFixed(1)}`, m.hackforge.loopActive && `loop #${m.hackforge.loopIteration}`]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      <div className="mt-2 space-y-1">
        {m.sessions.length === 0 ? (
          <div className="text-[11.5px] text-muted">No open sessions</div>
        ) : (
          m.sessions.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <StatusDot status={s.status} />
              <span className="min-w-0 flex-1 truncate" title={`${s.project} · ${s.title}`}>
                {s.title}
                {s.activity && <span className="text-muted"> · {s.activity}</span>}
              </span>
              {s.subagents > 0 && <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 text-[10px] leading-4 text-white">{s.subagents}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function FocusInput({ value }: { value: string }) {
  const update = useTeam((s) => s.update)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  const save = () => v !== value && void update({ focus: v })
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      placeholder="What are you working on? e.g. M2 backend"
      className="selectable mt-1 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[12.5px] outline-none hover:border-line focus:border-[var(--accent)]/60"
    />
  )
}

function Usage({ u, now, fmt }: { u: PlanUsage; now: number; fmt: (ms: number) => string }) {
  if (u.source === 'api-key') return <div className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted"><Server className="size-3" /> API key: billed per token, no plan limits</div>
  if (!u.fiveHour && !u.sevenDay && !u.status)
    return <div className="mt-1.5 text-[11.5px] text-muted">Plan usage shows up once a session has run on this laptop.</div>
  return (
    <div className="mt-1.5 space-y-1">
      {u.fiveHour && <Bar label="5 h" w={u.fiveHour} now={now} fmt={fmt} />}
      {u.sevenDay && <Bar label="Week" w={u.sevenDay} now={now} fmt={fmt} />}
      {u.status && u.status !== 'allowed' && (
        <div className={cn('text-[11px] font-medium', u.status === 'rejected' ? 'text-red-500' : 'text-amber-600')}>
          {u.status === 'rejected' ? 'Limit reached' : 'Approaching a limit'}
          {u.resetsAt && u.resetsAt > now && ` · resets ${fmt(u.resetsAt)}`}
        </div>
      )}
      {u.at && now - u.at > 15 * 60_000 && <div className="text-[10.5px] text-muted">reading from {relativeTime(u.at)}</div>}
    </div>
  )
}

function Bar({ label, w, now, fmt }: { label: string; w: UsageWindow; now: number; fmt: (ms: number) => string }) {
  const reset = w.resetsAt !== undefined && w.resetsAt <= now
  const pct = reset ? 0 : w.pct
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-9 text-muted">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums">{Math.round(pct)}%</span>
      <span className="w-24 whitespace-nowrap text-right text-muted">{reset ? 'reset' : w.resetsAt ? `resets ${fmt(w.resetsAt)}` : ''}</span>
    </div>
  )
}
