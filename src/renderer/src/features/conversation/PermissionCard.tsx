import { ShieldQuestion } from 'lucide-react'
import { useEffect } from 'react'
import { toolDisplayName, toolIcon } from '@/lib/tools'
import type { PermissionRequest, ToolCall } from '@/stores/reducer'
import { useApp } from '@/stores/app'
import { ToolDetail } from './ToolDetail'

/** Inline approval card for the SDK's canUseTool callback. ⏎ allows, ⎋ denies. */
export function PermissionCard({ req, primary }: { req: PermissionRequest; primary: boolean }) {
  const respond = useApp((s) => s.respondPermission)
  const Icon = toolIcon(req.toolName)
  const asTool: ToolCall = {
    id: req.toolUseId,
    name: req.toolName,
    input: req.input,
    agentId: req.agentId,
    status: 'running',
    startedAt: req.ts,
  }

  useEffect(() => {
    if (!primary) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement && e.target.value) return
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void respond(req.requestId, { behavior: 'allow' })
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        void respond(req.requestId, { behavior: 'deny' })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [primary, req.requestId, respond])

  return (
    <div className="rounded-xl border border-warn/40 bg-warn/[0.06] p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <ShieldQuestion className="size-4 text-warn-ink" />
        <span className="font-medium">{req.title ?? `Allow ${toolDisplayName(req.toolName)}?`}</span>
        <Icon className="ml-auto size-3.5 text-muted" />
        {req.agentId && <span className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] text-info-ink">subagent</span>}
      </div>
      {(req.description || req.decisionReason) && (
        <div className="mb-2 text-[12px] text-muted">{req.description ?? req.decisionReason}</div>
      )}
      <ToolDetail tool={asTool} />
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => void respond(req.requestId, { behavior: 'allow' })}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:brightness-110"
        >
          Allow {primary && <kbd className="ml-1 opacity-70">⏎</kbd>}
        </button>
        {req.canAlwaysAllow && (
          <button
            onClick={() => void respond(req.requestId, { behavior: 'allow', always: true })}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] hover:bg-surface-2"
          >
            Always allow
          </button>
        )}
        <button
          onClick={() => void respond(req.requestId, { behavior: 'deny' })}
          className="ml-auto rounded-md px-3 py-1.5 text-[12px] text-muted hover:bg-hover hover:text-fg"
        >
          Deny {primary && <kbd className="ml-1 opacity-70">⎋</kbd>}
        </button>
      </div>
    </div>
  )
}
