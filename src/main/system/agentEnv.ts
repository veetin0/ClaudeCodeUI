/**
 * Variables that tie a process to a *parent* Claude Code session. They are present when Harness is
 * launched from a terminal inside Claude Code (e.g. `npm run dev` run by Claude), and would make our
 * sessions share the parent's task list and identity.
 */
const PARENT_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_PID',
]

/**
 * Claude Code stops in-process tool calls after 60 s unless MCP_TOOL_TIMEOUT says otherwise, which
 * would cut crew_wait (and the crew's wait for an answer) short. A little over their 30-minute cap.
 */
const TOOL_TIMEOUT_MS = '1900000'

export function agentEnv(extra: Record<string, string> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { MCP_TOOL_TIMEOUT: TOOL_TIMEOUT_MS, ...process.env, ...extra }
  for (const k of PARENT_SESSION_VARS) delete env[k]
  return env
}
