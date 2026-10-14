---
name: run
description: Runs the whole HackForge pipeline end to end from the challenge/ folder — init if needed, kickoff, build, pitch, verify and the improvement loop — stopping only at the checkpoints set in hackforge.yaml. Use when the user wants HackForge to take a challenge all the way to a finished submission.
argument-hint: "[--profile sprint|standard|deep|max] [--auto] [--focus \"…\"]"
---

# HackForge run — $ARGUMENTS

1. If `challenge/` is missing or `challenge/brief/` is empty and `$ARGUMENTS` has no brief, run `hackforge:init` and ask the user to drop the material in (this is the only reason to stop before kickoff).
2. Tell the user in one or two lines what's about to happen: profile (or "auto"), checkpoints, deadline, and that `touch .hackforge/STOP_LOOP` (PowerShell: `New-Item .hackforge/STOP_LOOP`) stops the improvement loop. If `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" doctor` fails, show its fix before starting.
3. Run, passing `$ARGUMENTS` along:
   1. `hackforge:kickoff` — stops at the `decision` checkpoint unless `--auto` or not in `checkpoints:`.
   2. `hackforge:build` — waves of parallel builders and craftsmen, integration, verification per milestone.
   3. `hackforge:pitch` (with the blind-judge pass) and `hackforge:verify final`.
   4. `hackforge:perfect` — unless `loop.enabled: false`.
4. If the session restarts, read STATE.md and resume at the recorded phase rather than starting over.
5. At the end, the checkpoint `before_submit` (if listed) shows the final VERIFY.md summary and the submission checklist before anything is submitted. HackForge never submits on the user's behalf — it prepares everything and lists the exact steps.

For an unattended run, the user should allow edits and the project's build/test commands up front (permission mode `acceptEdits` plus an allowlist), or each prompt will pause the run.
