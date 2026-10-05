import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { EXEC_TOOLS, HARNESS_TOOL_PREFIX, type AgentId, type HarnessEvent, type PermissionMode, type TodoItem } from '@shared/events'
import { parseOutput } from '@shared/parseOutput'
import { toVisual } from '@shared/visuals'

const MAX_OUTPUT_CHARS = 20_000
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskList'])

type Block = Record<string, unknown> & { type: string }

/** Distributes Omit over each member of the union so the discriminant survives. */
type Draft = HarnessEvent extends infer T ? (T extends HarnessEvent ? Omit<T, 'sessionId' | 'ts'> : never) : never

/**
 * Turns raw SDK messages into HarnessEvents for one session.
 * Stateful only for de-duplication (the SDK splits one API message into one SDK message per content block).
 */
export class EventNormalizer {
  private seenUsageForMessage = new Set<string>()
  /** Task list built from TaskCreate/TaskUpdate/TaskList results, in creation order. */
  private tasks = new Map<string, TodoItem>()
  private taskToolInputs = new Map<string, { name: string; input: Record<string, unknown> }>()
  /** Exec tools awaiting results, so their output can be scanned and attributed to the right agent. */
  private execTools = new Map<string, AgentId>()

  constructor(
    private readonly sessionId: string,
    private readonly now: () => number = Date.now,
    private readonly cwd = '/',
  ) {}

  /** Continues a resumed session's TaskCreate list so later TaskUpdates apply to it. */
  seedTasks(todos: TodoItem[]) {
    for (const t of todos) if (t.id) this.tasks.set(t.id, t)
  }

  normalize(msg: SDKMessage): HarnessEvent[] {
    const out: Draft[] = []
    const m = msg as Record<string, unknown> & { type: string; subtype?: string }

    switch (m.type) {
      case 'stream_event':
        this.streamEvent(m, out)
        break
      case 'assistant':
        this.assistant(m, out)
        break
      case 'user':
        this.user(m, out)
        break
      case 'tool_progress':
        out.push({ type: 'tool.progress', toolUseId: String(m.tool_use_id), elapsedSeconds: Number(m.elapsed_time_seconds) })
        break
      case 'system':
        this.system(m, out)
        break
      case 'result':
        this.result(m, out)
        break
    }

    const ts = this.now()
    return out.map((e) => ({ ...e, sessionId: this.sessionId, ts }) as HarnessEvent)
  }

