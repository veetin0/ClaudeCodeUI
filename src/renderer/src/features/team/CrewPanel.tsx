import { AlertTriangle, Bot, Check, ChevronDown, ChevronRight, Copy, GitBranch, MessageSquare, ShieldQuestion, Square, Terminal } from 'lucide-react'
import { useState } from 'react'
import { isFinal, type CrewAskView, type CrewMemberView, type MissionView } from '@shared/crew'
import { cn } from '@/lib/format'
import { relativeTime } from '@/lib/time'
import { useApp } from '@/stores/app'
import { useCrew } from '@/stores/crew'
import { SectorMeter } from '@/ui/Sectors'

const STATE_STYLE: Record<MissionView['state'], string> = {
  queued: 'bg-fg/10 text-muted',
  working: 'bg-info/15 text-info-ink',
  done: 'bg-ok/15 text-ok-ink',
  blocked: 'bg-warn/15 text-warn-ink',
  limited: 'bg-warn/15 text-warn-ink',
  failed: 'bg-danger/15 text-danger-ink',
  stopped: 'bg-fg/10 text-muted',
}
const STATE_LABEL: Record<MissionView['state'], string> = {
  queued: 'Queued',
  working: 'Working',
  done: 'Done',
  blocked: 'Blocked',
  limited: 'Out of usage',
  failed: 'Failed',
  stopped: 'Stopped',
}

/**
 * Crew mode on the Team board: teammates lend their Claude (harness-crew in a terminal), your Claude
 * hands them missions, and this shows who is doing what, their usage, questions waiting for you
 * and the messages the Claudes send each other.
 */
export function CrewPanel({ joinCode, now }: { joinCode: string; now: number }) {
  const crew = useCrew()
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  if (!crew.available) return null
  // -y: no "Ok to proceed?" question on the first run.
  const command = `npx -y harness-crew ${joinCode}`
  const active = crew.missions.filter((m) => !isFinal(m.state))
  return (
    <div className="mb-3 rounded-xl border border-line p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Bot className="size-4 text-accent-ink" />
        <span className="text-[13px] font-semibold">Crew</span>
        <span className="text-[11px] text-muted">
          {crew.members.length
            ? `${crew.members.filter((m) => m.online && m.accepting && !m.problem).length} of ${crew.members.length} ready`
            : 'teammates’ Claudes, working on missions from yours'}
          {active.length > 0 && ` · ${active.length} mission${active.length === 1 ? '' : 's'} running`}
        </span>
        <label
          className="ml-auto flex items-center gap-1.5 text-[11px] text-muted"
          title="When a crew Claude finishes or messages you, the session that sent the mission gets it as a message, so your Claude carries on by itself."
        >
          <input type="checkbox" checked={settings?.crewAutoReports ?? true} onChange={(e) => void updateSettings({ crewAutoReports: e.target.checked })} />
          Reports go straight to your Claude
        </label>
      </div>
      <ProjectLine crew={crew} />
      {crew.asks.map((a) => (
        <Ask key={a.id} a={a} />
      ))}
      {crew.members.length === 0 ? (
        <Invite command={command} />
      ) : (
        <>
          <div className="grid gap-2 md:grid-cols-2">
            {crew.members.map((m) => (
              <Member key={m.id} m={m} now={now} />
            ))}
          </div>
          <details className="mt-2 text-[12px] text-muted">
            <summary className="cursor-pointer">Add another teammate</summary>
            <Invite command={command} compact />
          </details>
        </>
      )}
      {crew.missions.length > 0 && <Missions missions={crew.missions} now={now} />}
      {crew.messages.length > 0 && <Messages crew={crew} />}
    </div>
  )
}

/** What crew members will work on, or what's stopping that. */
function ProjectLine({ crew }: { crew: ReturnType<typeof useCrew> }) {
  const note = crew.projectNote
  return (
    <div className="mb-2 space-y-1 text-[12px]">
      {crew.project && (
        <div className="flex items-center gap-1.5 text-muted">
          <Check className="size-3.5 text-ok-ink" />
          <span className="selectable truncate">
            Project for the crew: <span className="font-mono">{crew.project.name}</span> · {crew.project.base} at{' '}
            <span className="font-mono">{crew.project.head.slice(0, 7)}</span> (shared through the team server)
          </span>
        </div>
      )}
      {note && (
        <div className={cn('selectable flex items-start gap-1.5', note.tone === 'warn' ? 'text-warn-ink' : 'text-muted')}>
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{note.text}</span>
        </div>
      )}
    </div>
  )
}

