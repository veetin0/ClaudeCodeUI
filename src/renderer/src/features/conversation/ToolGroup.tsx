import { useState } from 'react'
import { HARNESS_TOOL_PREFIX, SUBAGENT_TOOLS } from '@shared/events'
import type { SessionState } from '@/stores/reducer'
import { ShowView } from '../viz/ShowView'
import { SubagentCard } from './SubagentCard'
import { ToolChip } from './ToolChip'
import { ToolDetail } from './ToolDetail'

/** A run of consecutive tool calls: compact chips, click one to expand it. Subagents get a card. */
export function ToolGroup({ ids, session }: { ids: string[]; session: SessionState }) {
  const [selected, setSelected] = useState<string | null>(null)
  const tools = ids.map((id) => session.tools[id]).filter(Boolean)
  const isShow = (name: string) => name === `${HARNESS_TOOL_PREFIX}show`
  const chips = tools.filter((t) => !SUBAGENT_TOOLS.has(t.name) && !isShow(t.name))
  const shows = tools
    .filter((t) => isShow(t.name))
    .map((t) => session.visuals.main?.shows.find((s) => s.id === t.id))
    .filter((s) => s !== undefined)
  const agents = tools.filter((t) => SUBAGENT_TOOLS.has(t.name))
  const selectedTool = selected ? session.tools[selected] : undefined

  return (
    <div className="space-y-2">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <ToolChip key={t.id} tool={t} selected={selected === t.id} onClick={() => setSelected(selected === t.id ? null : t.id)} />
          ))}
        </div>
      )}
      {selectedTool && <ToolDetail tool={selectedTool} />}
      {shows.map((s) => (
        <ShowView key={s.id} show={s} />
      ))}
      {agents.map((t) => {
        const sub = session.subagents[t.id]
        return sub ? <SubagentCard key={t.id} sub={sub} session={session} /> : null
      })}
    </div>
  )
}
