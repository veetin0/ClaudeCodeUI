import { History, Play, SquareTerminal } from 'lucide-react'
import { ReplayBar } from '../replay/ReplayBar'
import { lazy, Suspense } from 'react'
import { MissionView } from '../mission/MissionView'
import { PreviewView } from '../preview/PreviewView'
import { AgentDetail } from '../agents/AgentDetail'
import { Board } from '../agents/Board'
import { useApp } from '@/stores/app'
import type { SessionState } from '@/stores/reducer'
import { ActionBar } from './ActionBar'
import { MessageList } from './MessageList'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { CheckpointBar } from '../hackforge/CheckpointBar'
import { HackforgeView } from '../hackforge/HackforgeView'
import { PromptBox } from './PromptBox'
import { LimitBanner, QueuedMessages } from '../team/LimitBanner'

// Monaco is large; load it only when a diff is first opened.
const DiffView = lazy(() => import('../files/DiffView'))

export function Conversation({ session }: { session: SessionState }) {
  const view = useApp((s) => s.view)
  const detailAgent = useApp((s) => s.detailAgent)
  const diffPath = useApp((s) => s.diffPath)
  const replaying = useApp((s) => s.replay?.sessionId === session.id)
  const startReplay = useApp((s) => s.startReplay)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {view === 'board' ? (
        <Board session={session} />
      ) : view === 'mission' ? (
        <MissionView session={session} />
      ) : view === 'preview' ? (
        <PreviewView session={session} />
      ) : view === 'hackforge' ? (
        <HackforgeView session={session} />
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
            Saved session. Send a message or pick an action to resume where it left off.
            <button onClick={() => startReplay(session.id)} className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[var(--accent)] hover:bg-[var(--accent)]/10">
              <Play className="size-3 fill-current" /> Replay
            </button>
          </div>
        )
      )}
      {session.live && !session.observed && <CheckpointBar session={session} />}
      {!(session.observed && session.live) && (
        <>
          <LimitBanner session={session} />
          <QueuedMessages session={session} />
          <ActionBar session={session} />
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