function Invite({ command, compact }: { command: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className={cn('rounded-lg bg-surface-2 p-3 text-[12px]', compact && 'mt-1.5')}>
      {!compact && (
        <p className="mb-2">
          Teammates don’t need Harness. They run this once in a terminal and leave it open; your Claude then hands their Claude missions (when you run{' '}
          <code>/hackforge:run</code>, or ask it to split the work), picking whoever has the most usage left.
        </p>
      )}
      <div className="flex items-center gap-2">
        <code className="selectable min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 font-mono text-[11px]" title={command}>
          <Terminal className="mr-1 inline size-3" />
          {command}
        </code>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(command)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[12px] hover:bg-surface"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        They need Node 20 or newer, git, and to sign in to Claude when it asks. No GitHub access: the project and their work travel through the team server,
        encrypted with your team’s key. Missions run on their own Claude plan, on their own branch.
      </p>
    </div>
  )
}

function Member({ m, now }: { m: CrewMemberView; now: number }) {
  const status = !m.online
    ? 'Offline'
    : m.problem
      ? 'Not ready'
      : m.waiting
        ? 'Waiting for your project'
        : !m.accepting
          ? 'Paused'
          : m.current
            ? 'Working'
            : 'Ready'
  const tone = !m.online || m.waiting || !m.accepting ? 'bg-fg/30' : m.problem ? 'bg-warn' : m.current ? 'bg-info' : 'bg-ok'
  return (
    <div className={cn('rounded-lg border border-line p-2.5 text-[12px]', !m.online && 'opacity-55')}>
      <div className="flex items-center gap-2">
        <span className={cn('size-2 rounded-[2px]', tone)} />
        <span className="font-semibold">{m.name}</span>
        <span className="text-[11px] text-muted">
          {status} · {m.app === 'cli' ? 'terminal' : 'Harness'}
        </span>
        <span className="num ml-auto text-[12px] font-semibold" title="Plan usage left (the lower of the 5-hour and weekly windows)">
          {m.usage.source === 'api-key' ? 'API key' : `${m.headroom}% left`}
        </span>
      </div>
      <SectorMeter value={m.headroom / 100} tone={m.headroom <= 10 ? 'fail' : m.headroom <= 30 ? 'wait' : 'done'} height={3} className="mt-1.5" label="Plan usage left" />
      {m.problem && <div className="selectable mt-1.5 text-[12px] text-warn-ink">{m.problem}</div>}
      {m.waiting && m.online && (
        <div className="mt-1.5 text-[12px] text-muted">
          They get a copy of your project through the team server once the event project is linked (and committed) or your Claude checks the crew.
        </div>
      )}
      {m.current && (
        <div className="mt-1.5 truncate" title={m.current.title}>
          {m.current.title}
          <span className="text-muted">
            {m.current.activity && ` · ${m.current.activity}`}
            {m.current.since && ` · ${Math.max(1, Math.round((now - m.current.since) / 60_000))} min`}
          </span>
        </div>
      )}
      {m.queued > 0 && <div className="mt-0.5 text-[11px] text-muted">{m.queued} more queued</div>}
    </div>
  )
}

function Ask({ a }: { a: CrewAskView }) {
  const [sent, setSent] = useState(false)
  const answer = (allow: boolean, always?: boolean) => {
    setSent(true)
    void window.harness.crewAnswer(a.id, allow, always)
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-[12px]">
      <ShieldQuestion className="size-4 shrink-0 text-warn-ink" />
      <span className="min-w-0 flex-1">
        <b>{a.fromName}’s Claude</b> wants to run <code className="selectable break-all">{a.summary}</code>
        {a.missionTitle && <span className="text-muted"> · {a.missionTitle}</span>}
      </span>
      <div className="flex shrink-0 gap-1.5">
        <button
          disabled={sent}
          onClick={() => answer(true)}
          className="rounded-md bg-accent px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40"
        >
          Allow
        </button>
        <button
          disabled={sent}
          onClick={() => answer(true, true)}
          className="rounded-md border border-line px-2.5 py-1 text-[12px] disabled:opacity-40"
          title="Allow this kind of call for the rest of the mission"
        >
          Always
        </button>
        <button disabled={sent} onClick={() => answer(false)} className="rounded-md border border-line px-2.5 py-1 text-[12px] disabled:opacity-40">
          Deny
        </button>
      </div>
    </div>
  )
}

