import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent } from '@shared/events'
import type { PermissionDecision } from '@shared/ipc'

type CanUseToolOptions = Parameters<CanUseTool>[2]

interface Pending {
  resolve: (r: PermissionResult) => void
  input: Record<string, unknown>
  suggestions: CanUseToolOptions['suggestions']
  toolUseId: string
}

/** Round-trips the SDK's canUseTool callback through the UI as permission cards. */
export class PermissionBroker {
  private pending = new Map<string, Pending>()

  constructor(
    private readonly emit: (e: HarnessEvent) => void,
    private readonly sessionId: string,
  ) {}

  request(toolName: string, input: Record<string, unknown>, o: CanUseToolOptions): Promise<PermissionResult> {
    const requestId = o.requestId
    return new Promise<PermissionResult>((resolve) => {
      this.pending.set(requestId, { resolve, input, suggestions: o.suggestions, toolUseId: o.toolUseID })
      o.signal.addEventListener('abort', () => this.settle(requestId, { behavior: 'deny', message: 'Request aborted' }), {
        once: true,
      })
      this.emit({
        type: 'permission.request',
        sessionId: this.sessionId,
        ts: Date.now(),
        requestId,
        toolUseId: o.toolUseID,
        agentId: o.agentID ?? null,
        toolName,
        input,
        title: o.title,
        description: o.description,
        decisionReason: o.decisionReason,
        canAlwaysAllow: !o.suppressAlwaysAllowRule && (o.suggestions?.length ?? 0) > 0,
      })
    })
  }

  resolve(requestId: string, decision: PermissionDecision) {
    const p = this.pending.get(requestId)
    if (!p) return
    if (decision.behavior === 'allow') {
      this.settle(requestId, {
        behavior: 'allow',
        updatedInput: decision.updatedInput ?? p.input,
        updatedPermissions: decision.always ? p.suggestions : undefined,
        toolUseID: p.toolUseId,
      })
    } else {
      this.settle(requestId, { behavior: 'deny', message: decision.message || 'The user denied this action.', toolUseID: p.toolUseId })
    }
  }

  cancelAll(message = 'Session ended') {
    for (const id of [...this.pending.keys()]) this.settle(id, { behavior: 'deny', message, interrupt: true })
  }

  private settle(requestId: string, result: PermissionResult) {
    const p = this.pending.get(requestId)
    if (!p) return
    this.pending.delete(requestId)
    p.resolve(result)
    this.emit({ type: 'permission.resolved', sessionId: this.sessionId, ts: Date.now(), requestId, behavior: result.behavior })
  }
}
