import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/format'

export const Markdown = memo(function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-zinc selectable max-w-none dark:prose-invert',
        'prose-pre:rounded-lg prose-pre:border prose-pre:border-line prose-pre:bg-surface-2 prose-pre:text-fg',
        'prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-surface-2 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
})
