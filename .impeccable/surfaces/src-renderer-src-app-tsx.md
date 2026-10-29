---
version: 1
slug: "src-renderer-src-app-tsx"
primary_target: "src/renderer/src/App.tsx"
related_targets: ["src/renderer/src/styles.css","src/renderer/src/layout/Sidebar.tsx"]
---

# Harness app shell (redesign)

Scope: the whole renderer (`src/renderer/src`): rail, top bar, Home, Session (Chat · Agents · Preview), Hackathon, sheets. Mode: Operate.

Audience and job: a developer running Claude Code for hours beside an editor, and a hackathon lead under a deadline. Job: see what every agent is doing, then take the one next step. Constraints: keep every capability, the three places, one primary button per card, both light and dark mode, keyboard-first.

Memorable moment: progress everywhere reads as live timing — segmented sector bars and condensed tabular readouts, so the state of the work is legible from across the room.

Unresolved: the owner has not seen this direction (the session ran unattended; the roll was degraded with no challengers).

## Direction contract

THESIS: Harness is live timing for agents. Refuses the category default: a grey macOS sidebar, white panes and one brand-orange accent with smooth progress bars.

OWN-WORLD: a graphite timing-tower rail (#15161D family) in both modes beside a cool white (light) or graphite (dark) work area; four timing colours each with one job (green running, yellow waiting for you, red failed, violet best and primary); Barlow Semi Condensed tabular figures for every readout; crisp 3–6px corners; dense 28px rows.

STORY: the visitor glances, sees which agents run, wait or fail and how far each is, and presses the one primary button.

FIRST VIEWPORT: rail left (Home, Hackathon with race clock and a five-sector run strip, sessions with status squares and condensed elapsed time, plan meter as 20 sectors). Main: top bar with Chat · Agents · Preview and a condensed status readout; the work area below.

FORM: live race-timing broadcast graphics, position 3 of 7 on the ordered list; seed:f00bc440516ea1b3. Signature move: mini-sector strips wherever progress or history shows (run steps, HackForge phases, tool calls, milestones, meters).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
