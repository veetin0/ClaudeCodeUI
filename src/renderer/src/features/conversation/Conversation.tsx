import { History } from 'lucide-react'
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
      {!session.live && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 px-6 text-[12px] text-muted">
          <History className="size-3.5" />
          Saved session. Send a message or pick an action to resume where it left off.
        </div>
      )}
      <ActionBar session={session} />
      <PromptBox session={session} />
      {detailAgent && <AgentDetail session={session} />}
    </div>
  )
}
