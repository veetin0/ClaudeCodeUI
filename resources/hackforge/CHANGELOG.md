# Changelog

## 2.9.0 — 2026-10-27
Reverse engineering with REA, when it's available: Harness → Settings → Dev tools → Reverse engineering, or the team's own `npx rea-agents setup`. Without it, nothing changes.
- **The researcher maps a partner's real API.** It works from their site, a saved HAR capture, or their web or Electron app, writes `.hackforge/research/partner-api.md` with REA's evidence and stated limits, and checks RULES.md and the partner's terms first.
- **Builders read `partner-api.md`.** When an SDK has no usable docs, they inspect what the partner shipped (bundle, DLL, APK) instead of guessing.
- **`/hackforge:solve` takes reversing tasks:** binaries, APKs, firmware, packet captures and WASM. It starts with static analysis, runs a target only after asking, and checks every answer with a script that runs.
- **The possibilities scout** suggests it for integrations other teams give up on, and for hardware captures.
- **Never on `private/`:** Harness's private-files guard now covers REA's tools.

## 2.8.0 — 2026-10-24
A general 3D pitch kit, and the pitch video uses 3D only where it beats 2D.
- **The 3D pitch kit** (`skills/video/kit3d/`) replaces the mascot's film template. It's one Three.js engine in headless Chrome (no GPU) with several kinds of short clip, each a function in the project's `story.py`:
  - `app`: the real app driven by a glossy 3D cursor that glides, clicks and types;
  - `device`: the app on a laptop whose lid opens and screen powers on, or a floating phone;
  - `product`: a glTF product turning, exploding into its named parts, with callouts (a demo model ships);
  - `cards`: the problem popping up in 3D;
  - `logo`: a logo sting;
  - `film`: the character film, as before.

  The scene loads only the modules a clip uses. `./make.sh stem <clip>` renders a clip with effects only, for a narrated pitch. `./make.sh smoke` renders two low-res seconds of every clip and a contact sheet.
- **A 3D-or-2D bake-off in `/hackforge:video`:** for each scene the kit can do, both versions are built. `hackforge:blind-judge` sees each one once (3 stills and the line). The better vote wins; ties go to the take that says what the product does, then to fewer "lost at", then to 2D. The result is recorded in STORYBOARD.md. A 3D winner joins Remotion or Harness's pitch studio as a clip.
- **Mascot fixes:**
  - The prop is held outside the body: an arm and a fist in the character's SDF, poses clamped to an outer sector, and `scene/check_prop.mjs` to prove no angle touches.
  - A lively character voice: Kokoro through Praat (pitch and formants moved, the melody widened, exclamations acted) instead of a phase-vocoder pitch shift. `python3 voice.py --audition` renders a few voices to pick from.
- **Fixes:** after a screen's ripple transition, a glow no longer stays at the press point. Laptop bezels and lids no longer blow out under the studio lights.
- The video playbook (`craft/references/video-pitch.md`) gains a 3D kit section, and the possibilities scout knows the kit.

## 2.7.0 — 2026-10-23
The mascot film's character now lives inside the app, and it acts.
- **New story:**
  1. The character wakes up in a studio and says hello. It talks about the problem while the problem pops up around it as cards (`PROBLEM`), then swats them away.
  2. It jumps through the glass of the big screen into the app. The app fills the frame, readable, and the character navigates it: it walks along rows, hops between elements, types into fields and presses buttons. Every action changes the screen.
  3. At the end the screen shrinks into the app's icon, and the character dives in and becomes the logo.