function Missions({ missions, now }: { missions: MissionView[]; now: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? missions : missions.slice(0, 6)
  return (
    <div className="mt-3">
      <div className="mb-1 text-[12px] font-medium text-muted">Missions</div>
      <div className="divide-y divide-line rounded-lg border border-line">
        {shown.map((m) => (
          <MissionRow key={m.id} m={m} now={now} />
        ))}
      </div>
      {missions.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-1 text-[11px] text-muted hover:text-fg">
          {all ? 'Show fewer' : `Show all ${missions.length}`}
        </button>
      )}
    </div>
  )
}

function MissionRow({ m, now }: { m: MissionView; now: number }) {
  const [open, setOpen] = useState(false)
  const p = m.progress
  const line = !isFinal(m.state) ? p?.activity : p?.summary?.split('\n')[0]
  return (
    <div className="px-2.5 py-1.5 text-[12px]">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(!open)} className="text-muted">
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', STATE_STYLE[m.state])}>{STATE_LABEL[m.state]}</span>
        <span className="min-w-0 flex-1 truncate">
          <b className="font-medium">{m.title}</b>
          <span className="text-muted">
            {' '}
            → {m.toName}
            {m.movedTo && ` → ${m.movedTo}`}
            {line && ` · ${line}`}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted">{relativeTime(p?.endedAt ?? p?.startedAt ?? m.createdAt, now)}</span>
        {!isFinal(m.state) && (
          <button
            onClick={() => window.confirm(`Stop “${m.title}”? ${m.toName}’s Claude pushes what it has so far.`) && void window.harness.crewCancel(m.id)}
            title="Stop this mission"
            className="rounded p-1 text-muted hover:bg-hover hover:text-fg"
          >
            <Square className="size-3" />
          </button>
        )}
      </div>
      {open && (
        <div className="selectable mt-1.5 space-y-1.5 pl-6 text-[12px]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
            <span>{m.id}</span>
            <span className="flex items-center gap-1 font-mono">
              <GitBranch className="size-3" />
              {p?.branch ?? m.branch}
            </span>
            {p?.commits !== undefined && <span>{p.commits} commits</span>}
            {p?.files?.length ? <span>{p.files.length} files</span> : null}
            {p?.costUsd ? <span>${p.costUsd.toFixed(2)} equivalent</span> : null}
            {m.model && <span>{m.model}</span>}
          </div>
          {p?.sendError && <div className="text-danger-ink">Didn’t arrive: {p.sendError}</div>}
          {p?.summary && <div className="whitespace-pre-wrap">{p.summary}</div>}
          {p?.files?.length ? <div className="font-mono text-[11px] text-muted">{p.files.slice(0, 30).join('  ')}</div> : null}
          <details>
            <summary className="cursor-pointer text-muted">Brief</summary>
            <div className="mt-1 whitespace-pre-wrap text-muted">{m.brief}</div>
          </details>
        </div>
      )}
    </div>
  )
}

function Messages({ crew }: { crew: ReturnType<typeof useCrew> }) {
  const names = new Map(crew.members.map((m) => [m.id, m.name]))
  return (
    <details className="mt-3 text-[12px]">
      <summary className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-muted">
        <MessageSquare className="size-3.5" /> Messages between the Claudes ({crew.messages.length})
      </summary>
      <div className="selectable mt-1.5 max-h-64 space-y-1.5 overflow-y-auto">
        {[...crew.messages].reverse().map((m) => (
          <div key={m.id}>
            <span className="font-medium">{m.fromName}</span>
            <span className="text-muted"> → {m.to === '*' ? 'everyone' : (names.get(m.to) ?? 'you')}</span>
            <span className="text-[11px] text-muted"> · {relativeTime(m.at)}</span>
            <div className="whitespace-pre-wrap text-[12px]">{m.text}</div>
          </div>
        ))}
      </div>
    </details>
  )
}
