import type { SessionState } from '@/stores/reducer'
import { AgentCard } from './AgentCard'
import { agentViews, isActive } from './model'

/** Compact live cards for every agent; click one for its detail view. */
export function AgentsPanel({ session }: { session: SessionState }) {
  const agents = agentViews(session)
  const [main, ...subs] = agents
  const ordered = [...subs.filter(isActive), ...subs.filter((a) => !isActive(a))]
  return (
    <div className="space-y-2">
      <AgentCard agent={main} compact />
      {ordered.length > 0 && (
        <div className="ml-2 space-y-2 border-l-2 border-line pl-2">
          {ordered.map((a) => (
            <AgentCard key={a.key} agent={a} compact />
          ))}
        </div>
      )}
      {subs.length === 0 && <p className="px-1 pt-2 text-[12px] text-muted">Subagents show up here as Claude spawns them.</p>}
    </div>
  )
}
