# Harness

A Mac app that runs Claude Code and shows what it's doing as it happens: streamed replies, every tool call, subagents, the task list, context usage and cost.

![Three agents working in parallel on the Board, one streaming live training progress](docs/screenshots/board.png)

## Watching agents work

**Board** (⌘2) shows every agent as a live card. Each card shows:

- **What it's doing now:** the file it's writing streams in, a running command shows its line and timer, a search shows its query.
- **Progress bars** with an ETA, and **metric charts** (loss, accuracy, …).
- **The latest result it showed:** an image, chart, table or note.
- **A strip of its tool calls**, coloured by kind.

Click a card for the full detail view: progress, one chart per metric, all results, the files it touched (click to see the diff), its whole timeline and its report.

![Agent detail](docs/screenshots/agent-detail.png)

Agents feed these visuals three ways:

1. **`harness` tools.** Every agent has in-process MCP tools: `status`, `progress`, `metric` and `show`. `show` takes an image path, markdown, a table or a chart. Claude calls them between steps.
2. **`$HARNESS_URL`.** Scripts the agent runs can POST JSON there while they execute, so a training loop updates its progress bar and charts in real time. The format matches the tools, e.g. `{"kind": "progress", "label": "epoch", "current": 3, "total": 10, "metrics": {"loss": 0.42}}`.
3. **Command output.** tqdm bars, `Epoch 3/10` and `loss=0.42`-style lines are parsed automatically.

![Results shown inline](docs/screenshots/results.png)

## Action buttons instead of /commands

The buttons above the prompt cover common jobs: parallel agents, train a model, analyze data, fix tests, build a feature, debug, explain, Remotion video and commit. Each opens a form prefilled with example parameters and a preview of the exact prompt. **Commands ▾** lists the session's slash commands and skills, with descriptions and example arguments. Run sends the prompt right away; Edit in prompt drops it into the box so you can change it first.

![Action form](docs/screenshots/actions.png)

## Status

Phases 1–2 of [the plan](docs/PLAN.md) are done:

- **Engine:** Claude Agent SDK with streaming input, so you can queue follow-ups while Claude works. Stop with Esc. Switch model and permission mode mid-session.
- **Live conversation:** streamed markdown, collapsible thinking, and compact tool chips coloured by kind (read, write, search, exec…). Click a chip to see its input, output and diff.
- **Subagents:** each spawned agent gets a live card with its own tool calls, a progress summary and its final report. Background subagents keep running after the turn ends.
- **Permission cards:** Allow (⏎) / Always allow / Deny (⎋), with a diff preview. The dock badge and bounce fire while the app is in the background.
- **Inspector:** a tree of agents (current tool, elapsed time, tokens), the task list (from `TaskCreate`/`TaskUpdate` or `TodoWrite`), and a log of every tool call.
- **Top bar:** context-window gauge, output tokens, session cost, turn timer.
- **Focus mode** (⌘\\), open project (⌘O), settings (⌘,).

![Permission card](docs/screenshots/permission.png)

## Run it

```bash
npm install
npm run dev          # launches the app with hot reload
```

Requirements: macOS, Node 20+. Sessions use your existing Claude Code login. You can also store an Anthropic API key under **Settings**; it's encrypted with your macOS Keychain. Sessions load your usual `~/.claude` settings, CLAUDE.md files, MCP servers and skills.

```bash
npm test             # normalizer/reducer tests replay real recorded SDK sessions
npm run typecheck
npm run build:mac    # .dmg in dist/ (unsigned unless you configure a Developer ID)
```

## How it works

```
Claude Agent SDK ──▶ EventNormalizer ──▶ HarnessEvent stream ──▶ IPC (batched ~30fps) ──▶ reducer ──▶ React panels
      ▲                (main process)                                                  (renderer)
      └── canUseTool ◀── PermissionBroker ◀── permission card
```

Everything the UI shows is derived from one typed event stream (`src/shared/events.ts`). Live view now, and history/replay later, run on the same reducer.

| Path | What |
| --- | --- |
| `src/main/agent/AgentService.ts` | One SDK `query()` per session, fed by a push queue; status tracking; interrupt |
| `src/main/agent/permissions.ts` | `canUseTool` ↔ UI round-trip |
| `src/main/events/normalizer.ts` | SDK messages → `HarnessEvent`s (tools, subagents, tasks, usage, visuals) |
| `src/main/agent/harnessTools.ts` | The `harness` MCP tools agents use to report progress and show results |
| `src/main/system/telemetry.ts` | Localhost endpoint behind `$HARNESS_URL` for live script telemetry |
| `src/shared/parseOutput.ts` | Progress/metric extraction from command output |
| `src/renderer/src/features/agents/` | Board, agent cards, detail view, "what is it doing now" |
| `src/renderer/src/lib/actions.ts` | Action buttons and their example parameters |
| `src/main/events/bus.ts` | Batches events to the renderer |
| `src/renderer/src/stores/reducer.ts` | Events → session state (pure; unit-tested) |
| `src/renderer/src/features/` | Conversation, agents, tasks, meters |
| `test/fixtures/` | Real SDK sessions recorded for tests |
