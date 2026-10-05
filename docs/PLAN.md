# Plan: "Harness" — a Mac app to run and visualize Claude Code in real time

> **Progress:** All seven phases are done. Phase 7 added the native menu, the ⌘K palette, notifications, the menu-bar item, session replay, the app icon, hardened-runtime entitlements and the signing/notarization config (see `docs/RELEASING.md`). The packaging was checked with a working packaged build.

## Context
You want one Mac app where you run Claude Code and *watch* it work: what the agent is thinking, which tools it calls, which subagents it spawns, which files it touches, what it costs. Remotion projects should get a live video preview, but otherwise be treated like any other project. The UI should look simple at first glance and reveal depth on demand.

The repo (`veetin0/ClaudeCodeUI`) is empty, so this is a greenfield build.

**Decisions made:** Electron + React. Claude Agent SDK + hooks as the engine (structured events), with an embedded terminal as well. Remotion = live preview pane + generic project support.

---

## Architecture

```
┌──────────────────────── Electron main process (Node) ────────────────────────┐
│ AgentService ── @anthropic-ai/claude-agent-sdk query() (streaming input)     │
│   • hooks: PreToolUse/PostToolUse/SubagentStart/SubagentStop/Notification/   │
│     Stop/UserPromptSubmit/PreCompact                                          │
│   • canUseTool → permission requests sent to the UI                          │
│ HookBridge ── localhost HTTP endpoint; also watches ~/.claude/projects/*.jsonl│
│   so CLI sessions started in iTerm show up too ("observe mode")              │
│ EventNormalizer ── SDK msgs + hook payloads → one typed `HarnessEvent` stream │
│ SessionStore ── SQLite (better-sqlite3): sessions, events → history & replay │
│ PtyService ── node-pty for terminal tabs                                     │
│ FileWatcher ── chokidar on the project → file-activity events + git diff     │
│ RemotionService ── detects Remotion projects, runs `remotion studio`/`render`│
└───────────── typed IPC (contextBridge, event batching ~30fps) ───────────────┘
┌──────────────────────── Renderer (React + TS) ───────────────────────────────┐
│ Zustand stores fed by the event stream → panels (below)                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Core idea:** everything becomes a `HarnessEvent` (`session.start`, `message.delta`, `thinking`, `tool.start`, `tool.end`, `subagent.start/stop`, `todo.update`, `file.change`, `permission.request`, `usage`, `error`, `session.end`). Every panel is a view over that one stream. That makes live view, history and replay the same code.

## Tech stack
- **Shell:** Electron + `electron-vite` + TypeScript, `electron-builder` → `.dmg` (arm64 + x64), hidden-inset titlebar, vibrancy sidebar so it feels like a Mac app
- **UI:** React 19, Tailwind, shadcn/ui (Radix), Framer Motion for small animations, `cmdk` command palette, light and dark themes that follow the system
- **State:** Zustand (stores split by area: sessions, agents, files, ui)
- **Visuals:** React Flow (agent graph), Monaco diff editor, xterm.js (terminal), Recharts (tokens/cost)
- **Engine:** `@anthropic-ai/claude-agent-sdk`; reads the user's existing `~/.claude` settings, CLAUDE.md, MCP servers and skills (`settingSources`)
- **Secrets:** API key kept in Electron `safeStorage` (Keychain); uses the existing Claude Code login if one is present
- **Persistence:** SQLite in `~/Library/Application Support/Harness`

## UI layout: simple by default, deep on demand
```
┌ Sidebar ─────┬──────── Main: Conversation + Live Activity ────────┬─ Inspector (tabs) ─┐
│ Projects     │ user / assistant messages, streamed                 │ Agents  (graph)    │
│  └ Sessions  │ inline compact "tool chips" (Read x3, Edit, Bash…)  │ Files   (heat tree)│
│ + New session│   → click a chip to expand input/output/diff        │ Diff    (Monaco)   │
│              │ thinking shown collapsed                            │ Tasks   (todos)    │
│ status dots: │ ─────────────────────────────────────────────────── │ Terminal (xterm)   │
│ ● running    │ Prompt box: model picker, permission mode, @files,  │ Preview (Remotion/ │
│ ● waiting    │ /commands, attach image, Stop button                │   web dev server)  │
└──────────────┴─────────────────────────────────────────────────────┴────────────────────┘
 Top bar: project · branch · model · context-window gauge · $ cost · tokens/sec · ⌘K
