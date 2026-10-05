import { LayoutGrid } from 'lucide-react'
import type { SessionState } from '@/stores/reducer'
import { AgentCard } from './AgentCard'
import { agentViews, isActive } from './model'

/** Every agent in the session as a live tile. Active agents first, then finished ones. */
export function Board({ session }: { session: SessionState }) {
  const agents = agentViews(session)
  const active = agents.filter(isActive)
  const rest = agents.filter((a) => !isActive(a))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 py-5">
        <div className="mb-4 flex items-baseline gap-3">
          <h2 className="text-[15px] font-semibold">Agents</h2>
          <span className="text-[12px] text-muted">
            {active.length} working · {agents.length - 1} subagent{agents.length === 2 ? '' : 's'} this session
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-3">
          {[...active, ...rest].map((a) => (
            <AgentCard key={a.key} agent={a} />
          ))}
        </div>
        {agents.length === 1 && (
          <div className="mt-8 flex flex-col items-center gap-2 text-center text-[12px] text-muted">
            <LayoutGrid className="size-5" />
            <p>When Claude runs subagents in parallel, each gets a live card here.</p>
            <p>Try the “Parallel review” action below the prompt.</p>
          </div>
        )}
      </div>
    </div>
  )
}
