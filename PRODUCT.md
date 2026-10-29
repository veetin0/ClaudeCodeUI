# Product

<!-- impeccable:product-schema 1 -->

> Written without an interview (the session ran unattended). Every fact below comes from the README, the code and the owner's earlier requests in this repository; lines marked *(inferred)* are readings of that evidence, not confirmed answers.

## Platform

web

Harness is an Electron app (macOS first, Windows builds exist). Its interface is web UI rendered in Chromium, with native window chrome, menus and vibrancy on macOS.

## Users

- **Primary:** a developer or student who runs Claude Code all day and wants to see what it is doing: streamed replies, every tool call, subagents, tasks, context and cost. They sit at a laptop, often with the app open next to an editor or a terminal, for hours at a time. *(inferred from the README and the feature set)*
- **Hackathon team lead:** drives a team run over a weekend event (Junction-style), with teammates' Claudes building alongside on their own plans, under deadline pressure, often late at night.
- **Teammates** never open Harness; they paste one `npx harness-crew` command. Only the lead's screen shows everything.

## Product Purpose

Run Claude Code and watch it work in real time, then steer it: start a session in a folder, follow agents as live cards, graphs and timelines, review files and diffs, handle permission prompts and questions, and keep plan usage under control. For hackathons, carry one project from an empty laptop to a finished entry: Team → Setup → Plan → Run → Done, plus challenges, partner APIs, a pitch video and the schedule.

Success is the owner's own words from the last two redesign requests: "less buttons, same effects", "super easy to use, but powerful", and now "better and more cleaner".

## Positioning

A desktop cockpit for Claude Code that shows the work as it happens rather than as a log: live agent cards with progress and metrics, a mission graph and timeline, a usage saver that plans around the 5-hour and weekly limits, and a hackathon run that splits milestones across teammates' Claude plans. *(inferred)*

## Operating Context

- Long sessions; the app stays open beside an editor. Light and dark mode both follow the system (`prefers-color-scheme`).
- Three places: **Home**, **Session** (Chat · Agents · Preview) and **Hackathon** (Build · Challenges · Pitch · Schedule). Usage and Settings open as sheets.
- The prompt box does everything: a Next step chip, the **/** menu, and a mode chip. ⌘K finds every command, place, session and action.
- Hackathon weekends: countdowns, deadlines, an inbox of permission prompts, a team board.

## Capabilities and Constraints

- Stack: Electron 44, React 19, zustand, Tailwind CSS v4 with tokens in `src/renderer/src/styles.css`, lucide icons, cmdk, Monaco, xterm.
- Every capability listed in the README must keep a home; redesigns change the look and organisation, not what the app can do.
- Dense data: tool-call strips coloured by kind, metric charts, diffs, terminal output, timelines.
- Shortcuts: ⇧⌘H Home, ⌘1–3 views, ⌘4 Hackathon, ⌘5 Usage, ⌘I side panel, ⌘J terminal, ⌘K palette, ⌘, Settings.
- Private hackathon data (MTAH match data) must never be shown in the UI or sent to a cloud model.

## Brand Commitments

- Name: **Harness**. Copy is plain, short and action-named ("Continue", "Accept and run", "Show details").
- One primary button per screen or card; everything else goes behind ⋯, the / menu or ⌘K. (Confirmed by the owner in the previous redesign.)
- The HackForge mascot "Forge" and its pitch film exist as assets for HackForge, not as app chrome.

## Evidence on Hand

- README screenshots in `docs/screenshots/` (to be retaken after this redesign).
- Demo projects and feeds used to stage screenshots live outside the repo; none of their data is real user data.
- No customers, testimonials or benchmarks exist; do not invent any.

## Product Principles

1. Show the work as it happens; the state of every agent must be readable at a glance.
2. One obvious next step per screen; power stays one click away, never on the surface.
3. Nothing is lost: every effect keeps a home when the UI changes.
4. Calm under pressure: a hackathon at 3 a.m. should read as clearly as a Tuesday afternoon. *(inferred)*

## Accessibility & Inclusion

No product-specific standard was set. Keep body text at 4.5:1, keyboard access to everything (the app is shortcut-driven), and visible focus. *(inferred)*
