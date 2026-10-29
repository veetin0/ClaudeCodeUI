import { Brain, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/format'

export function Thinking({ text, live }: { text: string; live?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="text-muted">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[12px] hover:text-fg">
        <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
        <Brain className={cn('size-3.5', live && 'animate-soft-pulse text-accent-ink')} />
        {live ? 'Thinking…' : 'Thought'}
      </button>
      {open && <div className="selectable mt-1.5 whitespace-pre-wrap border-l-2 border-line pl-3 text-[12px] italic leading-relaxed">{text}</div>}
    </div>
  )
}
