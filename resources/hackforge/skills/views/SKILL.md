---
name: views
description: Generates one-page HTML views of a HackForge project for teammates, mentors and sponsors who don't read code — plan brief (decision, options, rules), live progress (milestones, score history, open questions) and acceptance (per-criterion pass/fail with a ship / wait / reject recommendation). Use when the user wants to see or share progress, or before deciding to submit.
argument-hint: "[brief | progress | accept | all]"
---

# HackForge views — $ARGUMENTS

1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools views ${ARGUMENTS:-all}`. Pages are written to `.hackforge/views/` as single self-contained HTML files (no server, light/dark, phone-friendly).
2. Tell the user which pages were written and what each is for:
   - **brief.html** — the decision, scored options and the rules we must not break (made at the decision checkpoint).
   - **progress.html** — milestones done, mock score, loop iteration, score history. The percentage is milestones done, not an acceptance rate.
   - **accept.html** — every judging criterion and rule with pass / fail / not observed, the blind judge's first impression, open findings, and a **ship / wait / reject** recommendation (ship ≥ 80 % criteria verified with compliance and gate passing and no critical findings; wait ≥ 50 %; otherwise reject).
3. If the session can publish or attach files, offer to share the page; otherwise give the path. Generating a page never marks anything done.
