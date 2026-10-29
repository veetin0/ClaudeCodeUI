import { History, SquareTerminal } from 'lucide-react'
import { ReplayBar } from '../replay/ReplayBar'
import { lazy, Suspense } from 'react'
import { PreviewView } from '../preview/PreviewView'
import { AgentDetail } from '../agents/AgentDetail'
import { AgentsView } from '../agents/AgentsView'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { ActionDock } from './ActionForm'
import { MessageList } from './MessageList'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { CheckpointBar } from '../hackforge/CheckpointBar'
import { PromptBox } from './PromptBox'
import { LimitBanner, QueuedMessages } from '../team/LimitBanner'

// Monaco is large; load it only when a diff is first opened.
const DiffView = lazy(() => import('../files/DiffView'))

export function Conversation({ session }: { session: SessionState }) {
  const view = useApp((s) => s.view)
  const detailAgent = useApp((s) => s.detailAgent)
  const diffPath = useApp((s) => s.diffPath)
  const replaying = useApp((s) => s.replay?.sessionId === session.id)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {view === 'agents' ? (
        <AgentsView session={session} />
      ) : view === 'preview' ? (
        <PreviewView session={session} />
      ) : (
        <MessageList session={session} />
      )}
      {replaying ? (
        <ReplayBar sessionId={session.id} />
      ) : (
        <>
      {session.permissions.length > 0 && (
        <div className="mx-auto w-full max-w-3xl space-y-2 px-6 pb-3">
          {session.permissions.map((p, i) =>
            p.toolName === 'AskUserQuestion' ? <QuestionCard key={p.requestId} req={p} /> : <PermissionCard key={p.requestId} req={p} primary={i === 0} />,
          )}
        </div>
      )}
      {session.observed && session.live ? (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 px-6 text-[12px] text-muted">
          <SquareTerminal className="size-3.5" />
          Watching a Claude Code session running in your terminal. Everything it does shows up here live.
        </div>
      ) : (
        !session.live && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 px-6 text-[12px] text-muted">
            <History className="size-3.5" />
            Saved session. Send a message or pick an action to resume where it left off; ⋯ replays it.
          </div>
        )
      )}
      {session.live && !session.observed && <CheckpointBar session={session} />}
      {!(session.observed && session.live) && (
        <>
          <LimitBanner session={session} />
          <QueuedMessages session={session} />
          <ActionDock session={session} />
        </>
      )}
      <PromptBox session={session} />
        </>
      )}
      {detailAgent && <AgentDetail session={session} />}
      {diffPath && (
        <Suspense fallback={<div className="absolute inset-0 z-30 bg-surface" />}>
          <DiffView session={session} />
        </Suspense>
      )}
    </div>
  )
}