- **A face that acts:** `scene/face.js` draws the eyes (blink, look, ^^ squint, wide, cross or worried), the brows, the mouth (a smile, a D, an O, a wide grin), the tongue and the blush on a plate that hugs the body. There are nine moods, keyed from the beats: worried for the problem, focused with the tongue out while typing, joy on a cheer.
- **Lip sync with any voice:** `voice.py` reads the mouth shapes (open, round, wide) from the audio at 60 per second.
- **Typing is the real app's text:** `capture_ui.mjs` captures each `type` field at every step of its text, and the camera frames the field while the character types.
- **Timeline API:** `f.intro()`, `f.enter()`, `f.go(t, state, target, action, then=…)`, `f.say()` and `f.outro()`. Walks and hops come from the distance, camera shots lead the action, and the checker also refuses leaving before an action is done.
- **Sound:** a hesitant pluck under the problem, the beat dropping as the character lands in the app, plus footsteps, key presses, a light clunk, a power-on, a glass bloop and the screen-to-icon swirl.

## 2.6.0 — 2026-10-23
An optional mascot for products whose AI talks to people. Never by default: kickoff's scout proposes it only when it raises a criterion.
- **`/hackforge:mascot`:** designs the character (`.hackforge/MASCOT.md`: one smooth toy shape, one colour, a prop, a personality and a voice), its in-app avatar states (idle, thinking, talking, success, error) as a builder task, the logo from its silhouette, and a character-led film.
- **The film template** (`skills/mascot/template/`): one `timeline.py` holds every hop, screen change, line and sound cue and checks that each hop changes the screen; `capture_ui.mjs` screenshots the real app at 2× and measures what the hero lands on; Kokoro speaks the lines offline (or ElevenLabs, or the team's own recordings); Three.js renders each frame in headless Chrome with motion blur, bloom and shallow focus (no GPU needed); all sound is synthesized and lands on its frame. `./make.sh smoke` checks the pipeline in about a minute on a stand-in app.
- **Hooks:** the possibilities scout can propose a character, video's treatment table has a character-led film row, and the film can open or close the pitch video.

## 2.5.0 — 2026-10-22
Team runs with the Harness app: the app drives the build across the crew, and teammates need no GitHub access.
- **Team run protocol:** when Harness runs the build ("Harness team run" in the system prompt), build follows its "[run]" messages: Harness hands each milestone's tasks to the crew and to the driver's Claude by usage left, and says when to build, integrate, verify and finish. Contracts give every task a unique `id`, a `role` and non-overlapping `owned` paths, so they can be handed out.
- **Kickoff spreads research and architect work** across ready crew members, keeping the driver's usage for the decision and the integration.
- **Crew branches arrive locally** (`crew/<name>/<mission>`) through the Harness team server: no push to a remote and no GitHub for teammates. Build, the loop and the integrator merge them from the local repository.
- Real decisions go to the lead with `mcp__harness__crew_ask_driver` (with a suggested answer); routine crew questions are answered by the driver's Claude.

## 2.4.0 — 2026-10-19
Crew mode with the Harness app: teammates lend their Claude from a terminal (`npx harness-crew <join code>`), and the driver's Claude hands them missions. Optional: without a crew HackForge works as before.
- **Build hands tasks to the crew** (`mcp__harness__crew_dispatch`): a builder brief per task, one mission per crew member, never two on the same owned paths, bigger tasks to whoever has more usage left; local builders take the rest. `mcp__harness__crew_wait` collects the reports; contracts record `owner: crew:<name>`.
- **The loop runs fixes in parallel** on crew members, merging each `origin/crew/...` branch after the scope check.
- **The integrator fetches crew branches** from the remote; **builders running as crew missions** report through `mcp__crew__report` and ask the lead through `mcp__crew__message`.
- `/hackforge:team` explains crew mode as the zero-setup option for teammates.

## 2.3.0 — 2026-10-18
Dev tools from the Harness app (or your own MCP servers). Optional: without them HackForge works as before.
- **The verifier walks the demo in a real browser:** with browser tools (`mcp__browser__*` from Harness, or `mcp__playwright__*`) it starts the app, clicks through the flow that carries the top criteria, reads console errors and saves named screenshots under `.hackforge/evidence/`. Each step is a check; a failing step is a major finding in verify.
- **Builders check their screens in a browser** before returning (frontend), and **look APIs up instead of guessing** them with Context7 (`mcp__context7__*`), the partner kit's docs link, or WebFetch.

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
