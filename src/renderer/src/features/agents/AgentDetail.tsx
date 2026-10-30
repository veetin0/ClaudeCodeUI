import { relTo } from '@shared/paths'
import { Bot, FileText, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn, formatDuration, formatTokens } from '@/lib/format'
import { useApp } from '@/stores/app'
import type { SessionState, ToolCall } from '@/stores/reducer'
import { Markdown } from '../conversation/Markdown'
import { ToolChip } from '../conversation/ToolChip'
import { ToolDetail } from '../conversation/ToolDetail'
import { useElapsed } from '../meters/useElapsed'
import { LineChart } from '../viz/LineChart'
import { ProgressBar } from '../viz/ProgressBar'
import { ShowView } from '../viz/ShowView'
import { ActivityStrip } from './ActivityStrip'
import { agentViews, currentActivity, filesTouched, isActive } from './model'
import { NowWidget } from './NowWidget'

/** Everything one agent did: live now-panel, progress, charts, results, files and full timeline. */
export function AgentDetail({ session }: { session: SessionState }) {
  const { detailAgent, detailTool, closeAgent } = useApp()
  const agent = agentViews(session).find((a) => a.key === detailAgent)
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const live = useElapsed(agent && isActive(agent) ? agent.startedAt : undefined, 1000)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAgent()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeAgent])
  useEffect(() => setSelectedTool(detailTool), [detailAgent, detailTool])

  if (!agent) return null
  const activity = currentActivity(agent)
  const progress = Object.values(agent.visuals.progress)
  const metrics = Object.entries(agent.visuals.metrics).filter(([, m]) => m.points.length > 0)
  const files = filesTouched(agent)
  const duration = agent.endedAt && agent.startedAt ? agent.endedAt - agent.startedAt : live
  const tool = selectedTool ? session.tools[selectedTool] : undefined

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/20 backdrop-blur-[1px]" onClick={closeAgent}>
      <div
        className="flex h-full w-full max-w-[760px] flex-col border-l border-line bg-surface shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-3">
          {agent.id === null ? <Sparkles className="size-5 text-accent-ink" /> : <Bot className="size-5 text-info-ink" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[18px] font-semibold">{agent.name}</div>
            <div className="truncate text-[12px] text-muted">
              {agent.role} · {agent.tools.length} tool calls
              {agent.totalTokens !== undefined && ` · ${formatTokens(agent.totalTokens)} tokens`}
              {duration > 0 && ` · ${formatDuration(duration)}`}
            </div>
          </div>
          <button onClick={closeAgent} className="rounded p-1 text-muted hover:bg-hover" title="Close (Esc)">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <Section title="Now">
            <div className="mb-2 text-[13px] font-medium">{agent.visuals.status ?? activity.title}</div>
            <NowWidget agent={agent} activity={activity} lines={14} />
          </Section>

          {progress.length > 0 && (
            <Section title="Progress">
              <div className="space-y-3">
                {progress.map((p) => (
                  <ProgressBar key={p.label} p={p} />
                ))}
              </div>
            </Section>
          )}

          {metrics.length > 0 && (
            <Section title="Metrics">
              {/* Small multiples: one chart per metric so each keeps its own scale. */}
              <div className="grid grid-cols-2 gap-3">
                {metrics.map(([name, m]) => (
                  <div key={name} className="rounded-lg border border-line p-2.5">
                    <div className="mb-1 text-[12px] font-medium">{name}</div>
                    <LineChart series={[{ name, points: m.points.map((p) => [p.step, p.value]) }]} height={150} xLabel="step" />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {agent.visuals.shows.length > 0 && (
            <Section title="Results">
              <div className="space-y-3">
                {[...agent.visuals.shows].reverse().map((s) => (
                  <ShowView key={s.id} show={s} />
                ))}
              </div>
            </Section>
          )}

          {files.length > 0 && (
            <Section title={`Files (${files.length})`}>
              <div className="overflow-hidden rounded-lg border border-line">
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setSelectedTool(selectedTool === f.last.id ? null : f.last.id)}
                    className={cn(
                      'flex w-full items-center gap-2 border-b border-line px-3 py-1.5 text-left last:border-0 hover:bg-surface-2',
                      selectedTool === f.last.id && 'bg-surface-2',
                    )}
                  >
                    <FileText className={cn('size-3.5 shrink-0', f.writes ? 'text-forge' : 'text-info-ink')} />
                    <span className="truncate font-mono text-[12px]" title={f.path}>
                      {relTo(f.path, session.cwd) ?? f.path}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">
                      {f.writes > 0 && `${f.writes} write${f.writes > 1 ? 's' : ''}`}
                      {f.writes > 0 && f.reads > 0 && ' · '}
                      {f.reads > 0 && `${f.reads} read${f.reads > 1 ? 's' : ''}`}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section title={`Timeline (${agent.tools.length})`}>
            <div className="mb-2">
              <ActivityStrip tools={agent.tools} max={80} />
            </div>
            <Timeline tools={agent.tools} selected={selectedTool} onSelect={setSelectedTool} />
          </Section>

          {tool && (
            <div className="sticky bottom-0 -mx-1 rounded-xl bg-surface p-1 shadow-[0_-8px_16px_var(--surface)]">
              <ToolDetail tool={tool} />
            </div>
          )}

          {agent.text && (
            <Section title={agent.id === null ? 'Latest message' : 'Report'}>
              <Markdown text={agent.text} />
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  )
}

function Timeline({ tools, selected, onSelect }: { tools: ToolCall[]; selected: string | null; onSelect: (id: string | null) => void }) {
  if (tools.length === 0) return <p className="text-[12px] text-muted">No tool calls yet.</p>
  const t0 = tools[0].startedAt
  return (
    <ol className="space-y-1">
      {tools.map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-right text-[12px] num text-muted">+{formatDuration(t.startedAt - t0)}</span>
          <ToolChip tool={t} selected={selected === t.id} onClick={() => onSelect(selected === t.id ? null : t.id)} />
        </li>
      ))}
    </ol>
  )
}
