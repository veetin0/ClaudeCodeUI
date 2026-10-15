import { statSync } from 'node:fs'
import { basename, isAbsolute, join } from 'node:path'
import type { HookCallbackMatcher } from '@anthropic-ai/claude-agent-sdk'
import type { HarnessEvent, PermissionMode } from '@shared/events'
import { relTo } from '@shared/paths'
import {
  AUTO_MODEL,
  compactThreshold,
  generatedKind,
  GUARD_MIN_BYTES,
  routeText,
  routeTurn,
  skipReason,
  STRUGGLE_LIMIT,
  tierLabel,
  tierOf,
  type RouteDecision,
  type SaverNote,
  type SaverTier,
  type UsageSaverSettings,
} from '@shared/usageSaver'

/** What the saver needs from its session. */
export interface SaverHost {
  cwd: string
  note(note: SaverNote): void
  setModel(model: string): Promise<void>
  /** Runs /compact as a turn of its own; resolves when it has finished. */
  compact(): Promise<void>
}

/**
 * The Usage saver for one session: picks the model per turn (Auto), compacts long conversations
 * between tasks, brings in Opus when Sonnet struggles, and refuses whole-file reads of generated files.
 * Every decision is recorded as a `saver` event, so the user always sees whether usage is being saved.
 */
export class UsageSaver {
  private auto: boolean
  private tier: SaverTier | undefined
  private mode: PermissionMode
  private firstTurn: boolean
  private ctx = 0
  private window = 200_000
  private opusOk = true
  /** The latest prompt was a HackForge command: HackForge picks its agents' models and has its own advisor. */
  private hfTurn = false
  private compacting = false
  private streak = 0
  private escalated = false
  /** Main-agent tool calls, and calls that failed only because they were refused (by you or by the saver). */
  private mainTools = new Set<string>()
  private refused = new Set<string>()
  private requestTool = new Map<string, string>()

  constructor(
    private cfg: UsageSaverSettings,
    model: string | undefined,
    mode: PermissionMode,
    private readonly host: SaverHost,
    private readonly hackforgeLean: () => boolean,
    resumed?: { tier?: SaverTier },
  ) {
    this.auto = cfg.enabled && model === AUTO_MODEL
    this.tier = this.auto ? (resumed?.tier ?? 'sonnet') : tierOf(model)
    this.mode = mode
    this.firstTurn = !resumed
  }

  /** The model the SDK session starts on. */
  startModel(requested?: string): string | undefined {
    if (this.auto) return this.tier
    return requested && requested !== AUTO_MODEL ? requested : undefined
  }

  configNote(): SaverNote {
    const { enabled, compact, skipGenerated, leanOutput } = this.cfg
    return { kind: 'config', enabled, auto: this.auto, compact, skipGenerated, leanOutput }
  }

  setPermissionMode(mode: PermissionMode) {
    this.mode = mode
  }

  /** The model picker: Auto, or one model for this session from now on. */
  async pick(model: string, cfg: UsageSaverSettings) {
    this.cfg = cfg
    if (model === AUTO_MODEL) {
      this.auto = cfg.enabled
    } else {
      this.auto = false
      await this.host.setModel(model)
      this.tier = tierOf(model)
    }
    this.host.note(this.configNote())
  }

  /** Every event the session emits passes through here. */
  observe(e: HarnessEvent) {
    switch (e.type) {
      case 'session.init': {
        // Claude Code reports the model it actually runs each turn on.
        const actual = tierOf(e.model)
        this.mode = e.permissionMode ?? this.mode
        if (this.auto && this.tier === 'opus' && actual === 'sonnet' && this.opusOk) {
          this.opusOk = false
          this.host.note({ kind: 'notice', text: 'Opus isn’t available on this account right now, so Claude Code used Sonnet. The saver stays on Sonnet for this session.' })
        }
        if (actual) this.tier = actual
        break
      }
      case 'usage':
        this.ctx = e.contextTokens
        break
      case 'compact':
        if (e.postTokens !== undefined) this.ctx = e.postTokens
        if (this.compacting) this.host.note({ kind: 'compact', preTokens: e.preTokens, postTokens: e.postTokens })
        break
      case 'permission.request':
        this.requestTool.set(e.requestId, e.toolUseId)
        break
      case 'permission.resolved': {
        const tool = this.requestTool.get(e.requestId)
        this.requestTool.delete(e.requestId)
        if (tool && e.behavior === 'deny') this.refused.add(tool)
        break
      }
      case 'tool.start':
        if (e.agentId === null) this.mainTools.add(e.toolUseId)
        break
      case 'tool.end':
        if (!this.mainTools.delete(e.toolUseId) || e.background) break
        if (!e.isError) this.streak = 0
        else if (!this.refused.delete(e.toolUseId) && ++this.streak >= STRUGGLE_LIMIT) this.onStruggle()
        break
      case 'turn.end':
        if (e.contextWindow) this.window = e.contextWindow
        if (!e.internal) {
          this.streak = 0
          this.escalated = false
        }
        break
    }
  }