  private streamEvent(m: Record<string, unknown>, out: Draft[]) {
    const event = m.event as { type: string; delta?: { type: string; text?: string; thinking?: string } }
    if (event.type !== 'content_block_delta' || !event.delta) return
    const agentId = (m.parent_tool_use_id as AgentId) ?? null
    if (event.delta.type === 'text_delta' && event.delta.text) {
      out.push({ type: 'text.delta', agentId, text: event.delta.text })
    } else if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
      out.push({ type: 'thinking.delta', agentId, text: event.delta.thinking })
    }
  }

  private assistant(m: Record<string, unknown>, out: Draft[]) {
    const message = m.message as { id: string; content: Block[]; usage?: Record<string, number | null> }
    const agentId = (m.parent_tool_use_id as AgentId) ?? null
    const uuid = String(m.uuid)

    message.content.forEach((block, i) => {
      const id = `${uuid}:${i}`
      if (block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) {
        out.push({ type: 'assistant.text', id, agentId, text: block.text })
      } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.length > 0) {
        out.push({ type: 'assistant.thinking', id, agentId, text: block.thinking })
      } else if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
        const name = String(block.name)
        const input = (block.input as Record<string, unknown>) ?? {}
        out.push({ type: 'tool.start', toolUseId: String(block.id), agentId, name, input })
        if (name === 'TodoWrite' && Array.isArray(input.todos)) {
          out.push({ type: 'todo.update', todos: input.todos as TodoItem[] })
        } else if (TASK_TOOLS.has(name)) {
          this.taskToolInputs.set(String(block.id), { name, input })
        } else if (EXEC_TOOLS.has(name)) {
          this.execTools.set(String(block.id), agentId)
        } else if (name.startsWith(HARNESS_TOOL_PREFIX)) {
          const update = toVisual(name.slice(HARNESS_TOOL_PREFIX.length), input, String(block.id), this.cwd)
          if (update) out.push({ type: 'visual', agentId, toolUseId: String(block.id), source: 'tool', update })
        }
      }
    })

    // Context meter tracks the main agent only; subagents have their own context windows.
    if (agentId === null && message.usage && !this.seenUsageForMessage.has(message.id)) {
      this.seenUsageForMessage.add(message.id)
      const u = message.usage
      const usage = {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
      }
      out.push({
        type: 'usage',
        usage,
        contextTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens + usage.outputTokens,
      })
    }
  }

  private user(m: Record<string, unknown>, out: Draft[]) {
    const content = (m.message as { content: unknown }).content
    // Plain-text user messages are our own prompts, which AgentService already emitted.
    if (!Array.isArray(content)) return
    // Structured tool output; set when the message carries a single tool result.
    const result = m.tool_use_result as Record<string, unknown> | undefined
    for (const block of content as Block[]) {
      if (block.type !== 'tool_result') continue
      const toolUseId = String(block.tool_use_id)
      const isError = block.is_error === true
      const background = result?.isAsync === true || result?.status === 'async_launched'
      out.push({
        type: 'tool.end',
        toolUseId,
        isError,
        output: truncate(stringifyToolContent(block.content)),
        ...(background ? { background } : {}),
      })
      if (this.execTools.has(toolUseId)) {
        const agentId = this.execTools.get(toolUseId) ?? null
        this.execTools.delete(toolUseId)
        const parsed = parseOutput(stringifyToolContent(block.content))
        for (const update of [...parsed.progress, ...parsed.metrics]) {
          out.push({ type: 'visual', agentId, toolUseId, source: 'parsed', update })
        }
      }
      const taskTool = this.taskToolInputs.get(toolUseId)
      if (taskTool) {
        this.taskToolInputs.delete(toolUseId)
        if (!isError && result && this.applyTaskResult(taskTool.name, taskTool.input, result)) {
          out.push({ type: 'todo.update', todos: [...this.tasks.values()] })
        }
      }
    }
  }

  /** Returns true when the task list changed. */
  private applyTaskResult(name: string, input: Record<string, unknown>, result: Record<string, unknown>): boolean {
    if (name === 'TaskCreate') {
      const task = result.task as { id: string; subject: string } | undefined
      if (!task) return false
      this.tasks.set(task.id, {
        id: task.id,
        content: task.subject,
        status: 'pending',
        activeForm: typeof input.activeForm === 'string' ? input.activeForm : undefined,
      })
      return true
    }
    if (name === 'TaskUpdate') {
      const id = String(result.taskId ?? input.taskId)
      const existing = this.tasks.get(id)
      if (result.success !== true || !existing) return false
      if (input.status === 'deleted') {
        this.tasks.delete(id)
        return true
      }
      const status = input.status as TodoItem['status'] | undefined
      this.tasks.set(id, {
        ...existing,
        ...(status ? { status } : {}),
        ...(typeof input.subject === 'string' ? { content: input.subject } : {}),
        ...(typeof input.activeForm === 'string' ? { activeForm: input.activeForm } : {}),
      })
      return true
    }
    if (name === 'TaskList' && Array.isArray(result.tasks)) {
      const prev = this.tasks
      this.tasks = new Map(
        (result.tasks as { id: string; subject: string; status: TodoItem['status'] }[]).map((t) => [
          t.id,
          { id: t.id, content: t.subject, status: t.status, activeForm: prev.get(t.id)?.activeForm },
        ]),
      )
      return true
    }
    return false
  }

  private system(m: Record<string, unknown> & { subtype?: string }, out: Draft[]) {
    switch (m.subtype) {
      case 'init':
        out.push({
          type: 'session.init',
          claudeSessionId: String(m.session_id),
          model: String(m.model),
          cwd: String(m.cwd),
          tools: (m.tools as string[]) ?? [],
          permissionMode: m.permissionMode as PermissionMode,
          slashCommands: (m.slash_commands as string[]) ?? [],
          claudeCodeVersion: String(m.claude_code_version ?? ''),
        })
        break
      case 'task_started':
        if (m.ambient || m.skip_transcript) return
        out.push({
          type: 'subagent.start',
          taskId: String(m.task_id),
          toolUseId: (m.tool_use_id as string) ?? null,
          description: String(m.description ?? ''),
          subagentType: m.subagent_type as string | undefined,
          background: m.is_backgrounded === true,
        })
        break
      case 'task_progress': {
        if (m.ambient || m.skip_transcript || !m.tool_use_id) return
        const usage = m.usage as { total_tokens: number; tool_uses: number }
        out.push({
          type: 'subagent.progress',
          toolUseId: String(m.tool_use_id),
          summary: m.summary as string | undefined,
          lastToolName: m.last_tool_name as string | undefined,
          totalTokens: usage?.total_tokens ?? 0,
          toolUses: usage?.tool_uses ?? 0,
        })
        break
      }
      case 'task_notification': {
        if (m.ambient || m.skip_transcript) return
        const usage = m.usage as { total_tokens: number; tool_uses: number; duration_ms: number } | undefined
        out.push({
          type: 'subagent.end',
          taskId: String(m.task_id),
          toolUseId: (m.tool_use_id as string) ?? null,
          status: m.status as 'completed' | 'failed' | 'stopped',
          summary: String(m.summary ?? ''),
          totalTokens: usage?.total_tokens,
          toolUses: usage?.tool_uses,
          durationMs: usage?.duration_ms,
        })
        break
      }
      case 'status':
        if (m.status === 'compacting') out.push({ type: 'status', status: 'compacting' })
        break
      case 'compact_boundary': {
        const meta = m.compact_metadata as { trigger: 'manual' | 'auto'; pre_tokens: number; post_tokens?: number }
        out.push({ type: 'compact', trigger: meta.trigger, preTokens: meta.pre_tokens, postTokens: meta.post_tokens })
        break
      }
    }
  }

  private result(m: Record<string, unknown>, out: Draft[]) {
    const modelUsage = (m.modelUsage as Record<string, { contextWindow?: number }>) ?? {}
    const windows = Object.values(modelUsage).map((u) => u.contextWindow ?? 0)
    const errors = (m.errors as string[] | undefined) ?? []
    out.push({
      type: 'turn.end',
      isError: m.is_error === true,
      result: typeof m.result === 'string' ? m.result : errors.join('\n'),
      costUsd: Number(m.total_cost_usd ?? 0),
      durationMs: Number(m.duration_ms ?? 0),
      numTurns: Number(m.num_turns ?? 0),
      outputTokens: Number((m.usage as { output_tokens?: number } | undefined)?.output_tokens ?? 0),
      contextWindow: windows.length ? Math.max(...windows) : undefined,
    })
  }
}

function stringifyToolContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((c: Block) => (c.type === 'text' ? String(c.text) : c.type === 'image' ? '[image]' : `[${c.type}]`))
      .join('\n')
  }
  return content == null ? '' : JSON.stringify(content)
}

function truncate(s: string): string {
  return s.length > MAX_OUTPUT_CHARS ? `${s.slice(0, MAX_OUTPUT_CHARS)}\n… (${s.length - MAX_OUTPUT_CHARS} more chars)` : s
}
