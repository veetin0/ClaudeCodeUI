# HackForge

A Claude Code plugin that takes any hackathon or coding challenge from raw material to a polished, rule-compliant submission — and keeps improving it until objective checks say it's done. Version 2 adds the strongest ideas from [Claude Code Harness](https://github.com/Chachamaru127/claude-code-harness) (MIT): locked checks that can't be weakened, guardrails, a read-only advisor, independent read-only graders, per-milestone contracts, decision pages and lessons that carry over between hackathons.

**New here? Read [GUIDE.md](GUIDE.md) — setup tutorial and full how-to.**

## Install

```bash
claude plugin marketplace add ./hackforge-marketplace
claude plugin install hackforge@veeti-tools
```
Test without installing: `claude --plugin-dir ./hackforge-marketplace/hackforge`.

## Quick start

```bash
mkdir my-hack && cd my-hack && claude
/hackforge:init                  # 4 quick questions (deadline, team, plan, how hands-off), then sets everything up
# drop the brief and rules into challenge/brief/ (plus data, assets, your own instructions in challenge/prompts/)
/hackforge:run                   # everything, stopping only where you asked it to
/hackforge:help                  # any time: what to do next
```

## The challenge/ folder

| Folder | Put here |
|---|---|
| `brief/` | brief, rules, rubric, FAQ, organiser announcements |
| `data/` | datasets, sample inputs, API docs |
| `assets/` | 3D models, CAD, images, logos, brand kit, fonts, audio, video |
| `prompts/` | your own instructions as .md — every file becomes a team directive |
| `examples/` | past winners, reference projects, sponsor docs |
| `hackforge.yaml` | deadline, team, profile, per-role models, loop settings, checkpoints, modalities |

## Commands

| Command | Does |
|---|---|
| `/hackforge:init` | Guided setup: asks deadline, team size, plan and how hands-off; creates `challenge/`, config, git; runs the doctor |
| `/hackforge:help` | Tells you the one next step for where the project is |
| `/hackforge:team` | Teammates: `join`, `claim` a task, `who`, `handoff`, `driver` |
| `/hackforge:run` | Full pipeline: kickoff → build → pitch → verify → improvement loop |
| `/hackforge:kickoff` | Read everything → rules + research → possibilities scout → N architects → judge panel (+ spike bake-off) → decision + plan brief page. Loads your saved lessons |
| `/hackforge:build` | Vertical-slice plan → per-milestone contracts (owned paths, yes/no DoD) + gate.sh + permission proposal → parallel builders/craftsmen in worktrees → scope-checked integration → verify |
| `/hackforge:perfect` | Locked-checks improvement loop: a Stop hook won't release it until the gate passes; fresh builder per fix; advisor when stuck; `--wake` for fresh-context overnight runs |
| `/hackforge:verify [final] [--blind]` | Verifier evidence → read-only compliance auditor + judge panel (+ blind judge) + integrity → verify.json |
| `/hackforge:pitch` | README, timed demo script, slides, video, backup demo, blind-judge pass, UI rubric |
| `/hackforge:views` | One-page HTML: plan brief, progress, acceptance (ship / wait / reject) |
| `/hackforge:retro` | Turns this hackathon's failures into lessons you approve, loaded at every future kickoff |
| `/hackforge:video` | Pitch video with a treatment chosen by subject (3D product hero, digital-twin flythrough, data in motion, 3D device mockup, Manim explainer, maps), voice, music, sound effects; Remotion |
| `/hackforge:craft <asset>` | 3D (Blender), CAD, audio, video, hardware, interactive, pitch assets — scripted and reproducible |
| `/hackforge:eval` | Real metric, honest split, baseline, run log |
| `/hackforge:solve` | Algorithmic problems with brute-force stress testing |
| `/hackforge:focus "…"` | Steer mid-run; saved to `challenge/prompts/` |
| `/hackforge:rules` | Fold in announcements from `challenge/brief/` |
| `/hackforge:status` | Where things stand, integrity, advisor, next best action |

