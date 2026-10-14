---
name: focus
description: Adds, lists or removes team directives — the team's own standing instructions for HackForge (priorities, stack, scope, style, prize to aim for, extra deliverables like a 3D render or soundtrack). Use when the user says "from now on", "focus on", "we want", or wants to steer the build mid-hackathon.
argument-hint: "[\"directive text\" | list | remove N | sync]"
---

# HackForge focus — $ARGUMENTS

- With text: append it to `challenge/prompts/90-live.md` (create if missing) and to `.hackforge/DIRECTIVES.md` as the next numbered directive, with the time. If it conflicts with a hard rule in RULES.md, say so and record it as "blocked by Rn".
- `list`: show the current directives.
- `remove N`: delete directive N from DIRECTIVES.md and from its source file in `challenge/prompts/`, then renumber.
- `sync`: rebuild DIRECTIVES.md from `challenge/prompts/` and `challenge/hackforge.yaml` (use after editing those files by hand).

Then check PLAN.md, CONTRACTS.md and DECISION.md against the change and say in one or two lines what it changes (a milestone reordered, a new asset task, something moved to the cut list). A running improvement loop picks it up on its next iteration.
