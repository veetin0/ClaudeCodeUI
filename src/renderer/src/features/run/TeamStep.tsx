import { ArrowRight, Check, Copy, Crown, Server, Terminal, Users } from 'lucide-react'
import { useState } from 'react'
import { canTake, type CrewMemberView } from '@shared/crew'
import { headroom } from '@shared/team'
import { cn } from '@/lib/format'
import { useApp } from '@/stores/app'
import { useCrew } from '@/stores/crew'
import { useRunStore } from '@/stores/run'
import { useTeam, useTeamState } from '@/stores/team'
import { Card, Primary, Secondary, UsageBar, useBusy } from './parts'

/** Steps 1–3: start the team, teammates paste one command, see who's in and ready. */
export function TeamStep() {
  const team = useTeamState()
  const crew = useCrew()
  const settings = useApp((s) => s.settings)
  const act = useRunStore((s) => s.act)
  const [name, setName] = useState(settings?.team?.memberName ?? '')
  const starting = useBusy('start')
  const inTeam = !!team?.config
  const server = settings?.teamServer?.trim()

  if (!inTeam)
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="font-display text-[24px] font-semibold leading-tight">Start your team</h1>
        <p className="mt-1.5 text-muted">
          You drive: your Claude plans and integrates, and your teammates’ Claudes build in parallel on their own plans. They only paste one command in a
          terminal.
        </p>
        <Card className="mt-6">
          <label className="block text-[12px] font-medium">Your name (teammates see it)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && void act('start', () => window.harness.runStartTeam(name.trim()))}
            placeholder="e.g. Veeti"
            autoFocus
            className="selectable mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 outline-none focus:border-accent-ink"
          />
          <div className="mt-3 flex items-start gap-2 text-[12px] text-muted">
            <Server className="mt-0.5 size-3.5 shrink-0" />
            {server ? (
              <span>
                Team server: <span className="selectable font-mono">{server}</span>
                <span> (a free one sleeps when idle: the first start can take up to a minute)</span>
              </span>
            ) : (
              <span>
                Hosted on this laptop: teammates must be on the same network. For an event, deploy a team server once and add it in{' '}
                <button onClick={() => useApp.getState().setSettingsOpen(true, 'team')} className="underline hover:text-fg">
                  Settings › Team
                </button>
                .
              </span>
            )}
          </div>
          <Primary
            className="mt-4 w-full"
            busy={starting}
            disabled={!name.trim()}
            onClick={() => void act('start', () => window.harness.runStartTeam(name.trim()))}
          >
            {starting ? 'Starting the team…' : 'Start'}
          </Primary>
        </Card>
      </div>
    )

  const ready = crew.members.filter(canTake)
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="font-display text-[24px] font-semibold leading-tight">Get everyone in</h1>
      <p className="mt-1.5 text-muted">Each teammate pastes this in a terminal and leaves it open. That’s their whole setup.</p>
      <JoinCommand command={crew.joinCommand} />
      <p className="mt-2 text-[12px] text-muted">
        They need Node.js 20+ and Claude Code signed in (run <code>claude</code> once). No GitHub, no Harness: the code travels through the team server,
        encrypted with your team’s key.
      </p>

      <Card
        className="mt-6"
        icon={<Users className="size-4 text-accent-ink" />}
        title="Team"
        aside={<span className="text-[12px] text-muted">{crew.members.length ? `${ready.length} of ${crew.members.length} ready` : 'nobody yet'}</span>}
      >
        <div className="divide-y divide-line">
          <MemberRow
            name={team.config!.memberName}
            lead
            pct={headroom(team.myUsage, Date.now())}
            status="Ready"
            tone="good"
            detail="Plans, integrates, verifies"
          />
          {crew.members.map((m) => (
            <Crew key={m.id} m={m} />
          ))}
          {crew.members.length === 0 && (
            <div className="py-3 text-[12px] text-muted">Waiting for teammates… they appear here within seconds of pasting the command.</div>
          )}
        </div>
      </Card>

      <div className="mt-6 flex items-center gap-3">
        <Primary onClick={() => void useRunStore.getState().act('go', () => window.harness.runGoTo('setup'))}>
          {crew.members.length ? `Continue with ${crew.members.length + 1} people` : 'Continue on your own'}
          <ArrowRight className="size-4" />
        </Primary>
        <span className="text-[12px] text-muted">Teammates can still join later: Harness gives them work from the next milestone.</span>
        <Secondary
          className="ml-auto"
          onClick={() => window.confirm('Leave the team? Teammates’ terminals stop getting work.') && void useTeam.getState().leave()}
        >
          Leave team
        </Secondary>
      </div>
    </div>
  )
}

export function JoinCommand({ command }: { command?: string }) {
  const [copied, setCopied] = useState(false)
  if (!command) return null
  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-surface-2 p-2 pl-3">
      <Terminal className="size-4 shrink-0 text-muted" />
      <code className="selectable min-w-0 flex-1 truncate font-mono text-[13px]" title={command}>
        {command}
      </code>
      <Primary
        className="shrink-0 px-3 py-1.5 text-[13px]"
        onClick={() => {
          void navigator.clipboard.writeText(command)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </Primary>
    </div>
  )
}

function Crew({ m }: { m: CrewMemberView }) {
  const status = !m.online ? 'Offline' : m.problem ? 'Not ready' : !m.accepting ? 'Paused' : m.current ? 'Working' : 'Ready'
  const tone = !m.online || !m.accepting ? 'off' : m.problem ? 'warn' : 'good'
  return (
    <MemberRow
      name={m.name}
      pct={m.headroom}
      status={status}
      tone={tone}
      api={m.usage.source === 'api-key'}
      detail={
        m.problem ??
        (m.current
          ? `${m.current.title}${m.current.activity ? ` · ${m.current.activity}` : ''}`
          : m.waiting
            ? 'Gets the project when the run starts'
            : 'Waiting for work')
      }
    />
  )
}

function MemberRow(o: { name: string; lead?: boolean; pct: number; status: string; tone: 'good' | 'warn' | 'off'; detail?: string; api?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className={cn('size-2 shrink-0 rounded-[2px]', o.tone === 'good' ? 'bg-ok' : o.tone === 'warn' ? 'bg-warn' : 'bg-fg/25')} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{o.name}</span>
          {o.lead && (
            <span className="flex items-center gap-0.5 rounded bg-accent/12 px-1.5 text-[11px] font-medium text-accent-ink">
              <Crown className="size-3" /> you
            </span>
          )}
          <span className={cn('text-[12px]', o.tone === 'warn' ? 'text-warn-ink' : 'text-muted')}>{o.status}</span>
        </div>
        {o.detail && (
          <div className={cn('selectable truncate text-[12px]', o.tone === 'warn' ? 'text-warn-ink' : 'text-muted')}>{o.detail}</div>
        )}
      </div>
      <div className="w-28 shrink-0">
        <div className="mb-1 text-right text-[12px] num text-muted" title="Plan usage left (the lower of the 5-hour and weekly windows)">
          {o.api ? 'API key' : `${o.pct}% usage left`}
        </div>
        <UsageBar pct={o.api ? 100 : o.pct} />
      </div>
    </div>
  )
}
