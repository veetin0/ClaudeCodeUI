import { Users } from 'lucide-react'
import { useApp } from '@/stores/app'
import { useEventState, useNow } from '@/stores/event'
import { useTeamState } from '@/stores/team'
import { Sheet } from '@/ui/Sheet'
import { JoinTeam, TeamPanel } from '../event/TeamPanel'

/**
 * The team board as a sheet, from the Hackathon header's Team button (or ⌘K): teammates' status and
 * plan usage, handoffs, the conflict radar, the crew and the join code.
 */
export function TeamSheet() {
  const close = () => useApp.getState().setTeamOpen(false)
  const team = useTeamState()
  const event = useEventState()
  const now = useNow(30_000)
  const timezone = event?.config.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  return (
    <Sheet title="Team board" icon={<Users className="size-4 text-accent-ink" />} onClose={close} wide>
      <div className="p-5">
        {team?.config ? (
          <TeamPanel timezone={timezone} now={now} bare />
        ) : (
          <div className="max-w-md space-y-4 text-[13px]">
            <p className="text-muted">
              You’re not in a team yet. Start one on{' '}
              <button
                onClick={() => {
                  close()
                  useApp.getState().openHackathon('build')
                }}
                className="font-medium text-accent-ink hover:underline"
              >
                Hackathon › Build
              </button>
              , or join a teammate’s team with the code from their board.
            </p>
            <JoinTeam defaultName={useApp.getState().settings?.team?.memberName ?? ''} />
          </div>
        )}
      </div>
    </Sheet>
  )
}
