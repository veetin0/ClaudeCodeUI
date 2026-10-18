---
name: perfect
description: Runs an autonomous improve–verify loop on a HackForge project that cannot stop until an objective gate passes (gate.sh green, rules compliant, integrity intact, mock judge score at target) or a recorded stop condition is hit. Checks are locked so they can't be weakened; each fix runs in a fresh builder context; a read-only advisor is consulted when the loop gets stuck. Use when the user wants the project pushed as far as it can go, "loop until it's perfect", or polishing before submission.
argument-hint: "[--target 9.0] [--max 30] [--hours N] [--deadline ISO] [--reserve 90] [--plateau 3] [--wake] [--continue] [--focus \"…\"]"
---

# HackForge perfect — $ARGUMENTS

You are entering an improvement loop. A Stop hook enforces it: every time you try to end your turn, the gate checks the project and sends you back with what's still failing. Only results end it. A guard hook blocks weakening checks, touching loop-control files and other unsafe actions — work with it, not around it.

If `$ARGUMENTS` contains `--continue`, skip setup and go straight to **Each iteration**.

## Set up (once)

0. **Driver check:** if `.hackforge/TEAM.json` names a driver who isn't `git config user.name`, say so and ask before starting — two loops on one repo fight each other.
   **Preflight:** run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" doctor`. If it fails, do **not** start the loop: tell the user the exact fix and stop. A loop that can't be enforced must never look like it's running.
1. **Settings**, in priority order: `$ARGUMENTS` → `loop:` in `challenge/hackforge.yaml` → the profile in STATE.md (`${CLAUDE_PLUGIN_ROOT}/reference/profiles.md`) → defaults (`--target 9.0`, `--max 30`, `--plateau 3`, `--reserve 90`). `--hours` / `loop.max_hours` caps wall-clock time. Deadline from `--deadline`, the yaml, or BRIEF.md.
2. Append any `--focus` text to `.hackforge/DIRECTIVES.md` and `challenge/prompts/90-live.md`.
3. Make sure `.hackforge/gate.sh` really checks build + tests + every finished milestone's DoD commands + metric threshold + required assets, portably (LF, `#!/usr/bin/env bash`, Python resolved as in the build skill). Extend it now if it's thin — after the lock it can only grow. Run it once.
4. **Permissions:** run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools permissions` and show the proposal. Merge it (`tools permissions --apply`) only if the user agrees; otherwise note that prompts will pause the loop.
5. Commit everything (`perfect: baseline`).
6. Write `.hackforge/LOOP.json`:
   ```json
   {"active": true, "mode": "hook", "iteration": 0, "max_iterations": 30, "target_score": 9.0,
    "plateau_limit": 3, "deadline": "2026-10-05T12:00:00+03:00", "reserve_minutes": 90,
    "max_hours": 12, "started_at": "<now, ISO with offset>", "best_score": null, "no_gain_streak": 0}
   ```
   `"mode": "wake"` with `--wake` (see below). `deadline`/`max_hours` may be null.
7. **Lock the checks:** `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" integrity lock --reason "loop start"`. From now on gate.sh may only grow, locked tests can't lose assertions or gain skips, lint/type/test/CI configs and the target score can't change. Only the user can approve an exception, in their own terminal: `bash .hackforge/approve.sh <path> "reason"`.
8. Tell the user in two lines: target, limits, how to stop it (`touch .hackforge/STOP_LOOP`, PowerShell `New-Item .hackforge/STOP_LOOP`), and that progress is visible in `.hackforge/views/progress.html`.
9. Run `hackforge:verify full` for the baseline, then end your turn — the gate takes over.

## Each iteration (when the gate sends you back)

1. Read the gate's message and `.hackforge/RESUME.md` (refreshed by the gate every iteration — it replaces scrolling back through history). Pick **one** item, in this order:
   1. an integrity violation → revert it (`git restore` / `git revert`), never re-word the check;
   2. an **ADVISOR REQUIRED** line → launch `hackforge:advisor` (role model from STATE.md) with an advisor-request (`${CLAUDE_PLUGIN_ROOT}/reference/schemas/advisor-request.example.json`) and save its JSON answer verbatim to the path the gate named. Then follow it: PLAN changes the approach, CORRECTION is a local fix, STOP ends the loop at the next gate check;
   3. a failing hard rule or missing deliverable;
   4. a red check in gate.sh;
   5. the highest gain-per-hour finding in verify.json.
   When everything is green, rotate the lens so the loop doesn't polish one corner forever: correctness and edge cases → robustness (bad input, empty data, offline) → measured accuracy/performance → demo flow and UX (`reference/ui-rubric.md`, plus `tools design-scan` findings) → pitch clarity (blind-judge divergence) → README and one-command setup.
2. **Hand the fix to a fresh agent** — `hackforge:builder` (code) or `hackforge:craftsman` (assets) in its worktree, with RESUME.md, the item, the milestone contract, and the yes/no DoD for this fix. Only trivial one-line fixes are done directly. Merge its branch after `tools scope` passes.
3. Run `bash .hackforge/gate.sh`. If something that was green broke, fix or revert.
4. Run `hackforge:verify quick` — or `full` when the profile's schedule says so (`reference/profiles.md`: e.g. every 4th iteration on standard) or when a quick verify reached the target (the gate asks for it). The gate rejects a verify.json older than your code.
5. Better score with gate green → commit `perfect #N: <what> (+0.3 → 8.6)`. Worse → `git revert`.
6. Append to `.hackforge/LOOP.md`: `#N | change | gate | compliance | score | kept/reverted`.
7. End your turn. Don't ask the user anything during the loop and don't end a turn "waiting" for something — record open questions in STATE.md.

## Wake mode (`--wake`, overnight or very long runs)

Each iteration starts in a fresh context instead of one growing conversation. With `"mode": "wake"` the Stop hook never blocks; instead each wake-up:
1. reads `.hackforge/RESUME.md` and does steps 1–6 above once;
2. runs `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" loopstatus` — the same gate, as JSON;
3. if `finished` is false, calls `ScheduleWakeup` (delay 270 s while working, 1200 s after a plateau warning, 3600 s overnight) with the prompt `/hackforge:perfect --continue`; if true, writes the final summary.
Start it with `/loop /hackforge:perfect --wake`.

## Ending

The gate sets `"active": false` and tells you why:
- **Done** — gate green, compliant, integrity intact, no critical findings, mock score ≥ target.
- **Plateau** — everything passes but the score hasn't risen by 0.1 for `plateau_limit` iterations.
- **Stuck** — the same failure, or the same judge findings, came back even after the advisor's advice: a human decision is needed.
- **Advisor STOP**, **iteration cap**, **time cap**, **deadline freeze**, or the user's **kill switch**.
If the gate itself can't run (e.g. no Python), the Stop hook blocks twice with the fix, then disables the loop with a visible warning — tell the user immediately.

Then write a short summary for the user: why it stopped, start → end score (`.hackforge/views/progress.html` has the chart), what changed (LOOP.md), what's still failing, any advisor decisions, anything needing their approval. If it stopped with something red, check out the last commit where gate.sh was green and say so. Offer `/hackforge:retro` once the hackathon is over.
