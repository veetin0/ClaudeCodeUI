import { Activity, LayoutGrid, Network } from 'lucide-react'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { Segmented } from '@/ui/Segmented'
import { MissionView } from '../mission/MissionView'
import { ActivityPanel } from './ActivityPanel'
import { Board } from './Board'

/** Every agent in one place: cards, the graph and timeline, or the stream of tool calls. */
export function AgentsView({ session }: { session: SessionState }) {
  const mode = useApp((s) => s.agentsMode)
  const setMode = useApp((s) => s.setAgentsMode)
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-center border-b border-line py-2">
        <Segmented
          label="Agents view"
          value={mode}
          onChange={setMode}
          options={[
            { id: 'cards', label: 'Cards', icon: LayoutGrid, title: 'Each agent as a card: what it is doing now' },
            { id: 'graph', label: 'Graph', icon: Network, title: 'Who spawned whom, and a timeline of every call' },
            { id: 'activity', label: 'Activity', icon: Activity, title: 'Every tool call as it streams in' },
          ]}
        />
      </div>
      {mode === 'graph' ? (
        <MissionView session={session} />
      ) : mode === 'activity' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-4">
            <ActivityPanel session={session} />
          </div>
        </div>
      ) : (
        <Board session={session} />
      )}
    </div>
  )
}
