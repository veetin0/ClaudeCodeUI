---
name: init
description: Sets up a new HackForge project with a short guided setup — asks for the deadline, team size, Claude plan and how hands-off to be, then creates the challenge/ input folder, a filled-in hackforge.yaml, git, .gitignore and .gitattributes, and checks this machine (Python, Git Bash, creative tools). Use when starting a hackathon or challenge, or when the user asks how to start or where to put the challenge material.
argument-hint: "[project name]"
---

# HackForge init — $ARGUMENTS

## 1. Ask (one AskUserQuestion call, 4 questions; skip any the user already answered)
1. **Deadline** — options: "Today", "Tomorrow", "In 2 days", "Not sure yet" (Other lets them type an exact time). Turn the answer into ISO with their time zone; for a day without a time, use 12:00 local and say so.
2. **Team size** — "Just me", "2", "3–4", "5+".
3. **Claude plan** — "Pro (Recommended if unsure)", "Max", "Team", "API". This decides models and usage: on Pro HackForge never uses Fable and keeps usage low.
4. **How hands-off?** — "Ask me only before building (Recommended)" → checkpoints [decision]; "Ask me before building and before submitting" → [decision, before_submit]; "Fully hands-off" → []; "Check with me at each phase" → [decision, plan, before_submit].

## 2. Set up
1. If the folder isn't a git repo, `git init` and make an initial commit on `main` (builders use git worktrees).
2. Copy `${CLAUDE_PLUGIN_ROOT}/skills/init/skeleton/` to `./challenge/` without overwriting existing files.
3. Fill in `challenge/hackforge.yaml` from the answers: `challenge` (from `$ARGUMENTS`), `deadline`, `team`, `plan`, `checkpoints`, and `hours` (from now to the deadline). Leave `profile: auto` — kickoff picks it from the plan and the time.
4. `.gitattributes` (if missing): `* text=auto`, `*.sh text eol=lf`, `*.py text eol=lf` — keeps scripts working for Windows teammates.
5. `.gitignore` (create or extend): `.env`, `.env.*` except `.env.example`, `node_modules/`, `.venv/`, `__pycache__/`, `*.blend1`, `renders/cache/`, `.hackforge/LOOP.json`, `.hackforge/STOP_LOOP`, `.hackforge/.gate-*`, `.hackforge/.guard-errors.log`, `.hackforge/RESUME.md`, `.hackforge/evidence/`, `evals/results/`. Everything else in `.hackforge/` is committed so the team shares it.
6. If team > 1: write `.hackforge/TEAM.json` with `{"driver": "<git user.name>", "members": []}` and mention `/hackforge:team`.
7. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" doctor` and `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" toolcheck`.
8. Commit (`hackforge: init`).

## 3. Tell the user (short)
- Any ❌ from the doctor first, with the exact fix — the improvement loop can't run until it's fixed.
- **Next step, in one line:** drop the brief/rules into `challenge/brief/` (plus data, assets, and your own instructions in `challenge/prompts/`), then run `/hackforge:run`.
- Creative tools that are missing, only if relevant.
- That `/hackforge:help` shows what to do next at any point.