```
- **Focus mode** (⌘\\): hide sidebar and inspector, so only the conversation shows.
- **Mission control** (⌘⇧M): full-screen agent graph plus timeline for long or multi-agent runs.

## Real-time visualizations (the main feature)
1. **Agent graph:** live React Flow tree. The main agent is the root; each `Task` subagent is a node that pulses while active and shows its current tool, elapsed time and tokens. Edges animate while work is handed off.
2. **Activity timeline:** a swim-lane per agent, with a bar per tool call (colour = tool type, width = duration). A scrubber replays any past session.
3. **File heat tree:** the project tree, with files glowing when read (blue) or written (orange). Click a file to see its diff since the session started.
4. **Live diff:** every Edit/Write streams into a Monaco diff view. Accept or revert per file (via git).
5. **Tasks panel:** mirrors the agent's TodoWrite list with live checkmarks.
6. **Meters:** context-window fill (warns before auto-compact), tokens in/out, cache hits, $ cost per session and per day, tokens/sec sparkline.
7. **Permission cards:** `canUseTool` requests show as an inline card (Allow once / Always / Deny / Edit input) and trigger a macOS notification when the app is in the background.
8. **Dock and menu bar:** dock badge for "waiting for you"; a menu-bar item shows running sessions.

## Remotion support
- Detect a Remotion project when `remotion` is in `package.json`. The Preview tab then offers **Start Studio**.
- `RemotionService` runs `npx remotion studio --port <free>` as a child process. The Studio is embedded in a `WebContentsView` in the Preview tab. It hot-reloads as Claude edits the composition files, so you watch the video change live.
- A **Render** button runs `npx remotion render <comp>` and shows streamed progress. The output opens in a Quick Look–style player.
- The same Preview tab works for any dev server it detects (Vite/Next `localhost` URL parsed from Bash output). That's the "one of many tools" part.

## Project structure
```
src/
  main/
    index.ts                 window, menu, tray, lifecycle
    agent/AgentService.ts    SDK query loop, streaming input, interrupt, resume
    agent/hooks.ts           SDK hook callbacks → events
    agent/permissions.ts     canUseTool ↔ UI round-trip
    events/normalizer.ts     SDKMessage/hook payload → HarnessEvent
    events/bus.ts            batching + IPC fan-out
    observe/HookBridge.ts    localhost server + JSONL transcript tailer
    store/db.ts              SQLite schema + queries
    pty/PtyService.ts
    fs/FileWatcher.ts, fs/git.ts
    remotion/RemotionService.ts
  preload/index.ts           typed contextBridge API
  shared/events.ts           HarnessEvent types (single source of truth)
  renderer/
    App.tsx, layout/ (Sidebar, TopBar, Inspector, CommandPalette)
    features/conversation/ (MessageList, ToolChip, PromptBox, PermissionCard)
    features/agents/ (AgentGraph, Timeline, MissionControl)
    features/files/ (HeatTree, DiffView)
    features/tasks/, features/terminal/, features/preview/, features/meters/
    stores/
```

## Build phases
1. **Skeleton (day 1–2):** electron-vite scaffold, Tailwind/shadcn, 3-pane layout, typed IPC, `shared/events.ts`.
2. **Engine MVP:** AgentService with the SDK (`query`, streaming input, interrupt), normalizer, conversation view with streaming text and tool chips, permission cards. *At this point you can already use it daily.*
3. **Persistence:** SQLite sessions and events, sidebar history, resume a session (`resume` option).
4. **Visualizations:** agent graph, tasks panel, meters, file watcher plus heat tree, Monaco diffs.
5. **Terminal and observe mode:** node-pty tabs; HookBridge, plus a one-click "install hooks" step that adds an HTTP-forwarding hook to `~/.claude/settings.json` (with a backup and confirmation) so CLI sessions also stream in.
6. **Remotion and preview:** Studio embed, render with progress, dev-server preview.
7. **Polish and ship:** timeline replay, mission control, command palette, notifications, dock badge, menu-bar item, `.dmg` via electron-builder (signing and notarization optional, needs an Apple Developer ID).

## Verification
- `npm run dev`: start a session in a sample repo, ask "read the README and add a section". Check that the streamed text, the Read/Edit chips, the diff view and the file glow all appear live.
- Ask for work that spawns subagents ("use 3 subagents to review these folders"). Check that the agent graph shows parallel nodes and the timeline lanes.
- Trigger a permission (Bash in default mode). Check the inline card and the background notification.
- Quit and reopen: the session shows in history, replay scrubs correctly, and resume continues the conversation.
- Observe mode: run `claude` in iTerm and check that events show up in the app.
- Remotion: `npx create-video@latest` sample, start Studio in the Preview tab, ask Claude to change the title text, and watch the preview update; Render produces an mp4.
- Unit tests (Vitest) for `events/normalizer.ts` against recorded SDK message fixtures; Playwright-Electron smoke test for launching the app and sending a prompt with a mocked engine.
- `npm run build:mac` produces a `.dmg` that installs and launches.
