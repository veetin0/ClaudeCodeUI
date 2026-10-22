---
name: kickoff
description: Starts a hackathon or challenge — reads everything in the challenge/ folder (brief, rules, data, assets, team prompts, config), researches the domain, scouts every kind of deliverable (code, 3D, audio, video, hardware…), generates and scores solution options, and decides what to build. Use when the user has a challenge brief or a filled challenge/ folder and wants to start.
argument-hint: "[extra brief file/URL/text] [--profile sprint|standard|deep|max] [--auto] [--focus \"…\"]"
---

# HackForge kickoff

Extra input: $ARGUMENTS

Goal: decide on **the strongest possible entry for this specific challenge** — the one that scores highest against the judging criteria, breaks no rule, and can be finished in time. Kickoff ends with a decision; `/hackforge:build` makes it real.

Everything is written under `.hackforge/` (the project's memory, reloaded after compaction). Keep `.hackforge/STATE.md` current using `${CLAUDE_PLUGIN_ROOT}/skills/kickoff/templates/STATE.md`.

## Phase 0 — Configuration and inputs

1. If there's no `challenge/` folder, run the `hackforge:init` skill first, then continue with whatever the user provided in `$ARGUMENTS`.
2. Read `challenge/hackforge.yaml` (all fields optional). CLI flags in `$ARGUMENTS` override it.
3. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" scan challenge` and `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" toolcheck` (the launcher finds a working Python and works on macOS, Linux and Windows; never call `python3` directly). Save both outputs to `.hackforge/INVENTORY.md`. Extract archives first if any are listed.
4. **Directives:** compile `.hackforge/DIRECTIVES.md` from, in order: every file in `challenge/prompts/`, the yaml's `allow`, `forbid`, `stack_preferences` and `modalities`, and any `--focus` text or free instructions in `$ARGUMENTS`. Number each line and note its source. Directives override HackForge defaults, never an official rule.
5. **Lessons from earlier hackathons:** run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools lessons-show`. Add each saved lesson to DIRECTIVES.md under a separate *Lessons (advisory)* heading — they inform choices but never override this event's rules or the team's directives.
6. **Plan and profile:** read `plan:` (auto = pro) and `profile:`, resolve them with `${CLAUDE_PLUGIN_ROOT}/reference/profiles.md` (`auto` → choose and record why; `plan: pro` → `lean`), then the model for each role (yaml `models:` beats the table; never Fable unless the plan rules allow it). Write plan, profile, models, limits and the verify schedule into STATE.md. Every agent launch from here on passes the role's model as the `model` parameter, and never runs more agents at once than the profile allows.

## Phase 1 — Understand

1. Read everything in `challenge/brief/` fully, then the rest of `challenge/` as needed (open data samples, look at images and asset files, read example projects). Never skim rules or judging sections. Read large PDFs page range by page range.
2. Write `.hackforge/BRIEF.md` from `${CLAUDE_PLUGIN_ROOT}/skills/kickoff/templates/BRIEF.md`: problem, what the challenge owner actually wants, given data/APIs/hardware/assets, deliverables, deadline, assumptions, and questions for the organisers.
3. In parallel:
   - `hackforge:rules-lawyer` → `.hackforge/RULES.md` (R hard rules, D deliverables, J weighted criteria, implicit expectations, each quoted from its source).
   - `hackforge:researcher` × the profile's count, each with its own focus (domain; sponsor & prior art; data audit) → `.hackforge/research/*.md`.
4. Read the results yourself and fix anything missing in RULES.md.

## Phase 2 — Widen

Run `hackforge:possibilities-scout` with BRIEF, RULES, DIRECTIVES, research and INVENTORY → `.hackforge/POSSIBILITIES.md`. This is where 3D models, CAD, audio, video, simulations, hardware, games or anything else beyond plain code gets proposed — ranked by how much it raises the score, checked against the rules and the tools on this machine.

## Phase 3 — Design options

**Crew (Harness).** When `mcp__harness__crew_status` shows ready crew, give the researcher and solution-architect work to them before launching local agents: one `mcp__harness__crew_dispatch` mission per member, each carrying the agent's full brief, the files to read, and "write your result to `.hackforge/research/<focus>.md` (or `.hackforge/options/<stance>.md`) and commit it". Run the rest locally, collect the missions with `mcp__harness__crew_wait`, and merge their branches (`git merge crew/<name>/<mission>`) before the next step. It keeps your own usage for the decision, contracts and integration.

Launch `hackforge:solution-architect` agents **in parallel**, one per stance, as many as the profile says, picking stances in this order: safe winner, ambitious, lateral, sponsor-centric, data-driven, experience, minimal. Give every one BRIEF, RULES, DIRECTIVES, research, POSSIBILITIES, time and team.

## Phase 4 — Judge and decide

1. Run the profile's judge panel (one generalist, or technical + business/sponsor + experience personas, optionally on two models) in parallel on all options. Merge: average the weighted scores per option, eliminate anything that breaks a rule, keep each judge's best graft ideas.
2. **Spike bake-off** (deep / max): for the top 2–3 options, launch `hackforge:builder` agents to build a 30–60 minute spike of the riskiest part of each — the model accuracy, the 3D pipeline, the key integration. Judge the spikes on what was actually shown; evidence replaces guesses.
3. If the best expected score is below 6/10, escalate per profiles.md and run one more lateral design round.
4. Write `.hackforge/OPTIONS.md` (all options + score tables) and `.hackforge/DECISION.md`: the chosen option, why, grafts from the others, the non-code deliverables included, the stack, and the **cut list**.

Generate the plan brief page: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools views brief` → `.hackforge/views/brief.html` (one page a teammate or mentor can read without the code).

**Checkpoint `decision`** (skip if `--auto`, if `decision` is removed from `checkpoints:` in the yaml, or if the user is clearly away): show the score table, the decision, the recommended extra deliverables (e.g. "a Blender render of the device, 4 h, raises J2"), any risky or irreversible steps the plan needs (they'll go to the advisor before running), and the path to brief.html, in a short message; wait for go / adjust.

When approved, update STATE.md. If running under `/hackforge:run`, continue with the build skill; otherwise tell the user the next step is `/hackforge:build`.

## Principles

- Rules beat cleverness. A brilliant entry that breaks R3 scores zero.
- Score what the judges score. Weight effort by J weights.
- Every modality must earn its place: propose a 3D model, a soundtrack or hardware when it raises a criterion, not because it's possible.
- A finished, smaller thing beats an unfinished bigger thing.
- Measure, don't believe. Say what's uncertain.
