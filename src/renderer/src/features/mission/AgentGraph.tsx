import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, Sparkles } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { cn, formatDuration, formatTokens } from '@/lib/format'
import { KIND_COLOR, toolKind } from '@/lib/tools'
import { useApp } from '@/stores/app'
import { agentKey, type SessionState } from '@/stores/reducer'
import { currentActivity, isActive, type AgentView, agentViews } from '../agents/model'
import { useElapsed } from '../meters/useElapsed'
import { ProgressBar } from '../viz/ProgressBar'
import { layoutTree } from './layout'

type AgentNodeData = { agent: AgentView }

const STATE_RING: Record<string, string> = {
  running: 'border-ok/70 shadow-[0_0_0_4px_rgb(16_185_129/0.12)]',
  waiting: 'border-warn/80 shadow-[0_0_0_4px_rgb(245_158_11/0.15)]',
  failed: 'border-danger/60',
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const a = data.agent
  const activity = currentActivity(a)
  const live = useElapsed(isActive(a) ? a.startedAt : undefined, 1000)
  const duration = a.endedAt && a.startedAt ? a.endedAt - a.startedAt : live
  const progress = Object.values(a.visuals.progress).sort((x, y) => y.updatedAt - x.updatedAt)[0]
  const Icon = a.id === null ? Sparkles : Bot
  const recent = a.tools.slice(-8)

  return (
    <div className={cn('w-[260px] rounded-xl border bg-surface p-3 text-[12px] shadow-sm', STATE_RING[a.state] ?? 'border-line')}>
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-muted" />
      <div className="flex items-center gap-2">
        <Icon className={cn('size-4 shrink-0', a.id === null ? 'text-accent-ink' : 'text-info-ink')} />
        <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
        {duration > 0 && <span className="shrink-0 text-[12px] num text-muted">{formatDuration(duration)}</span>}
      </div>
      <div className="mt-1.5 truncate text-muted">{a.visuals.status ?? activity.title}</div>
      {progress && (
        <div className="mt-2">
          <ProgressBar p={progress} compact />
        </div>
      )}
      <div className="mt-2 flex items-center gap-2 text-[12px] num text-muted">
        <span className="flex gap-[2px]">
          {recent.map((t) => (
            <span
              key={t.id}
              className={cn('h-2 w-1.5 rounded-sm')}
              style={{ background: t.status === 'error' ? 'var(--danger)' : KIND_COLOR[toolKind(t.name)] }}
            />
          ))}
        </span>
        <span className="ml-auto">{a.tools.length} calls</span>
        {a.totalTokens !== undefined && <span>{formatTokens(a.totalTokens)}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-1.5 !border-0 !bg-muted" />
    </div>
  )
}

const nodeTypes = { agent: AgentNode }

function Graph({ session }: { session: SessionState }) {
  const openAgent = useApp((s) => s.openAgent)
  const { fitView } = useReactFlow()
  const agents = agentViews(session)

  // Subagents hang off whichever agent made the Task/Agent call, so nested spawns nest.
  const parentOf = (a: AgentView) => (a.id === null ? null : agentKey(session.tools[a.id]?.agentId ?? null))
  const shape = agents.map((a) => `${a.key}<${parentOf(a)}`).join('|')
  const positions = useMemo(() => layoutTree(agents.map((a) => ({ key: a.key, parent: parentOf(a) }))), [shape])

  const nodes: Node<AgentNodeData>[] = agents.map((a) => {
    const p = positions.find((x) => x.key === a.key) ?? { x: 0, y: 0 }
    return { id: a.key, type: 'agent', position: { x: p.x, y: p.y }, data: { agent: a }, draggable: true }
  })
  const edges: Edge[] = agents
    .filter((a) => a.id !== null)
    .map((a) => ({
      id: `e-${a.key}`,
      source: parentOf(a)!,
      target: a.key,
      animated: a.state === 'running',
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { strokeWidth: 2, stroke: a.state === 'running' ? 'var(--series-5)' : 'var(--muted)', opacity: a.state === 'running' ? 1 : 0.5 },
    }))

  useEffect(() => {
    const t = setTimeout(() => void fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 }), 50)
    return () => clearTimeout(t)
  }, [shape, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={(_, n) => openAgent(n.id)}
      fitView
      minZoom={0.3}
      maxZoom={1.5}
      nodesConnectable={false}
      proOptions={{ hideAttribution: false }}
      colorMode="system"
    >
      <Background gap={20} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  )
}

/** Live tree of the main agent and every subagent it spawned. Click a node for details. */
export function AgentGraph({ session }: { session: SessionState }) {
  return (
    <ReactFlowProvider>
      <Graph session={session} />
    </ReactFlowProvider>
  )
}
