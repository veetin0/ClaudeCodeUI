---
name: status
description: Shows where a HackForge project stands — phase, profile and models, milestones and parallel tasks, assets, best score, loop progress, time left, compliance and next action. Use when the user asks for status, progress, "where are we" or what to do next.
---

# HackForge status

Read `.hackforge/RESUME.md` (or STATE.md, PLAN.md, verify.json, LOOP.json, LOOP.md), run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" integrity status`, `git log --oneline -10`, and regenerate `tools views progress`. Reporting status never changes anything else. Reply in at most twelve lines:

- Phase, profile, and current milestone, with ✅/⬜ per milestone
- Assets (3D, audio, video…) planned vs done
- Time used vs budget/deadline, and whether the polish reserve is intact
- Best measured metric vs baseline, and the latest mock score
- Loop: iteration / max, best score, plateau streak (if active)
- Compliance and integrity: last verify result and lock status, or "not verified yet"
- Advisor: open or answered consultations, if any
- Pages: `.hackforge/views/progress.html` (and brief.html / accept.html if present)
- If the user needs to approve a locked-check change, the exact command: `bash .hackforge/approve.sh <path> "reason"` (they run it in their own terminal)
- The single most valuable next action

If `.hackforge/` doesn't exist, suggest `/hackforge:init` then `/hackforge:run`.
