---
name: help
description: Tells the user exactly what to do next with HackForge, based on where the project is — not a manual, one next step plus the few commands that matter right now. Use when the user asks "how do I use this", "what now", "what next", "help", or seems unsure which HackForge command to run.
---

# HackForge help

Look at the project (plain file checks — no agents, no tokens wasted) and answer in at most 8 lines.

| What you find | Say |
|---|---|
| No `challenge/` folder | "Run `/hackforge:init` — it asks 4 quick questions and sets everything up." |
| `challenge/brief/` empty | "Put the challenge brief and rules in `challenge/brief/` (PDFs, text, screenshots are fine), your own instructions in `challenge/prompts/`, then run `/hackforge:run`." |
| No `.hackforge/DECISION.md` | "Run `/hackforge:run` (everything) or `/hackforge:kickoff` (just decide what to build)." |
| Decision exists, no contracts / milestones not done | "Run `/hackforge:build`" — plus the decision in one line. |
| Milestones done, loop not run | "Run `/hackforge:perfect` to polish until the checks pass" (or `/hackforge:pitch` first if no DEMO.md). |
| `LOOP.json` active | The loop is running: iteration, best score, how to stop it (`touch .hackforge/STOP_LOOP`, PowerShell `New-Item .hackforge/STOP_LOOP`). |
| Loop ended | Why it ended, then "`/hackforge:verify final`, open `.hackforge/views/accept.html`, then submit yourself." |
| After the event | "`/hackforge:retro` to save lessons for next time." |

Always add, when relevant:
- Team > 1 → "teammates: `/hackforge:team join`, then `claim` a task."
- A refused edit or "approve" mentioned recently → "only you can approve changes to locked checks: `bash .hackforge/approve.sh <file> \"reason\"`."
- Pro plan → nothing extra; HackForge already keeps usage low.

End with: "Full guide: GUIDE.md in the HackForge folder."
