---
name: build
description: Turns a HackForge decision into a working, near-finished entry — plans vertical-slice milestones, freezes interface contracts, runs parallel builder and craftsman agents in git worktrees (backend, frontend, data/ML, 3D, audio, video…), integrates each wave and verifies it. Use after kickoff, or when the user says "build it".
argument-hint: "[--from M<n>] [--wave-size N]"
---

# HackForge build — $ARGUMENTS

Inputs: `.hackforge/DECISION.md`, RULES, DIRECTIVES, research, STATE (profile, models, limits). Resume from STATE.md if a build is already in progress (or from `--from`).

## 1. Plan in vertical slices

Write `.hackforge/PLAN.md` from `${CLAUDE_PLUGIN_ROOT}/skills/kickoff/templates/PLAN.md`:
- **M1 = thinnest end-to-end slice that could be submitted** (data → logic → UI → the one asset that matters, all crude). Each later milestone deepens the whole slice and raises a named J. Never build a whole layer before anything works end to end.
- Each milestone lists its **tasks by role** — backend, frontend, data-ml, full-stack, craft (3D / CAD / audio / video / hardware / pitch) — with runnable acceptance checks and the R/D/J IDs covered.
- Time-box every milestone from the hours in STATE.md; reserve the last 20 % for polish, pitch and submission.

**Checkpoint `plan`** only if listed in the yaml `checkpoints:`.

## 2. Freeze contracts

Write `.hackforge/CONTRACTS.md`: API endpoints with request/response shapes, data schemas and types, file formats and folders, environment variables, and **asset specs** (e.g. `assets/turbine/turbine.glb`, ≤ 5 MB, Y-up, metres, 1 material per part; `assets/audio/ambience.ogg`, 60 s loop, −16 LUFS). Scaffold the repo to match: folders, typed stubs, mock data, a mock server where useful, `.env.example`, and the README skeleton.

**Design system (when the plan has frontend tasks).** Write `DESIGN.md` at the project root before any UI work, so parallel frontend builders share one look: product feel in a sentence, palette (primary, accent, neutrals, semantic colours with hex values), type (families, scale), spacing and radius scale, component rules, motion, and what to avoid. Start from the sponsor's brand kit in `challenge/assets/` when the entry is "for" them and the rules allow it. If the `ui-ux-pro-max` skill is available, use it once here to choose the style, palette and fonts for the product type; if `impeccable` is available, its `document`/`shape` commands can write the file in the format its detector reads. Keep an existing `DESIGN.md`. Commit it with the contracts: it's frozen like them, and only a contract change moves it.

Write `.hackforge/gate.sh` (executable): install/build, the full test suite, every acceptance check of completed milestones, the metric threshold if any, and existence/format checks of required assets. Exit 0 only if everything passes. It grows with every milestone and must never be weakened. It must run on macOS, Linux and Windows (Git Bash): LF line endings, `#!/usr/bin/env bash`, `set -euo pipefail`, no `python3` hard-coded — resolve Python first:
```bash
for c in "py -3" python3 python; do v=$($c -c 'import sys;print(sys.version_info[0])' 2>/dev/null | tr -d '\r'); [ "$v" = 3 ] && PY="$c" && break; done
[ -n "${PY:-}" ] || { echo "no Python 3"; exit 1; }
$PY -m pytest -q
```
Use `npm run …` / `npx …` rather than shell-specific paths, and forward slashes in paths.

**Per-milestone contracts.** For each milestone write `.hackforge/contracts/M<n>.json` (`${CLAUDE_PLUGIN_ROOT}/reference/schemas/contract.example.json`): goal, the J/R/D it covers, `tasks` with `owned` paths and an `owner` (`agent`, or a teammate's name when `team` > 1 — leave human-friendly tasks unclaimed for `/hackforge:team claim`), a **yes/no DoD** (each item something a stranger could tick off, with a command where possible — never "works well"), `validation_commands`, `max_iterations` (default 3) and `risk` tags (`needs-spike`, `security-sensitive`, `irreversible`). Every DoD command also goes into gate.sh once the milestone is done.

**Permissions up front.** Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools permissions` and show the user the proposed allowlist for the commands the plan needs. Merge it (`--apply`) only if they agree — then the long run doesn't stall on prompts.

Commit both to `main` before dispatching — worktree agents branch from the default branch, so they only see what's committed there. With a crew (below), also push it: crew members clone from the git remote.

**Crew (Harness).** When `mcp__harness__crew_status` exists, call it once here. If teammates have lent their Claude (harness-crew), each ready crew member is an extra builder on another laptop and another Claude plan: it doesn't use your usage and doesn't count toward the profile's parallel limit. Prefer the crew for the bigger tasks when your own usage is lower than theirs (the status shows both).

## 3. Build in waves

For each milestone:
0. If the milestone contract has a `needs-spike`, `security-sensitive` or `irreversible` risk tag, consult `hackforge:advisor` (reason_code `needs-spike` / `risky-step`) before starting it and follow its PLAN / CORRECTION / STOP.
1. Split it into independent tasks along the contracts. Launch them **in parallel** — `hackforge:builder` for code (pass the role), `hackforge:craftsman` for assets — up to the profile's parallel limit, each with the role's model. Give each: its task and owned paths, the milestone contract, CONTRACTS.md, RULES, DIRECTIVES. Builders start fresh — pass everything they need; never "see above".
   **With a ready crew,** hand tasks to it first: one `mcp__harness__crew_dispatch` call with a mission per task (at most one running per crew member; never two missions on the same owned paths), then local builders for the rest. A mission brief is a builder brief: role, task, owned paths, the paths of the contract, CONTRACTS.md, DESIGN.md and RULES.md to read, the yes/no DoD with its commands, and "return the worker report JSON in mcp__crew__report". Model per the profile's role model (`sonnet` on lean). Set the task's `owner` to `crew:<name>` in the milestone contract. While missions run, do the local tasks; then `mcp__harness__crew_wait` until each mission reports (reports also arrive as "[crew]" messages). Answer crew questions with `mcp__harness__crew_message`. A mission that ends `limited` moves to another crew member by itself; one that ends `blocked` or `failed` gets the same treatment as a failed builder (step 4), locally or as a new mission.
2. When a measurable target exists, the data-ml task starts with `/hackforge:eval` before any model work.
3. When the wave returns, run `hackforge:integrator` to merge, run the gate and walk the demo path. Crew branches are on the remote (`origin/crew/<name>/<mission>`): give the integrator those names too.
4. If a task failed its DoD twice with the same error, consult `hackforge:advisor` (reason_code `retry-threshold`) and relaunch with its advice; escalate the model one step only if the advice is to keep the approach. Stop after the contract's `max_iterations` and report it.
5. Run `hackforge:verify` on the milestone. Fix failing rules and red checks before starting the next milestone.
6. Update STATE.md, the contract's `status`, and the task list; regenerate `tools views progress`; commit `M<n>: <summary> (J/R/D)`.

If a milestone overruns its time-box by 50 %, cut scope from the cut list, note it in DECISION.md, and keep the last green state submittable.

## 4. Finish

When the planned milestones are green: run the `hackforge:pitch` skill (README, DEMO.md, slides/video as the deliverables require), then `hackforge:verify`. If `loop.enabled` is true in the yaml (default) or the user ran `/hackforge:run`, continue with `hackforge:perfect`. Otherwise report: what's built, gate status, mock score, and the suggested next step.
