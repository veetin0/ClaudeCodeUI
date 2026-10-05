import type { SessionState } from '@/stores/reducer'
import { AgentGraph } from './AgentGraph'
import { Timeline } from './Timeline'

/** Mission control: the live agent graph above a swim-lane timeline of every tool call. */
export function MissionView({ session }: { session: SessionState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-[3] border-b border-line">
        <AgentGraph session={session} />
      </div>
      <div className="min-h-[160px] flex-[2]">
        <Timeline session={session} />
      </div>
    </div>
  )
}
