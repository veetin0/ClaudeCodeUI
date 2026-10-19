import { createSdkMcpServer, tool, type SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const ok = (text = 'Shown in Harness.') => ({ content: [{ type: 'text' as const, text }] })

/**
 * The `harness` MCP server: lets the main agent and its subagents put progress bars, metric
 * charts, images, tables and status lines on their cards in the Harness UI.
 *
 * The handlers do nothing but acknowledge: the UI reads the tool *inputs* from the SDK message
 * stream, where each call already carries the calling agent's id. `extra` adds session-specific
 * tools (the driver's crew tools).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createHarnessServer(extra: SdkMcpToolDefinition<any>[] = []) {
  return createSdkMcpServer({
    name: 'harness',
    version: '1.0.0',
    instructions: HARNESS_TOOL_GUIDE,
    tools: [
      tool(
        'status',
        'Show a one-line, present-tense description of what you are doing right now on your card in the Harness UI (e.g. "Tuning learning rate").',
        { text: z.string().max(120) },
        async () => ok(),
        { alwaysLoad: true },
      ),
      tool(
        'progress',
        'Show or update a progress bar on your card in the Harness UI. Call again with the same label to update it. Use for any multi-step or long-running work.',
        {
          label: z.string().describe('e.g. "epoch", "files migrated", "frames rendered"'),
          current: z.number(),
          total: z.number().positive(),
          unit: z.string().optional(),
          metrics: z.record(z.string(), z.number()).optional().describe('Scalars at this step, e.g. {"loss": 0.42}; they are charted.'),
        },
        async () => ok(),
        { alwaysLoad: true },
      ),
      tool(
        'metric',
        'Log one numeric metric point (e.g. loss, accuracy, latency). Points with the same name form a live line chart in the Harness UI.',
        { name: z.string(), value: z.number(), step: z.number().optional() },
        async () => ok(),
        { alwaysLoad: true },
      ),
      tool(
        'show',
        'Display a result in the Harness UI: an image file you created (plot, render, screenshot), a markdown note, a table, or a line chart.',
        {
          title: z.string().optional(),
          image_path: z.string().optional().describe('Absolute or project-relative path to a .png/.jpg/.gif/.webp/.svg file'),
          markdown: z.string().optional(),
          table: z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }).optional(),
          chart: z
            .object({
              series: z.array(z.object({ name: z.string(), points: z.array(z.tuple([z.number(), z.number()])) })),
              x_label: z.string().optional(),
              y_label: z.string().optional(),
            })
            .optional(),
        },
        async (args) => {
          const given = [args.image_path, args.markdown, args.table, args.chart].filter((v) => v !== undefined).length
          if (given !== 1) {
            return { ...ok('Provide exactly one of image_path, markdown, table or chart.'), isError: true }
          }
          return ok()
        },
        { alwaysLoad: true },
      ),
      ...extra,
    ],
  })
}

/** Appended to the main agent's system prompt and given as MCP server instructions. */
export const HARNESS_TOOL_GUIDE = `You are running inside Harness, a desktop UI that visualizes each agent's work live on its own card.
- For multi-step or long-running work, keep your card informative: call mcp__harness__status with what you're doing, mcp__harness__progress for countable progress, and mcp__harness__metric for numbers worth charting.
- When you produce a visual result (a saved plot, a rendered frame, a table of results), display it with mcp__harness__show.
- Scripts you run can report live progress while they execute by POSTing JSON to the URL in the HARNESS_URL environment variable, e.g. in Python:
    import json, os, urllib.request
    def harness(**kw):
        url = os.environ.get("HARNESS_URL")
        if url:
            try: urllib.request.urlopen(urllib.request.Request(url, json.dumps(kw).encode(), {"Content-Type": "application/json"}), timeout=1)
            except Exception: pass
    harness(kind="progress", label="epoch", current=3, total=10, metrics={"loss": 0.42})
    harness(kind="metric", name="val_acc", value=0.91, step=3)
    harness(kind="show", title="Loss curve", image_path="/abs/path/loss.png")
  Prefer this for training loops, data processing and renders that run longer than a few seconds. Printing tqdm bars or lines like "Epoch 3/10 loss=0.42" is also picked up from command output.`
