---
name: rules
description: Re-reads or updates the challenge rules and judging criteria in .hackforge/RULES.md — e.g. after an organiser announcement, a new FAQ answer or a pasted rules update — and checks whether the current plan still complies.
argument-hint: "[new rule text, file or URL]"
---

# HackForge rules — $ARGUMENTS

1. If `$ARGUMENTS` is empty, look for files in `challenge/brief/` newer than `.hackforge/RULES.md` and use those. Save pasted text as `challenge/brief/update-<time>.md` so it's kept. Delegate to `hackforge:rules-lawyer` with the new material and the existing `.hackforge/RULES.md`. New rules get the next free ID; changed rules keep their ID and record what changed and when.
2. Compare the updated rules with `.hackforge/DECISION.md` and `.hackforge/PLAN.md`. List anything in the plan or build that now breaks or risks a rule, and anything the new information makes more valuable (a weight change, a newly allowed API).
3. Update PLAN.md if needed and tell the user in a few lines what changed and what it means for the build.
