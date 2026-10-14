---
name: retro
description: After a hackathon, turns what went wrong into short lessons HackForge will load at every future kickoff — proposed from the loop ledger, judge findings and integrity hits, and saved only with the user's explicit approval. Use when the event is over, when the user says "what did we learn", or when a loop ended stuck.
---

# HackForge retro

1. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools lessons-propose`. It reads `.hackforge/ledger.jsonl` and proposes recurring patterns with a confidence (≥5 occurrences high, ≥3 medium) into `.hackforge/LESSONS.proposed.md`. It saves nothing.
2. Add what the ledger can't see: read LOOP.md, the advisor responses, DECISION.md's cut list and STATE.md's risks, and ask the user in one question what they'd do differently (and how the judging actually went, if results are out).
3. Rewrite each candidate as a short, general rule that will still make sense at a different hackathon — e.g. "Measure accuracy on a held-out split before the first verify; judges always ask", not "M3 accuracy was 0.71".
4. Show the candidates and let the user pick (AskUserQuestion, multi-select). **Save only the ones they approved**, one call each: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools lessons-add "<lesson>"` → `~/.hackforge/lessons.md`.
5. Never save lessons the user didn't approve, never write anything about other people, and never store secrets or private details. Kickoff loads the file as advisory directives.
