import { CalendarClock, FolderOpen, FolderPlus, Hammer, Link2Off, Lightbulb, MessageSquare, Presentation, Rocket } from 'lucide-react'
import { useApp, type HackathonTab } from '@/stores/app'
import { useEvent, useEventState, useNow } from '@/stores/event'
import { useTeamState } from '@/stores/team'
import { useRun } from '@/stores/run'
import { useHackforge } from '@/stores/hackforge'
import { cn } from '@/lib/format'
import { shortcut } from '@/lib/keys'
import { sessionIn } from '@/lib/projects'
import { Menu, menuItems } from '@/ui/Menu'
import { Segmented } from '@/ui/Segmented'
import { ChallengeBoard, Notice } from '../event/ChallengeBoard'
import { TeamPanel } from '../event/TeamPanel'
import { PartnerKits } from '../event/PartnerKits'
import { PitchStudio } from '../event/PitchStudio'
import { HackforgeView } from '../hackforge/HackforgeView'
import { TeamRun } from '../run/TeamRun'
import { useHackathonSummary } from './summary'

/**
 * The Hackathon place: the team run and team board, challenges, your API keys, the pitch and
 * the HackForge dashboard, all for one project (the team run's, which is the event project).
 */
export function HackathonView() {
  const tab = useApp((s) => s.hackathonTab)
  const event = useEventState()
  const error = useEvent((s) => s.error)
  if (tab === 'build') return <BuildTab />
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        {error && <div className="selectable rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-[12px] text-danger-ink">{error}</div>}
        <Notice />
        {!event ? (
          <div className="py-10 text-center text-[12px] text-muted">Loading the event…</div>
        ) : tab === 'challenges' ? (
          <>
            <ChallengeBoard state={event} />
            <PartnerKits />
          </>
        ) : (
          <PitchStudio event={event} />
        )}
      </div>
    </div>
  )
}

/**
 * The team run's steps; under them the team board once you're in a team, and from Run on the
 * HackForge dashboard for the project.
 */
function BuildTab() {
  const run = useRun()
  const event = useEventState()
  const team = useTeamState()
  const now = useNow(30_000)
  const dir = run.project?.dir ?? event?.projectDir
  const hf = useHackforge(dir)
  const timezone = event?.config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <TeamRun>
      {team?.config && (
        <div className="mx-auto max-w-5xl px-6 pb-6">
          <TeamPanel timezone={timezone} now={now} />
        </div>
      )}
      {dir && (run.stage === 'run' || run.stage === 'done' || hf?.initialized) && (
        <div className="mx-auto max-w-5xl px-6 pb-6">
          <div className="border-t border-line pt-5">
            <HackforgeView cwd={dir} />
          </div>
        </div>
      )}
    </TeamRun>
  )
}

const TABS: { id: HackathonTab; label: string; icon: typeof Hammer; title: string }[] = [
  { id: 'build', label: 'Build', icon: Hammer, title: 'Team → Setup → Plan → Run → Done, the team board and the HackForge score' },
  { id: 'challenges', label: 'Challenges', icon: Lightbulb, title: 'Pick a challenge; your API keys' },
  { id: 'pitch', label: 'Pitch', icon: Presentation, title: 'Script, narration, 3D clips and the video' },
]

/** The Hackathon's header (in the top bar): name, where it is and what's due, the three tabs, and ⋯. */
export function HackathonBar() {
  const h = useHackathonSummary()
  const run = useRun()
  const tab = useApp((s) => s.hackathonTab)
  const openHackathon = useApp((s) => s.openHackathon)
  const event = useEventState()
  const { linkExisting, setupProject, link } = useEvent()
  const dir = event?.projectDir ?? run.project?.dir
  const chosen = event?.challenges.some((c) => c.status === 'chosen')
  return (
    <>
      <div className="min-w-0 max-w-[260px]">
        <div className="flex items-center gap-1.5 truncate text-[13px] font-semibold">
          <Rocket className="size-3.5 shrink-0 text-accent-ink" aria-hidden />
          <span className="truncate">{h.name}</span>
        </div>
        <div className="truncate text-[12px] text-muted">
          {h.status}
          {h.countdown && <span className={cn('num font-semibold', h.urgent ? 'text-danger-ink' : 'text-fg/80')}> · {h.countdown}</span>}
        </div>
      </div>
      <Segmented
        className="ml-2"
        label="Hackathon"
        value={tab}
        onChange={openHackathon}
        options={TABS.map((t) => ({
          ...t,
          title: t.id === 'build' ? shortcut(`${t.title} (⌘4)`) : t.title,
          badge: t.id === 'build' ? h.inbox || undefined : undefined,
          dot: t.id === 'challenges' && chosen ? ('ready' as const) : undefined,
        }))}
      />
      <div className="ml-auto flex min-w-0 items-center gap-2">
        {run.next && !sameText(run.next, h.status) && <span className="hidden min-w-0 truncate text-muted xl:inline">{run.next}</span>}
        <Menu
          items={menuItems(
            dir && { label: 'Open the project in a session', icon: MessageSquare, hint: dir, onSelect: () => void sessionIn(dir) },
            { label: 'Use a different project…', icon: FolderOpen, onSelect: () => void linkExisting() },
            { label: 'Set up a new event project…', icon: FolderPlus, onSelect: () => void setupProject() },
            dir && event?.source === 'project' && { label: 'Show challenge/event.yaml', icon: CalendarClock, onSelect: () => void window.harness.revealFile(`${dir}/challenge/event.yaml`) },
            dir && 'separator',
            dir && { label: 'Unlink the project', icon: Link2Off, hint: 'Nothing is deleted', danger: true, onSelect: () => void link(null) },
          )}
        />
      </div>
    </>
  )
}

const sameText = (a: string, b: string) => a.replace(/[.\s]+$/, '').toLowerCase() === b.replace(/[.\s]+$/, '').toLowerCase()
