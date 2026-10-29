import { Brain, Globe, Hourglass, Search, ShieldQuestion } from 'lucide-react'
import { cn, formatDuration } from '@/lib/format'
import { useElapsed } from '../meters/useElapsed'
import type { Activity, AgentView } from './model'

/**
 * The live "what is it doing" panel on an agent card: the file being written streams in,
 * a running command shows its line and timer, searches show the query, etc.
 */
export function NowWidget({ agent, activity, lines = 6 }: { agent: AgentView; activity: Activity; lines?: number }) {
  const t = activity.tool
  const elapsed = useElapsed(t?.status === 'running' ? t.startedAt : undefined, 500)
  const str = (k: string) => (t && typeof t.input[k] === 'string' ? (t.input[k] as string) : '')

  switch (activity.kind) {
    case 'writing':
      return <CodeTail text={str('content')} lines={lines} />
    case 'editing':
      return <CodeTail text={str('new_string') || JSON.stringify(t?.input.edits ?? '', null, 1)} lines={lines} tone="edit" />
    case 'running':
      return (
        <div className="rail rounded-md px-2.5 py-2 font-mono text-[12px] leading-relaxed">
          <div className="flex gap-2">
            <span className="text-ok-ink">$</span>
            <span className="line-clamp-3 break-all">{str('command') || t?.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-muted">
            <span className="size-1.5 animate-soft-pulse rounded-[1px] bg-ok" />
            running <span className="num text-[13px] text-fg">{formatDuration(elapsed)}</span>
          </div>
        </div>
      )
    case 'searching':
    case 'browsing': {
      const Icon = activity.kind === 'searching' ? Search : Globe
      return (
        <Line icon={<Icon className="size-3.5 animate-soft-pulse" />}>
          <span className="truncate font-mono">{str('pattern') || str('query') || str('url')}</span>
        </Line>
      )
    }
    case 'waiting':
      return <Line icon={<ShieldQuestion className="size-3.5 text-warn-ink" />}>Needs approval to continue</Line>
    case 'thinking':
      return agent.text ? (
        <TextTail text={agent.text} lines={Math.min(lines, 4)} live />
      ) : (
        <Line icon={<Brain className="size-3.5 animate-soft-pulse text-accent-ink" />}>Thinking…</Line>
      )
    case 'reading':
    case 'delegating':
    case 'planning':
      return <Line icon={<Hourglass className="size-3.5 animate-soft-pulse" />}>{activity.title}</Line>
    default:
      return agent.text ? <TextTail text={agent.text} lines={Math.min(lines, 3)} /> : null
  }
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex min-w-0 items-center gap-2 text-[12px] text-muted">{icon}{children}</div>
}

/** Last N lines of a file being written, with a blinking caret: watching it type. */
function CodeTail({ text, lines, tone }: { text: string; lines: number; tone?: 'edit' }) {
  const all = text.split('\n')
  const tail = all.slice(-lines)
  const start = all.length - tail.length + 1
  return (
    <pre
      className={cn(
        'overflow-hidden rounded-md border border-line px-2 py-1.5 font-mono text-[12px] leading-[1.55]',
        tone === 'edit' ? 'bg-ok/[0.06]' : 'bg-surface-2',
      )}
    >
      {tail.map((l, i) => (
        <div key={i} className={cn('flex gap-2 whitespace-pre', i === tail.length - 1 && 'caret')}>
          <span className="w-6 shrink-0 select-none text-right text-muted">{start + i}</span>
          <span className="truncate">{l || ' '}</span>
        </div>
      ))}
    </pre>
  )
}

function TextTail({ text, lines, live }: { text: string; lines: number; live?: boolean }) {
  return (
    <p className={cn('text-[12px] leading-relaxed text-muted', live && 'caret')} style={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
      {text.replace(/[#*`_>]/g, '').slice(-600)}
    </p>
  )
}
