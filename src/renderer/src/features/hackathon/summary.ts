import { eventClock, formatSpan } from '@shared/event'
import { formatDuration, type RunStage } from '@shared/run'
import { useEventState, useNow } from '@/stores/event'
import { useRun } from '@/stores/run'

const STAGE_LABEL: Record<RunStage, string> = { team: 'Start the team', setup: 'Setup', plan: 'Planning', run: 'Running', done: 'Done' }

export interface HackathonSummary {
  name: string
  /** Where the team run is, in a few words. */
  status: string
  /** The next deadline (or the event's start), e.g. "Submission due in 3h 10m". */
  countdown?: string
  /** The same as a race clock: just the time, e.g. "3h 10m" (or "Judging"). */
  clock?: string
  /** What the clock counts to, e.g. "to submission". */
  clockLabel?: string
  /** Under an hour to a deadline. */
  urgent: boolean
  /** Decisions waiting for you. */
  inbox: number
  stage: RunStage
  /** A team run is set up and past the Team step, or the event is on. */
  active: boolean
}

/** The hackathon at a glance: the sidebar row, the Home card and the Hackathon header. */
export function useHackathonSummary(): HackathonSummary {
  const run = useRun()
  const event = useEventState()
  const now = useNow(30_000)
  const status =
    run.stage === 'run'
      ? run.pausedReason
        ? 'Paused'
        : run.current
          ? `Building ${run.current}`
          : 'Finishing'
      : run.stage === 'plan' && run.step === 'plan-ready'
        ? 'Plan ready'
        : STAGE_LABEL[run.stage]
  let countdown: string | undefined
  let clock: string | undefined
  let clockLabel: string | undefined
  let urgent = false
  let during = false
  if (event) {
    const ec = eventClock(event.config, now)
    during = ec.stage === 'during'
    if (ec.stage === 'before') {
      clock = formatSpan(ec.start - now)
      clockLabel = 'to the start'
      countdown = `Starts in ${clock}`
    } else if (ec.stage === 'during' && ec.nextDeadline) {
      const what = ec.nextDeadline.label.split(' ')[0]
      clock = formatSpan(ec.nextDeadline.t - now)
      clockLabel = `to ${what.toLowerCase()}`
      countdown = `${what} due in ${clock}`
      urgent = ec.nextDeadline.t - now < 3_600_000
    } else if (ec.stage === 'during') countdown = clock = 'Judging'
  }
  const deadline = run.project?.deadline ? Date.parse(run.project.deadline) : NaN
  if (!countdown && Number.isFinite(deadline)) {
    const left = deadline - now
    countdown = left > 0 ? `${formatDuration(left)} left` : 'Deadline passed'
    clock = left > 0 ? formatDuration(left) : 'Passed'
    clockLabel = left > 0 ? 'to the deadline' : 'deadline'
    urgent = left > 0 && left < 3_600_000
  }
  return {
    name: run.project?.name ?? event?.config.name ?? 'Hackathon',
    status,
    countdown,
    clock,
    clockLabel,
    urgent,
    inbox: run.inbox.length,
    stage: run.stage,
    active: run.stage !== 'team' || during,
  }
}
