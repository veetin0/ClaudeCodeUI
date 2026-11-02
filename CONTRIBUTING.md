# Contributing to Harness

Thanks for helping. Bug reports, ideas, docs fixes and pull requests are all welcome, and you don't need to ask before opening an issue.

- **Found a bug?** [Open a bug report](https://github.com/veetin0/ClaudeCodeUI/issues/new?template=bug_report.yml) with what you did, what you expected and what happened.
- **Have an idea?** [Suggest a feature](https://github.com/veetin0/ClaudeCodeUI/issues/new?template=feature_request.yml). A short description of the problem is more useful than a finished design.
- **Found a security problem?** Please don't open a public issue; see [SECURITY.md](SECURITY.md).

Everyone taking part agrees to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need Node.js 22 or newer, git, and [Claude Code](https://docs.claude.com/en/docs/claude-code) logged in (or an Anthropic API key). On Windows, also follow [docs/WINDOWS.md](docs/WINDOWS.md).

```bash
git clone https://github.com/veetin0/ClaudeCodeUI.git
cd ClaudeCodeUI
npm install
npm run dev          # the app with hot reload
```

| Command | What it does |
|---|---|
| `npm run dev` | Runs the app with hot reload |
| `npm test` | Unit tests (Vitest). Many replay real recorded Claude Code sessions from `test/fixtures/` |
| `npm run typecheck` | TypeScript for the main process, the renderer and the tests |
| `npm run test:e2e` | Builds the app and drives it end to end (slower) |
| `npm run build:mac` / `build:win` | An installer in `dist/` (see [docs/RELEASING.md](docs/RELEASING.md)) |
| `npm run build:dir` | An unpacked app, for a quick packaging check |

## Making a change

1. Fork the repo and create a branch from `main`.
2. Keep the change focused: one fix or feature per pull request.
3. Add or update tests where it makes sense. Reducer, normalizer and parser logic is all unit-tested, so new behaviour there should be too.
4. Run `npm run typecheck` and `npm test` before you push. CI runs both.
5. For UI changes, include a before and after screenshot in the pull request. The visual system (colours, type, the sector bars, one main button per screen) is described in [DESIGN.md](DESIGN.md).
6. Open the pull request and describe what changed and why.

### Code style

- TypeScript everywhere, strict mode. Match the style of the file you're editing: names, comment density and idiom.
- UI copy is short and plain, and buttons name their action ("Continue", "Accept and run").
- Use the design tokens in `src/renderer/src/styles.css` (`bg-surface`, `text-muted`, `text-ok-ink`…) rather than raw colours.

## How it works

```
Claude Agent SDK ──▶ EventNormalizer ──▶ HarnessEvent stream ──▶ IPC (batched ~30fps) ──▶ reducer ──▶ React panels
      ▲                (main process)                                                  (renderer)
      └── canUseTool ◀── PermissionBroker ◀── permission card
```

Everything the UI shows is derived from one typed event stream (`src/shared/events.ts`). The live view and history replay run on the same reducer.

| Path | What |
| --- | --- |
| `src/main/agent/AgentService.ts` | One SDK `query()` per session, fed by a push queue; status tracking; interrupt |
| `src/main/agent/permissions.ts` | `canUseTool` ↔ UI round-trip |
| `src/main/events/normalizer.ts` | SDK messages → `HarnessEvent`s (tools, subagents, tasks, usage, visuals) |
| `src/main/events/bus.ts` | Batches events to the renderer |
| `src/main/agent/harnessTools.ts` | The `harness` MCP tools agents use to report progress and show results |
| `src/main/system/telemetry.ts` | Localhost endpoint behind `$HARNESS_URL` for live script progress (nothing leaves the machine) |
| `src/main/store/SessionStore.ts` | SQLite sessions, event log and file snapshots |
| `src/main/project/ChangeTracker.ts` | Pre-edit snapshots, git fallback, diff stats, revert/accept |
| `src/main/project/projectFiles.ts` | Project file listing and recursive watcher |
| `src/main/observe/TranscriptObserver.ts` | Observe mode: transcript tailing → HarnessEvents |
| `src/main/observe/hooks.ts` | Status hook bridge and safe settings.json install/remove |
| `src/main/pty/PtyService.ts` | node-pty terminals streamed to xterm.js |
| `src/main/preview/PreviewService.ts` | Remotion Studio, dev servers, renders, URL detection |
| `src/main/team/`, `relay/`, `crew/` | Team run: the team service, the relay server and the `harness-crew` CLI |
| `src/shared/parseOutput.ts` | Progress/metric extraction from command output |
| `src/renderer/src/stores/reducer.ts` | Events → session state (pure; unit-tested) |
| `src/renderer/src/features/` | Conversation, agents, mission graph and timeline, files and diffs, preview, hackathon, usage |
| `src/renderer/src/ui/` | Shared pieces: ⋯ menu, popover, one-main-action button, tabs, sheet, sector bars |
| `src/renderer/src/lib/actions.ts`, `lib/actionMenu.ts`, `lib/nextStep.ts` | Quick actions, the / menu and the HackForge next step |
| `test/fixtures/` | Real SDK sessions recorded for tests |

## Maintainer notes

These are only needed to update bundled third-party content or publish packages:

- `npm run design:sync -- --impeccable ~/src/impeccable --uipro ~/src/ui-ux-pro-max-skill` refreshes the bundled design skills in `resources/design/` from local clones of [impeccable](https://github.com/pbakaus/impeccable) and [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
- `npm run hackforge:sync -- <path to a hackforge-marketplace folder or its hackforge/ folder>` copies a HackForge plugin into `resources/hackforge/` (add `--force` to go back to an older version).
- `npm run crew:publish` builds and publishes the `harness-crew` package to npm (requires `npm login`).
- Signing, notarizing and Windows builds: [docs/RELEASING.md](docs/RELEASING.md).
