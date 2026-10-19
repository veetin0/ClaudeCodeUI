import { AlertTriangle, Archive, Bot, Info, Leaf, Users, Zap } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { cn, formatCost, formatDuration } from '@/lib/format'
import type { Item, SessionState } from '@/stores/reducer'
import { Markdown } from './Markdown'
import { Thinking } from './Thinking'
import { ToolGroup } from './ToolGroup'

type Block = { kind: 'tools'; id: string; ids: string[] } | Exclude<Item, { kind: 'tool' }>

/** Consecutive tool items collapse into one chip row. */
function toBlocks(items: Item[]): Block[] {
  const out: Block[] = []
  for (const it of items) {
    if (it.kind === 'tool') {
      const last = out[out.length - 1]
      if (last?.kind === 'tools') last.ids.push(it.id)
      else out.push({ kind: 'tools', id: `tools-${it.id}`, ids: [it.id] })
    } else {
      out.push(it)
    }
  }
  return out
}

export function MessageList({ session }: { session: SessionState }) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const blocks = toBlocks(session.items)

  // Follow the stream unless the user has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  })
  useEffect(() => {
    stick.current = true
  }, [session.id])

  const working = session.status === 'running' || session.status === 'compacting'

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
        {blocks.map((b) => (
          <BlockView key={b.id} block={b} session={session} />
        ))}
        {session.streamingThinking && <Thinking text={session.streamingThinking} live />}
        {session.streamingText && (
          <div className="caret">
            <Markdown text={session.streamingText} />
          </div>
        )}
        {working && !session.streamingText && !session.streamingThinking && (
          <div className="flex items-center gap-2 text-[12px] text-muted">
            <span className="size-1.5 animate-soft-pulse rounded-full bg-[var(--accent)]" />
            {session.status === 'compacting' ? 'Compacting conversation…' : 'Working…'}
          </div>
        )}
      </div>
    </div>
  )
}

function BlockView({ block, session }: { block: Block; session: SessionState }) {
  switch (block.kind) {
    case 'user':
      if (block.via === 'crew') {
        // A crew report or a teammate's Claude, delivered by Harness: not something you typed.
        return (
          <div className="selectable flex gap-2 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[0.05] px-3 py-2 text-[12.5px] leading-relaxed">
            <Bot className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            <div className="min-w-0 whitespace-pre-wrap">{block.text.replace(/^\[crew\] ?/gm, '')}</div>
          </div>
        )
      }
      return (
        <div className="flex justify-end">
          <div className="selectable max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-2 px-4 py-2.5 leading-relaxed shadow-[inset_0_0_0_1px_var(--line)]">
            {block.images?.map((im, i) => (
              <img key={i} src={`data:${im.mediaType};base64,${im.data}`} alt="Attached screenshot" className="mb-2 max-h-40 rounded-lg border border-line" />
            ))}
            {block.text}
          </div>
        </div>
      )
    case 'text':
      return <Markdown text={block.text} />
    case 'thinking':
      return <Thinking text={block.text} />
    case 'tools':
      return <ToolGroup ids={block.ids} session={session} />
    case 'turn':
      return (
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <div className="h-px flex-1 bg-line" />
          <span className="tabular-nums">
            {block.isError ? 'Stopped' : 'Done'} · {formatDuration(block.durationMs)}
            {block.costUsd > 0 && ` · ${formatCost(block.costUsd)}`}
          </span>
          <div className="h-px flex-1 bg-line" />
        </div>
      )
    case 'compact':
      return (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-[12px] text-sky-700 dark:text-sky-300">
          <Archive className="size-3.5" />
          Conversation compacted ({block.trigger}) — {block.preTokens.toLocaleString()} tokens summarized
        </div>
      )
    case 'saver': {
      const Icon = block.tone === 'saving' ? Leaf : block.tone === 'power' ? Zap : Info
      return (
        <div
          data-saver-note={block.tone}
          className={cn(
            'flex items-start gap-2 px-1 text-[11.5px] leading-relaxed',
            block.tone === 'saving' ? 'text-emerald-700 dark:text-emerald-300' : block.tone === 'power' ? 'text-amber-700 dark:text-amber-300' : 'text-muted',
          )}
        >
          <Icon className="mt-[3px] size-3 shrink-0" />
          <span>
            <span className="font-medium">Usage saver</span> · {block.text}
          </span>
        </div>
      )
    }
    case 'notice': {
      const Icon = block.source === 'team' ? Users : Info
      return (
        <div
          data-notice={block.tone}
          className={cn(
            'flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed',
            block.tone === 'warn' ? 'border border-amber-500/30 bg-amber-500/[0.06] text-amber-800 dark:text-amber-200' : 'text-muted',
          )}
        >
          <Icon className="mt-[3px] size-3.5 shrink-0" />
          <span className="selectable">{block.text}</span>
        </div>
      )
    }
    case 'error':
      return (
        <div className="selectable flex gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2.5 text-[12px] text-red-700 dark:text-red-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <pre className="whitespace-pre-wrap font-sans">{block.message}</pre>
        </div>
      )
  }
}
