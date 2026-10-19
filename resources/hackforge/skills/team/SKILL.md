---
name: team
description: Coordinates a hackathon team on one HackForge project — join (pull, check this machine, show my tasks), claim a task, see who's doing what, hand off work, and choose who drives the improvement loop. Use when several people (each with their own Claude, Mac or Windows) work on the same repo, or when someone says "I'll take the frontend", "what should I do", "who's on what".
argument-hint: "join | claim <task> [name] | who | handoff | driver [name]"
---

# HackForge team — $ARGUMENTS

Everyone runs their own Claude Code with HackForge installed, on their own machine. The shared state is the git repo: `.hackforge/` (rules, plan, contracts, lock, verify.json, views) is committed; per-machine files (LOOP.json, RESUME.md, evidence, caches) are not. Your name is `git config user.name`.

**Using the Harness app?** Its event-mode Team board already shares each laptop's branch, sessions, HackForge phase, loop status and remaining Claude usage through a relay — use it to see who has usage left before claiming. This skill handles the git side (claims, handoffs, driver), which the board doesn't.

**Crew mode (Harness).** The simplest way to team up: only the driver runs Harness and HackForge. Teammates run `npx harness-crew <join code>` in a terminal and leave it open; build and the loop then hand tasks to their Claudes as missions (on their own Claude plans and branches), and the integrator merges the pushed branches. Nobody else types anything. The rest of this skill is for teams where everyone drives their own Claude.

**One driver.** Only the driver runs `/hackforge:perfect` or `/hackforge:run`; two loops on one repo fight each other. Everyone else works on claimed tasks on their own branch, and the driver merges them.

## join
1. `git pull --rebase`, then `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" doctor` (Windows teammates: it checks Python, Git Bash and line endings) and fix anything ❌.
2. Regenerate `.hackforge/RESUME.md` (`hf-run.sh tools resume`) and read it plus RULES.md.
3. Show this person: the driver (from `.hackforge/TEAM.json`), their claimed tasks, unclaimed tasks that fit them, and `.hackforge/views/progress.html`.

## claim <task> [name]
1. `git pull --rebase`. In `.hackforge/contracts/M<n>.json`, set the task's `"owner"` to the name (default: `git config user.name`). If someone else already owns it, stop and say who.
2. Commit only that file (`team: <name> claims <task>`) and push immediately, so nobody claims it twice.
3. Create a branch `<task>-<name>` and work there. Keep to the task's `owned` paths — the driver's scope check rejects files outside them. Guardrails and the lock apply on every machine.

## who
List every task with owner (person or `agent`), status, and branch, plus the driver and recent commits per person (`git log --since=6.hours --format='%an %s'`). Never changes anything.

## handoff
Write `.hackforge/handoffs/<name>-<YYYYMMDD-HHMM>.md`: what's done (with commands actually run and their results), what's open, what's verified vs only planned, the next step to try. Commit and push it with the branch, and set the task status in the contract.

## driver [name]
Set or show who drives the loop in `.hackforge/TEAM.json` (`{"driver": "<name>", "members": [...]}`), commit and push. `/hackforge:perfect` warns and asks before starting if you're not the driver.

The driver merges teammates' branches like any builder's: scope check → merge → gate → `integrity check` (`hackforge:integrator`).