  /**
   * Before a message reaches Claude while no turn is running: compact if the conversation is long
   * (unless you're mid-debugging), then put the right model on it.
   */
  async beforeTurn(text: string) {
    this.hfTurn = /^\/hackforge:/i.test(text.trim())
    const route = () =>
      routeTurn({
        prompt: text,
        current: this.tier,
        firstTurn: this.firstTurn,
        permissionMode: this.mode,
        contextTokens: this.ctx,
        contextWindow: this.window,
        opusAvailable: this.opusOk,
        hackforgeLean: this.hackforgeLean(),
      })
    let d = route()
    if (this.cfg.enabled && this.cfg.compact && !d.escalation && !d.passthrough && this.ctx >= compactThreshold(this.window)) {
      this.compacting = true
      try {
        await this.host.compact()
      } finally {
        this.compacting = false
      }
      // The conversation is small now, so switching models costs little.
      d = route()
    }
    if (d.passthrough) return
    this.firstTurn = false
    if (!this.auto) return
    await this.apply(d)
  }

  private async apply(d: RouteDecision) {
    const switched = d.model !== this.tier
    if (switched) {
      try {
        await this.host.setModel(d.model)
        this.tier = d.model
      } catch {
        if (d.model !== 'opus') return
        this.opusOk = false
        this.host.note({ kind: 'notice', text: 'Opus isn’t available on this account right now. The saver stays on Sonnet for this session.' })
        return
      }
    }
    this.host.note({ kind: 'route', model: d.model, turn: d.kind, reason: d.reason, switched, ...(d.held ? { held: true } : {}), text: routeText(d, this.ctx) })
  }

  /** Sonnet keeps failing within one turn: hand the rest of it to Opus. */
  private onStruggle() {
    if (!this.auto || this.tier !== 'sonnet' || this.hfTurn || this.escalated || !this.opusOk) return
    this.escalated = true
    this.switchMidTurn('opus', 'think', `${STRUGGLE_LIMIT} steps failed in a row`, `Opus took over mid-task: ${STRUGGLE_LIMIT} steps failed in a row.`)
  }

  /** You approved a plan Opus wrote: Sonnet carries it out (as Claude Code's "opusplan" does). */
  onPlanApproved() {
    if (!this.auto || this.tier !== 'opus' || this.ctx >= compactThreshold(this.window)) return
    this.switchMidTurn('sonnet', 'build', 'carrying out the approved plan', 'Plan approved: Sonnet carries it out. Opus comes back if anything doesn’t work.')
  }

  private switchMidTurn(model: SaverTier, turn: 'think' | 'build', reason: string, text: string) {
    this.host.setModel(model).then(
      () => {
        this.tier = model
        this.host.note({ kind: 'route', model, turn, reason, switched: true, midTurn: true, text })
      },
      () => {
        if (model === 'opus') this.opusOk = false
        this.host.note({ kind: 'notice', text: `Couldn’t switch to ${tierLabel(model)}; staying on ${this.tier ? tierLabel(this.tier) : 'the current model'}.` })
      },
    )
  }

  /** PreToolUse hook refusing whole-file reads of big generated files (a range or a search still works). */
  readGuard(): HookCallbackMatcher | undefined {
    if (!this.cfg.enabled || !this.cfg.skipGenerated) return undefined
    const cwd = this.host.cwd
    return {
      matcher: 'Read',
      hooks: [
        async (input, toolUseId) => {
          const ti = ((input as { tool_input?: Record<string, unknown> }).tool_input ?? {}) as Record<string, unknown>
          if (typeof ti.file_path !== 'string' || ti.offset != null || ti.limit != null) return {}
          const abs = isAbsolute(ti.file_path) ? ti.file_path : join(cwd, ti.file_path)
          // Inside the project, folders count (dist/, build/…); outside it only the file name does.
          const what = generatedKind(relTo(abs, cwd) ?? basename(abs))
          if (!what) return {}
          let bytes: number
          try {
            bytes = statSync(abs).size
          } catch {
            return {}
          }
          if (bytes < GUARD_MIN_BYTES) return {}
          const id = toolUseId ?? (input as { tool_use_id?: string }).tool_use_id
          if (id) this.refused.add(id)
          this.host.note({ kind: 'skip', path: abs, bytes, what })
          return { hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: 'deny' as const, permissionDecisionReason: skipReason(basename(abs), what, bytes) } }
        },
      ],
    }
  }
}
