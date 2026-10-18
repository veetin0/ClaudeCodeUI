# Changelog

## 2.2.0 — 2026-10-17
Design skills (impeccable and ui-ux-pro-max), which the Harness app loads into every session. Everything is optional: without them HackForge works as before.
- **One design system per project:** build writes `DESIGN.md` (palette, type, spacing, components, what to avoid) before frontend work, picking the style with ui-ux-pro-max when it's available, and freezes it with the contracts so parallel frontend builders share one look.
- **Frontend builders use impeccable:** the builder can load skills (`Skill` tool) and works by impeccable's rules when it's available; its detector hook checks every UI edit inside the worktree.
- **`tools design-scan`:** runs impeccable's anti-pattern detector (contrast, overused fonts, gradient text, glow, nested cards…) and records `.hackforge/evidence/design-scan.json`. The verifier captures it; verify turns `quality` findings into major and repeated `slop` into minor findings; the experience judge and the UI rubric use it as evidence; VERIFY.md gets a short design-scan section. Not installed → `not_observed`, never a failure.

## 2.1.1 — 2026-10-14
Compatibility with the Harness app (ClaudeCodeUI):
- `tools verify-md` renders VERIFY.md from verify.json in the stable format the Harness dashboard parses (COMPLIANCE/MOCK_SCORE/GATE lines, compliance and score tables, fix order); verify never hand-writes it.
- `/hackforge:video` builds on Harness's pitch studio (`pitch/script.json`) when present: 3D/animated clips go to `pitch/public/` as `screen` scenes, narration untouched.
- `/hackforge:team` points to Harness's Team board for status and usage.
- Verified in an Agent SDK session configured like Harness: the guard and the Stop-hook loop gate both run.

## 2.1.0 — 2026-10-14
- **Pro plan friendly:** `plan:` setting; new `lean` profile (default on Pro): Sonnet for most work, Opus only for architects and the advisor, Haiku for checks, at most 2 agents at once, never Fable (it bills extra usage credits on Pro). Agent defaults are Pro-safe even when no model is passed.
- **Lower token use:** quick verify inside the loop (one judge on what changed, reused compliance), full verify on a schedule and always before the loop can finish as done.
- **Teams:** `/hackforge:team` (join, claim, who, handoff, driver); task owners in contracts; one-driver rule for the loop; `approve.sh` finds HackForge on any teammate's machine.
- **Easier to use:** `/hackforge:init` asks 4 questions and fills in the config; `/hackforge:help` gives the one next step.
- **Pitch video:** `/hackforge:video` chooses a treatment by subject (3D product hero with exploded view, digital-twin flythrough, data in motion, 3D device mockup with the real UI, Manim explainer, animated map), storyboard first, voice/music/sound effects, Remotion + Three.js, 16:9 and 9:16.

## 2.0.0 — 2026-10-14
Adds the strongest features of Claude Code Harness (MIT), reimplemented for hackathons.

**Honest loop**
- Integrity lock (`hf_integrity.py`): gate.sh only grows; locked tests can't lose assertions or gain skip/only/xfail; lint/type/test/CI configs and the target score can't change. Operator-only approvals via `.hackforge/approve.sh`.
- Guardrails hook (`hf-guard.py`, PreToolUse): secrets staging, force-push, `--no-verify`, `reset --hard`, `rm -r` outside the project, sudo, loop-control files, operator-only approval, weakening locked checks, writes by read-only roles.
- Loop gate v2: integrity + gate.sh + `verify.json` (JSON verdicts, critical findings block "done"), iteration ledger, advisor triggers (same failure twice, repeated findings by Jaccard similarity), "stuck" stop when a trigger fires again after advice, wake mode (`loopstatus`) for fresh-context iterations.
- Resume pack (`RESUME.md`) refreshed every iteration and before compaction (PreCompact hook).

**Agents**
- New: `advisor` (read-only, PLAN / CORRECTION / STOP), `compliance-auditor` (read-only R/D audit), `blind-judge` (rubric-free first impression).
- Judge is now read-only and works from the verifier's recorded evidence; verifier can't edit; builder/craftsman stay in contract scope, never self-stop, return a worker report.

**Workflow**
- Per-milestone contracts (owned paths, yes/no DoD, validation commands, risk tags) with a scope check before merging.
- Plan-time permission proposal (`tools permissions`).
- Decision pages: plan brief, progress (with score history), acceptance (ship / wait / reject).
- `/hackforge:views`, `/hackforge:retro` (human-approved lessons in `~/.hackforge/lessons.md`, loaded at kickoff).
- UI rubric (4 axes), blind-judge pass in pitch and final verify.
- Eval suite for `claude plugin eval`.

## 1.1.0 — 2026-10-10
Windows support: launcher that finds a working Python (skips the Store stub), CRLF-proof hooks, Git Bash instead of WSL bash, UTF-8 everywhere, doctor check, fail-closed loop gate.

## 1.0.0 — 2026-10-04
challenge/ input folder, profiles and per-role models, possibilities scout, craft playbooks (3D, audio, video, CAD, hardware), phase skills, improvement loop.