## What keeps the results honest

| Layer | How |
|---|---|
| **Integrity lock** | When the loop starts, gate.sh, tests, lint/type/test/CI configs and the target score are fingerprinted. gate.sh may only grow; tests can't lose assertions or gain skips; configs and thresholds can't change. Only you can approve an exception: `bash .hackforge/approve.sh <path> "reason"` |
| **Guardrails** (PreToolUse hook) | G1 no committing secrets · G2 no force-push · G3 no `--no-verify` · G4 confirm `reset --hard` / `clean -fdx` · G5 no `rm -r` outside the project · G6 confirm sudo · G7 agents can't touch loop control or the kill switch · G8 approvals are yours alone · G9 no edits that weaken locked checks · G10 graders can't write |
| **Loop gate** (Stop hook, fails closed) | Integrity + gate.sh + a fresh verify.json: compliance PASS, no critical findings, score ≥ target |
| **Independent graders** | Verifier records evidence; compliance auditor, judge panel and blind judge are read-only, fresh-context, and mark anything unseen as `not_observed` |
| **Advisor** | Read-only (Opus; Fable only on Max/API plans in the `max` profile), consulted once per trigger: the same failure twice, judges repeating the same findings, or a risky step. Returns PLAN / CORRECTION / STOP. If the same trigger fires again after its advice, the loop stops for a human decision instead of spinning |

## Scaling

Set `plan:` (pro / team / max / api) and `profile:` (`lean`, `sprint`, `standard`, `deep`, `max` or `auto`). On **Pro**, HackForge uses the `lean` profile: Sonnet for most work, Opus only for a few key decisions, quick verifies inside the loop, at most 2 agents at once — and **never Fable**, which isn't included in Pro limits. Override any role under `models:`; your choice always wins. Details: `reference/profiles.md`.

## Agents

rules-lawyer · researcher · possibilities-scout · solution-architect · judge (technical / business / experience) · compliance-auditor · blind-judge · advisor · builder (backend / frontend / data-ml, worktrees) · craftsman (3D / audio / video / CAD / hardware, worktrees) · integrator · verifier

## Design skills (optional)

When [impeccable](https://github.com/pbakaus/impeccable) and [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) are available (the Harness app loads both into every session; or install them as plugins), build writes one `DESIGN.md` design system before frontend work (style picked with ui-ux-pro-max), frontend builders work by impeccable's rules, and `tools design-scan` records impeccable's anti-pattern findings as evidence for the verifier, the judges and the UI rubric. Without them, nothing changes.

## Stopping the loop

`touch .hackforge/STOP_LOOP` (PowerShell: `New-Item .hackforge/STOP_LOOP`) — only you can do this; agents are blocked from it.

## Teams

Everyone installs HackForge and works in the same repo; `.hackforge/` is committed so the rules, plan, contracts and lock are shared. One person is the **driver** who runs the loop; the others `/hackforge:team join`, `claim` a task, work on their own branch inside its owned paths, and `handoff`. Guardrails and the lock work on every teammate's machine, Mac or Windows.

## Windows

Works through Git Bash. Install Git for Windows and Python 3 (not the Microsoft Store stub), set `git config --global core.autocrlf input`, then run `/hackforge:init` — its doctor check must be all ✅ before `/hackforge:perfect`. Details in GUIDE.md §1.1b.

## Evals

`evals/` holds a `claude plugin eval` suite (kickoff rule extraction, secrets guard, test-tampering) — run it after changing HackForge: `claude plugin eval . --scaffold --allow-tools Bash Write Edit Agent`. See `evals/README.md`.

## Credits

Integrity rules, guardrails, the advisor protocol, read-only reviewers, the blind judge, the UI rubric, contracts with a scope check, decision pages, plan-time permissions and the human-approved lessons loop are adapted from Claude Code Harness by Chachamaru (MIT). See NOTICE.md. HackForge reimplements them in Python/bash for a lightweight, cross-platform hackathon plugin.
