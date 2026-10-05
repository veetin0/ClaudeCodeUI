import type { SessionState } from '@/stores/reducer'
import { MessageList } from './MessageList'
import { PermissionCard } from './PermissionCard'
import { PromptBox } from './PromptBox'

export function Conversation({ session }: { session: SessionState }) {
  return (
    <>
      <MessageList session={session} />
      {session.permissions.length > 0 && (
        <div className="mx-auto w-full max-w-3xl space-y-2 px-6 pb-3">
          {session.permissions.map((p, i) => (
            <PermissionCard key={p.requestId} req={p} primary={i === 0} />
          ))}
        </div>
      )}
      <PromptBox session={session} />
    </>
  )
}
