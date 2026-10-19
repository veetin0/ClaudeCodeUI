import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { MAX_BRIEF, MAX_CREW_MESSAGE, MAX_SUMMARY } from '@shared/crew'

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true } : {}) })
const guard = async (fn: () => Promise<string> | string) => {
  try {
    return text(await fn())
  } catch (err) {
    return text(err instanceof Error ? err.message : String(err), true)
  }
}

/** What a crew mission session can do (CrewWorker implements it). */
export interface CrewMissionTools {
  report(status: 'done' | 'blocked' | 'failed', summary: string): string
  message(to: string, text: string): string
  team(): string
  wait(timeoutSec: number, signal?: AbortSignal): Promise<string>
}

/** The `crew` MCP server in a crew member's mission session. */
export function createCrewServer(t: CrewMissionTools) {
  return createSdkMcpServer({
    name: 'crew',
    version: '1.0.0',
    tools: [
      tool(
        'report',
        "Report the mission's outcome to the lead (call once, at the end): done when its done criteria pass, blocked when you need something you can't get, failed when it can't be done. Commit your work first; harness-crew pushes your branch after this.",
        {
          status: z.enum(['done', 'blocked', 'failed']),
          summary: z
            .string()
            .max(MAX_SUMMARY)
            .describe(
              'What you did, the checks you ran and their results, files touched, and anything the lead must know to merge (or what you need, if blocked).',
            ),
        },
        async (a) => guard(() => t.report(a.status, a.summary)),
        { alwaysLoad: true },
      ),
      tool(
        'message',
        'Send a short message to the lead\'s Claude (to: "lead"), a teammate\'s Claude (their name) or everyone ("all"): questions, interface changes others depend on, heads-ups about shared files.',
        { to: z.string(), text: z.string().max(MAX_CREW_MESSAGE) },
        async (a) => guard(() => t.message(a.to, a.text)),
        { alwaysLoad: true },
      ),
      tool(
        'team',
        'Who else is working on this project right now: their missions, branches and the files they have changed.',
        {},
        async () => guard(() => t.team()),
        { alwaysLoad: true },
      ),
      tool(
        'wait',
        'Wait for a message from the lead or a teammate (after asking something with message). Returns the messages, or nothing after the timeout.',
        { timeout_seconds: z.number().int().min(10).max(1800).optional() },
        async (a, extra) => guard(() => t.wait(a.timeout_seconds ?? 600, (extra as { signal?: AbortSignal } | undefined)?.signal)),
        { alwaysLoad: true },
      ),
    ],
  })
}

/** What the driver's sessions can do with the crew (CrewDriver implements it, bound to one session). */
export interface CrewDriverTools {
  status(): Promise<string> | string
  dispatch(missions: { title: string; brief: string; to?: string; from?: string; model?: string; allow?: string[] }[]): Promise<string>
  wait(o: { missions?: string[]; timeoutSec: number }, signal?: AbortSignal): Promise<string>
  message(to: string, text: string, mission?: string): string
  cancel(mission: string, reason?: string): string
}

/** Crew tools on the driver's `harness` server (mcp__harness__crew_*). */
export function driverCrewTools(t: CrewDriverTools) {
  return [
    tool(
      'crew_status',
      'Teammates lending their Claude to this project (harness-crew): who is ready, how much plan usage each has left, what each is working on, and every mission with its state.',
      {},
      async () => guard(() => t.status()),
    ),
    tool(
      'crew_dispatch',
      "Give missions to crew members' Claudes. Each runs on its own laptop and Claude plan, on a fresh branch from the base branch (push it first), and starts with no context: the brief must carry the task, owned paths, contracts/files to read, yes/no done criteria and the checks to run. Without `to`, the member with the most usage left and the least work gets it. harness-crew commits and pushes the branch when the crew Claude reports. Returns mission ids and branches.",
      {
        missions: z
          .array(
            z.object({
              title: z.string().max(120).describe('Short, e.g. "M2 frontend: request form"'),
              brief: z.string().max(MAX_BRIEF),
              to: z.string().optional().describe("A crew member's name; omit to pick by usage left"),
              from: z.string().optional().describe('Branch to start from (default: your current branch, as pushed)'),
              model: z.string().optional().describe('sonnet (default for routine builds), opus for hard ones, haiku for chores'),
              allow: z.array(z.string()).optional().describe('Extra commands it may run without asking, e.g. "Bash(docker compose *)"'),
            }),
          )
          .min(1)
          .max(8),
      },
      async (a) => guard(() => t.dispatch(a.missions)),
    ),
    tool(
      'crew_wait',
      'Wait until crew missions finish or a crew Claude messages you. Returns their reports (pushed branch, files, summary) and messages. Keep doing your own work between waits.',
      {
        missions: z.array(z.string()).optional().describe('Mission ids to wait for (default: any)'),
        timeout_seconds: z.number().int().min(10).max(1800).optional(),
      },
      async (a, extra) =>
        guard(() => t.wait({ missions: a.missions, timeoutSec: a.timeout_seconds ?? 600 }, (extra as { signal?: AbortSignal } | undefined)?.signal)),
    ),
    tool(
      'crew_message',
      'Message a crew member\'s Claude (their name) or all of them ("all"): answers to their questions, changed plans, interface changes.',
      { to: z.string(), text: z.string().max(MAX_CREW_MESSAGE), mission: z.string().optional() },
      async (a) => guard(() => t.message(a.to, a.text, a.mission)),
    ),
    tool(
      'crew_cancel',
      'Stop a mission. The crew member pushes what it has so far on the mission branch.',
      { mission: z.string(), reason: z.string().max(500).optional() },
      async (a) => guard(() => t.cancel(a.mission, a.reason)),
    ),
  ]
}
