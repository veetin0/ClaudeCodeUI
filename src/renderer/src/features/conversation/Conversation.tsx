import { AgentDetail } from '../agents/AgentDetail'
import { Board } from '../agents/Board'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { ActionBar } from './ActionBar'
import { MessageList } from './MessageList'
import { PermissionCard } from './PermissionCard'
import { PromptBox } from './PromptBox'

export function Conversation({ session }: { session: SessionState }) {
  const view = useApp((s) => s.view)
  const detailAgent = useApp((s) => s.detailAgent)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {view === 'board' ? <Board session={session} /> : <MessageList session={session} />}
      {session.permissions.length > 0 && (
        <div className="mx-auto w-full max-w-3xl space-y-2 px-6 pb-3">
          {session.permissions.map((p, i) => (
            <PermissionCard key={p.requestId} req={p} primary={i === 0} />
          ))}
        </div>
      )}
      <ActionBar session={session} />
      <PromptBox session={session} />
      {detailAgent && <AgentDetail session={session} />}
    </div>
  )
}
