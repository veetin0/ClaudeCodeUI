# Product

<!-- impeccable:product-schema 1 -->

> What Harness is, who it's for and what it must keep doing. Design work on the app (including the impeccable design skill, which reads this file) starts here; the visual system itself is in [DESIGN.md](DESIGN.md).

## Platform

web

Harness is an Electron app (macOS first, Windows builds exist). Its interface is web UI rendered in Chromium, with native window chrome, menus and vibrancy on macOS.

## Users

- **Primary:** a developer, student or maker who wants to turn an idea into a real, professional product with Claude: they describe it, Claude plans it, ECC's agents build, test and score it, and they steer and improve it from one page.
- **Everyday Claude Code user:** runs Claude Code all day and wants to see what it is doing: streamed replies, every tool call, subagents, tasks, context and cost. They sit at a laptop, often with the app open next to an editor or a terminal, for hours at a time.

## Product Purpose

Build projects from a single idea: Build it creates the project and runs ECC's pipeline (PRD → plan → MVP built in slices by builder and evaluator agents → review → polish), and the Project place shows the stage, the evaluator's scores and what was written, with one box to make it better, plus API keys, more tools from ECC's catalog and a promo video. Underneath, run Claude Code and watch it work in real time: follow agents as live cards, graphs and timelines, review files and diffs, handle permission prompts and questions, and keep plan usage under control.

Success means fewer buttons with the same power: easy to use, and clean enough to read at a glance.

## Positioning

A desktop studio for building with Claude Code: one idea in, a planned, built, scored and reviewed product out, with ECC's agents doing the work and every step visible as it happens (live agent cards, a mission graph and timeline, the evaluator's scores), and a usage saver that plans around the 5-hour and weekly limits.

## Operating Context

- Long sessions; the app stays open beside an editor. Light and dark mode both follow the system (`prefers-color-scheme`).
- Three places: **Home** (Build it), **Session** (Chat · Agents · Preview) and **Project** (Build · Promo · Keys). Usage and Settings open as sheets.
- The prompt box does everything: the **/** menu (ECC's build flow first) and a mode chip. ⌘K finds every command, place, session and action.
- Builds run for an hour or more: the stage, the scores and "Claude needs you" must read at a glance when you come back.

## Capabilities and Constraints

- Stack: Electron 44, React 19, zustand, Tailwind CSS v4 with tokens in `src/renderer/src/styles.css`, lucide icons, cmdk, Monaco, xterm.
- Every capability listed in the README must keep a home; redesigns change the look and organisation, not what the app can do.
- Dense data: tool-call strips coloured by kind, metric charts, diffs, terminal output, timelines.
- Shortcuts: ⇧⌘H Home, ⌘1–3 views, ⌘4 Project, ⌘5 Usage, ⌘I side panel, ⌘J terminal, ⌘K palette, ⌘, Settings.
- API keys never go into a prompt or a file other than the project's git-ignored `.env`.

## Brand Commitments

- Name: **Harness**. Copy is plain, short and action-named ("Continue", "Accept and run", "Show details").
- One primary button per screen or card; everything else goes behind ⋯, the / menu or ⌘K.

## Evidence on Hand

- README screenshots in `docs/screenshots/`; the agent views (board, mission, agent detail, results) were taken before 0.2 and still show the old sidebar row.
- Demo projects and feeds used to stage screenshots live outside the repo; none of their data is real user data.
- No customers, testimonials or benchmarks exist; do not invent any.

## Product Principles

1. Show the work as it happens; the state of every agent must be readable at a glance.
2. One obvious next step per screen; power stays one click away, never on the surface.
3. Nothing is lost: every effect keeps a home when the UI changes.
4. Calm over long runs: a build you come back to after an hour should read as clearly as the moment you started it.

## Accessibility & Inclusion

No product-specific standard was set. Keep body text at 4.5:1, keyboard access to everything (the app is shortcut-driven), and visible focus.
