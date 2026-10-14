# HackForge — Setup & How-to Guide

HackForge is a Claude Code plugin that takes a hackathon or coding challenge from raw material (brief, rules, data, assets) to a polished, rule-compliant submission, and keeps improving it until objective checks pass.

**Contents**
1. [Setup (once)](#1-setup-once)
2. [Your first run: a 10-minute tutorial](#2-your-first-run--a-10-minute-tutorial)
3. [The challenge/ folder](#3-the-challenge-folder)
4. [hackforge.yaml explained](#4-hackforgeyaml-explained)
5. [Choosing a profile](#5-choosing-a-profile)
6. [What happens during a run](#6-what-happens-during-a-run)
7. [Steering it mid-hackathon](#7-steering-it-mid-hackathon)
8. [The improvement loop](#8-the-improvement-loop)
9. [3D models, audio, video and other assets](#9-3d-models-audio-video-and-other-assets)
10. [Puzzle and algorithm rounds](#10-puzzle-and-algorithm-rounds)
11. [Working as a team](#11-working-as-a-team)
12. [Command cheat sheet](#12-command-cheat-sheet)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Setup (once)

### 1.1 Prerequisites

| Tool | Why | Install (macOS) |
|---|---|---|
| Claude Code | runs the plugin | `curl -fsSL https://claude.ai/install.sh \| bash` (or `npm install -g @anthropic-ai/claude-code`) |
| git | builders work on separate branches | `xcode-select --install` |
| Python 3 | HackForge's scripts | comes with Xcode tools, or `brew install python` |
| Node.js | most web stacks | `brew install node` |

Optional creative tools. Install the ones you'd actually use; HackForge checks what's there and only proposes things it can make:

```bash
brew install --cask blender      # 3D models, renders, turntables
brew install ffmpeg              # audio + video processing (strongly recommended)
brew install --cask openscad     # parametric CAD
brew install fluid-synth sox     # music rendering, audio tools
pip3 install platformio          # Arduino / ESP32 hardware
```

Log in once by running `claude` in any folder and following the prompts.

### 1.1b Windows teammates

HackForge runs on Windows through **Git Bash**, the same shell Claude Code uses for hooks.

1. Install the prerequisites in PowerShell:
   ```powershell
   winget install -e --id Git.Git
   winget install -e --id Python.Python.3.12
   winget install -e --id OpenJS.NodeJS.LTS
   ```
   Close and reopen the terminal afterwards so the new PATH is picked up.
2. **Disable the Microsoft Store "python" alias**, which otherwise answers instead of real Python: Settings → Apps → Advanced app settings → App execution aliases → turn off *python.exe* and *python3.exe*. HackForge skips the stub anyway, but other tools may not.
3. Stop git from converting scripts to Windows line endings (HackForge tolerates it, but gate.sh and your own scripts are cleaner without it):
   ```powershell
   git config --global core.autocrlf input
   ```
4. After installing the plugin (§1.2), check the machine from inside Claude Code: ask it to run `bash "<plugin folder>/scripts/hf-run.sh" doctor`, or just run `/hackforge:init`, which runs the check for you. Everything must be ✅ before using `/hackforge:perfect`.

If Python lives somewhere unusual, set the environment variable `HACKFORGE_PYTHON` to its full path (e.g. `C:\Users\you\AppData\Local\Programs\Python\Python312\python.exe`).

### 1.2 Install the plugin

1. Unzip `hackforge.zip` somewhere permanent, e.g. `~/tools/hackforge-marketplace`. Don't leave it in Downloads, because the install points at this folder.
2. Add it as a marketplace and install:
   ```bash
   claude plugin marketplace add ~/tools/hackforge-marketplace
   claude plugin install hackforge@veeti-tools
   ```
3. Check it works. Start `claude`, type `/hackforge:` and you should see `init`, `run`, `kickoff`, `build` and the rest.

To try it without installing: `claude --plugin-dir ~/tools/hackforge-marketplace/hackforge`.

### 1.3 Allow commands up front (important for long runs)

HackForge runs for hours. Every permission prompt pauses it until you click. Before a hackathon, give it permission for edits and your usual commands.

**Option A, per session:** start Claude Code with
```bash
claude --permission-mode acceptEdits
```
File edits are then auto-approved and you only approve shell commands.

**Option B, per project (recommended):** create `.claude/settings.json` in the project folder:
```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)", "Bash(python3:*)", "Bash(python:*)", "Bash(py:*)", "Bash(pip:*)", "Bash(pip3:*)",
      "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(pytest:*)",
      "Bash(bash .hackforge/gate.sh)", "Bash(bash */hf-run.sh*)", "Bash(ffmpeg:*)", "Bash(ffprobe:*)",
      "Bash(blender:*)", "Bash(/Applications/Blender.app/Contents/MacOS/Blender:*)",
      "Bash(mkdir:*)", "Bash(ls:*)", "Bash(cat:*)",
      "WebSearch", "WebFetch"
    ]
  }
}
```
Add your stack's commands too (`cargo`, `swift`, `pio`…). Check the allowlist with `/permissions` inside Claude Code.

### 1.4 Pick your model

Inside Claude Code, run `/model` and choose Opus for the main session. HackForge picks models for its own agents from the profile (see §5).

### 1.5 Updating HackForge

When you get a new version, replace the folder contents, then:
```bash
claude plugin marketplace update veeti-tools
claude plugin update hackforge@veeti-tools
```
In a running session, `/reload-plugins` picks up changes. To remove it: `claude plugin uninstall hackforge@veeti-tools`.

---

## 2. Your first run: a 10-minute tutorial

Do this once with an old or practice brief before a real event.

**Step 1: make a project folder**
```bash
mkdir ~/hacks/practice && cd ~/hacks/practice
claude --permission-mode acceptEdits
```

**Step 2: set it up**
```
/hackforge:init practice-run
```
It asks four quick questions — deadline, team size, your Claude plan (Pro / Max / Team / API) and how hands-off you want it — then creates `challenge/`, a filled-in `hackforge.yaml`, a git repo, `.gitignore` and `.gitattributes`, and checks this machine. Lost at any point? Run `/hackforge:help`.

**Step 3: drop in the material.** In Finder, copy files into `challenge/`:
- the brief and rules PDF → `challenge/brief/`
- any data → `challenge/data/`
- logos, 3D models, images → `challenge/assets/`

**Step 4: write your instructions.** Edit `challenge/prompts/00-team.md`:
```markdown
# Team directives
- Aim for the sponsor's prize, not the general one
- The demo must work offline (venue Wi-Fi is bad)
- We are 3 people; one is good at design
- Prefer Next.js + Python
```

**Step 5: check the basics.** Init already filled `challenge/hackforge.yaml` from your answers; open it only if you want to change something (e.g. a stricter `loop.target_score`).

**Step 6: run it**
```
/hackforge:run
```

**Step 7: approve the direction.** After 10–30 minutes it stops at the decision checkpoint and shows you:
- a score table of all solution options
- the recommended option and why
- suggested extra deliverables (e.g. "Blender render of the device, 3 h, raises 'Presentation'")

Reply with `go`, or adjust: `go with option B, but use A's dashboard idea and skip the video`.

**Step 8: let it build.** It plans, builds milestone by milestone, verifies, writes the pitch, and enters the improvement loop. Check in any time with `/hackforge:status`.

**Step 9: finish.** When the loop ends it writes a summary. Run `/hackforge:verify final`, practise with `.hackforge/DEMO.md`, and submit yourself. HackForge never submits for you.

---

## 3. The challenge/ folder

This is the only place you need to put things. HackForge reads all of it at kickoff.

```
challenge/
├── brief/          brief, rules, judging rubric, FAQ, terms, announcements
├── data/           datasets, sample inputs, API docs
├── assets/         3D (.blend .glb .fbx .obj .stl), CAD, images, logos, fonts, audio, video
├── prompts/        your instructions — every .md file here is a team directive
├── examples/       past winners, reference projects, sponsor product docs
└── hackforge.yaml  settings
```

Tips:
- **More raw material means better results.** Include the judging rubric, the FAQ and screenshots of organiser messages. Paste Discord or Slack announcements into a `.md` file in `brief/`.
- **Never put real secrets here.** Use a `.env` file in the project root; HackForge's `.gitignore` excludes it.
- **Zip files are fine.** HackForge extracts them before reading.
- **New material mid-event:** drop it in `brief/` and run `/hackforge:rules`.

### Good things to put in prompts/

One instruction per line. Be concrete:
- `Target the "Best use of sponsor data" prize`
- `The judges are engineers; show measured numbers, not marketing`
- `We have an ESP32 and a temperature sensor on site`
- `Use the sponsor's brand colours from assets/brand.pdf`
- `No paid APIs`
- `Make the demo understandable in 30 seconds by a non-expert`

Directives override HackForge's defaults but **never** an official rule. If one conflicts with a rule, HackForge tells you and follows the rule.

---

## 4. hackforge.yaml explained

Every field is optional.

```yaml
challenge: "ABB weak-signal foresight"   # name used in the README and pitch
deadline: 2026-10-05T12:00+03:00         # with time zone! drives the freeze before submission
hours: 24                                # total time available
team: 3                                  # people; affects how work is split

profile: auto        # sprint | standard | deep | max | auto  (see §5)

plan: pro            # pro | team | max | api | auto — on pro HackForge never uses Fable and keeps usage low
models:              # override a role's model: haiku, sonnet, opus, fable, inherit
  research: ""
  architect: ""      # e.g. "fable" on Max for the strongest ideas
  judge: ""
  build: ""
  craft: ""
  verify: ""         # e.g. "haiku" to save usage

loop:
  enabled: true      # run the improvement loop after the build
  target_score: 9.0  # mock judge score out of 10 that counts as "done"
  max_iterations: "" # empty = profile default
  max_hours: ""      # hard cap on loop time, e.g. 6
  reserve_minutes: 90  # stop changing code this long before the deadline
  plateau: 3         # stop after 3 rounds without improvement

checkpoints: [decision]        # where it waits for you: decision, plan, before_submit
modalities: suggest            # suggest | all | none | [3d, audio, video, cad, hardware, game, slides]
allow: []                      # extra services you're allowed to use
forbid: []                     # things to avoid even if the rules allow them
stack_preferences: []          # hints, e.g. [nextjs, python]
```

Common setups:
- **Hands-off overnight:** `checkpoints: []` and `loop.max_hours: 8`
- **Careful mode:** `checkpoints: [decision, plan, before_submit]`
- **Code only:** `modalities: none`
- **Always consider 3D and video:** `modalities: [3d, video]`

---

## 5. Choosing a profile

| Profile | When | What you get | Usage |
|---|---|---|---|
| `lean` | **Pro plan** (default there), any length | 2 designs, 1 judge, max 2 agents at once, quick verifies, Sonnet + a little Opus, no Fable | lowest |
| `sprint` | < 8 h, puzzle rounds | 2 designs, 1 judge, short loop | low |
| `standard` | normal 24–48 h hackathon | research, 3 designs, parallel builders, 30-round loop | medium |
| `deep` | big prize, hard problem | 2 researchers, 5 designs, 3-judge panel, prototype bake-off, 60 rounds, Opus builders | high |
| `max` | money no object | 7 designs, 2 judge panels, Fable designers/judges (Max/API plans only), 150 rounds | very high |
| `auto` | let it decide | picks sprint/standard/deep from the brief and the time available | — |

On a **Pro plan, use `lean`** (it's chosen for you when `plan: pro`). On Max/Team, start with `standard`. Use `deep` when the problem is genuinely hard or the prize is worth it. During the run, HackForge moves a role to a stronger model if a task keeps failing, and scales down when time runs short.

---

## 6. What happens during a run

| Phase | What it does | Files in `.hackforge/` |
|---|---|---|
| Config | reads yaml, scans challenge/, checks tools, compiles your directives | INVENTORY, DIRECTIVES, STATE |
| Understand | reads everything; rules and research agents in parallel | BRIEF, RULES, research/ |
| Widen | possibilities scout proposes 3D, audio, video, hardware… | POSSIBILITIES |
| Design | 2–7 architects with different stances, in parallel | OPTIONS |
| Decide | judge panel scores options; optional prototype bake-off; **checkpoint** | DECISION |
| Plan | milestones as end-to-end slices, frozen interfaces, the done-check script | PLAN, CONTRACTS, gate.sh |
| Build | waves of builders and craftsmen in parallel → integrator merges → verify | SCORES, VERIFY |
| Pitch | README, demo script, slides, video, backup demo | DEMO |
| Loop | improve → verify → commit or revert, until done | LOOP.json, LOOP.md |

Everything is saved in `.hackforge/`, so if Claude Code crashes or the laptop restarts, open `claude` in the same folder and say `continue`. A hook reloads the rules, your directives and the current phase automatically.

**Worth reading yourself:**
- `RULES.md` right after kickoff. If a rule is missing, you could be disqualified.
- `DECISION.md`, including the cut list.
- `VERIFY.md` before submitting.

---

## 7. Steering it mid-hackathon

| Situation | Do this |
|---|---|
| New priority or idea | `/hackforge:focus "prioritise the mobile view, judges will use phones"` |
| Organisers announce a change | put it in `challenge/brief/` and run `/hackforge:rules` |
| Want to see progress | `/hackforge:status`, or open `.hackforge/views/progress.html` |
| Share with a mentor or teammate who doesn't read code | `/hackforge:views` → brief / progress / acceptance pages |
| Want a check right now | `/hackforge:verify` |
| Need a specific asset | `/hackforge:craft "30-second ambient soundtrack, calm, industrial"` |
| See or remove directives | `/hackforge:focus list`, `/hackforge:focus remove 3` |
| Edited prompts/ files by hand | `/hackforge:focus sync` |

You can also just talk to it normally, e.g. "the map is too slow, fix that first". The `.hackforge/` files keep it on track.

---

## 8. The improvement loop

`/hackforge:perfect` (run automatically by `/hackforge:run`) keeps working until **objective** checks say it's done. Claude can't end it by claiming it's finished — a hook checks every time it tries to stop — and it can't make the checks easier, because they're locked.

**At the start:** HackForge proposes the permissions the run needs (you approve), commits a baseline, and **locks the checks**: gate.sh, your tests, lint/type/test/CI configs and the target score are fingerprinted.

**Each round:** pick one thing (integrity problem → advisor request → broken rule → failing check → biggest score gain per hour) → a **fresh builder** fixes it from `.hackforge/RESUME.md` → `gate.sh` → re-verify → commit if better, revert if worse → log to `LOOP.md`.

**When it gets stuck:** if gate.sh fails twice in the same way, or the judges keep raising the same findings, the loop must consult the **advisor** (read-only, Fable by default). It answers PLAN (change approach), CORRECTION (local fix) or STOP (needs you). If the same problem comes back after the advice, the loop stops and asks for a human decision instead of burning hours.

**It stops when:**
- ✅ **Done:** gate.sh passes, rules compliant, integrity intact, no critical findings, mock score ≥ target
- 📉 **Plateau:** everything passes but no improvement for N rounds
- 🧭 **Stuck / advisor STOP:** needs your decision
- 🔢 **Cap**, ⏱ **time cap**, 🕐 **deadline freeze**
- ✋ **You stop it:** `touch .hackforge/STOP_LOOP` (PowerShell: `New-Item .hackforge/STOP_LOOP`) — agents are blocked from doing this themselves
- ⚠ **Gate can't run** (e.g. no Python): it blocks twice with the fix, then disables the loop with a visible warning — never silently

**Make it stricter:** add checks to `.hackforge/gate.sh` (e.g. `npm run lint`, a minimum accuracy, "the render file exists"). Adding is always allowed; removing a locked line isn't.

**Overnight:** `/loop /hackforge:perfect --wake` runs each round in a fresh context (no growing conversation), waking itself up with `ScheduleWakeup`.

A git commit is made after every improvement, so a working version always exists. To go back: `git log --oneline` and `git checkout <commit>`.

### 8.1 Approving a change to a locked check

Sometimes a test really is wrong. Claude can't change it — it will explain why and ask you. If you agree, run this **yourself** in a terminal in the project folder:

```bash
bash .hackforge/approve.sh tests/test_api.py "expected status was wrong per the organiser FAQ"
bash .hackforge/approve.sh --all "re-baseline after milestone 3"     # relock everything
bash .hackforge/approve.sh --unlock "loop finished"                   # remove the lock
```
Every approval is logged in `.hackforge/approvals.log`.

### 8.2 Guardrails

A hook checks every command and file edit inside HackForge projects:

| Rule | What happens |
|---|---|
| G1 | Committing `.env`, keys or credentials is refused (hackathon repos are often public) |
| G2 | Force-push refused — use `--force-with-lease` |
| G3 | `--no-verify` refused |
| G4 | `git reset --hard`, `git clean -fdx` ask you first |
| G5 | `rm -r` outside the project refused |
| G6 | `sudo` asks you first |
| G7 | Agents can't edit the loop state, the lock, or create the kill switch |
| G8 | Approving locked-check changes is yours only |
| G9 | Edits that weaken locked checks are refused before they happen |
| G10 | Judges, auditor, blind judge and advisor can't write files |

The guard only acts in folders with `.hackforge/`, and if it ever fails it lets the action through (logged in `.hackforge/.guard-errors.log`) — the loop gate re-checks integrity and fails closed, so nothing weakened can pass the loop.

---

### 8.3 Pages for people who don't read code

`/hackforge:views` writes three self-contained HTML pages to `.hackforge/views/`:
- **brief.html** — the decision, scored options and the rules (made at the decision checkpoint)
- **progress.html** — milestones, mock score, loop round and score history (refreshed every loop round)
- **accept.html** — every criterion and rule as pass / fail / not observed, the blind judge's first impression, and a **ship / wait / reject** recommendation

### 8.4 Learning across hackathons

After an event, run `/hackforge:retro`. It proposes lessons from what kept failing (e.g. "judges always flagged an unmeasured accuracy claim"), you pick which to keep, and they're saved to `~/.hackforge/lessons.md`. Every future kickoff loads them as advisory directives.

---

## 9. 3D models, audio, video and other assets

HackForge proposes non-code deliverables when they would raise a judging criterion, and makes them as re-runnable scripts:

| Type | Tools | Typical use |
|---|---|---|
| 3D | Blender (headless), glTF | product renders, digital twin, turntable for the video, web/AR viewer |
| CAD | CadQuery, OpenSCAD | enclosures, printable parts, dimensioned drawings |
| Audio | Python synthesis, MIDI + FluidSynth, ffmpeg | sound design, data sonification, narration, music bed |
| Video | Playwright capture, Remotion, Manim, ffmpeg | demo video, trailer, animated explainer |
| Hardware | PlatformIO, Wokwi simulator | sensor prototypes, physical demo |
| Interactive | three.js, model-viewer, Godot | browser 3D, games, simulations |
| Pitch | SVG, slides, Playwright screenshots | logo, slides, one-pager |

Sources live in `assets-src/<name>/` and outputs in `assets/<name>/`. Re-run the build command to regenerate. Credits and licences go in `assets/CREDITS.md`.

Outside a hackathon you can use it directly:
```
/hackforge:craft "low-poly wind turbine, Blender, hero render + glb for the web"
```

If a tool is missing, it tells you the install command or makes the best alternative (e.g. a three.js model instead of a Blender render).

---

## 10. Puzzle and algorithm rounds

```
/hackforge:solve problem.txt --lang cpp
```
It restates the constraints, writes tests from the examples, writes a brute force, writes the fast solution, then stress-tests the two against each other on thousands of random inputs and times it on the biggest input. Use the `sprint` profile for these events.

---

## 11. Working as a team

Each teammate installs HackForge (Mac or Windows) and clones the repo. `.hackforge/` is committed — rules, plan, contracts, the lock and the pages are shared; per-machine files aren't.

- **One driver** runs `/hackforge:run` / `/hackforge:perfect`. Set it with `/hackforge:team driver <name>`. Two loops on one repo fight each other, so the loop asks before starting on someone else's machine.
- **Teammates:** `/hackforge:team join` (pulls, checks the machine, shows your tasks) → `/hackforge:team claim M2.2` (marks it yours and pushes, so nobody doubles up) → work on branch `M2.2-<name>` inside the task's owned paths → `/hackforge:team handoff` when done.
- **The driver merges** teammates' branches like any builder's: scope check → merge → gate → integrity check.
- `/hackforge:team who` shows who's on what. Teammates can add ideas as files in `challenge/prompts/` and run `/hackforge:focus sync`.
- Guardrails and the lock work on every machine; approvals stay with whoever runs `bash .hackforge/approve.sh` in their own terminal (the script finds HackForge on that machine).

---

## 11b. The pitch video

`/hackforge:video` (also run by `/hackforge:pitch` when a video is needed) picks a visual treatment from what you built:

| You built | The video uses |
|---|---|
| a physical product / device | a 3D hero that orbits and explodes into parts, with labels on the part that matters |
| a digital twin / site / scan | a 3D flythrough with tags appearing in place |
| a data / AI / forecasting tool | data in motion: signals flowing into the model, charts drawing themselves, counters |
| an app | your real screen recording inside a 3D phone or laptop, zooming into the key click |
| an algorithm / science | a Manim explainer |
| mobility / logistics | an animated route map |

It writes a storyboard first (cheap to change), builds the 3D model and animations as scripts, adds voiceover (your own recording, ElevenLabs, or free system TTS for drafts), music and sound effects with proper mixing, renders 16:9 (+ 9:16 with `--vertical`) in Remotion, checks frames with the blind judge, and adds a length check to gate.sh. Needs Node; Blender, ffmpeg and Manim are optional. Full playbook: `skills/craft/references/video-pitch.md`.

---

## 12. Command cheat sheet

```
/hackforge:init [name]            guided setup (4 questions)
/hackforge:help                   what to do next
/hackforge:team join|claim|who|handoff|driver   teammates
/hackforge:video [--vertical]     pitch video with 3D/animation by subject
/hackforge:run                    everything end to end
/hackforge:kickoff                understand → widen → design → judge → decide
/hackforge:build                  plan → contracts → parallel build → integrate → verify
/hackforge:pitch                  README, demo script, slides, video
/hackforge:perfect [--wake]       locked-checks improvement loop (wake = fresh context per round)
/hackforge:verify [final|--blind] evidence + auditor + judge panel (+ blind judge) → verify.json
/hackforge:craft "<asset>"        3D / CAD / audio / video / hardware / pitch asset
/hackforge:eval                   metric, validation split, baseline, run log
/hackforge:solve <problem>        algorithmic problem with stress testing
/hackforge:focus "…"|list|remove N|sync   your directives
/hackforge:rules                  apply organiser updates
/hackforge:status                 where are we, what's next
/hackforge:views [all]            brief / progress / acceptance pages
/hackforge:retro                  save lessons for the next hackathon

bash .hackforge/approve.sh <path> "reason"   YOU approve a change to a locked check

touch .hackforge/STOP_LOOP        stop the loop after the current round (PowerShell: New-Item .hackforge/STOP_LOOP)
bash <plugin>/scripts/hf-run.sh doctor   check Python, Git Bash, git and line endings
```

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| `/hackforge:` commands don't appear | `claude plugin list` to check it's installed and enabled; `/reload-plugins`; reinstall from §1.2 |
| It keeps stopping for permission | set up §1.3; check `/permissions` |
| The loop never ends | check `.hackforge/LOOP.md` for what's failing; lower `target_score`; set `max_hours`; or `touch .hackforge/STOP_LOOP` |
| The loop ended too early | raise `target_score` or `plateau`; make `gate.sh` stricter |
| "verify.json is older than your latest code change" | normal: it re-runs verify. If it repeats, check that nothing keeps rewriting files (e.g. a watcher) |
| A model isn't available (e.g. fable) | set `plan:` correctly in the yaml (on Pro, Fable is never used); or set `models:` |
| Blender not found | `brew install --cask blender`; run `/hackforge:init` again to re-check tools |
| Builders can't see the latest code | worktrees branch from `main`, so commit to main first (HackForge does this; check `git status` if you edited by hand) |
| Using too much usage | `profile: standard` or `sprint`, `models.verify: haiku`, lower `loop.max_iterations` |
| Windows: "Python was not found; run without arguments to install from the Microsoft Store" | Install real Python (§1.1b), turn off the app execution aliases, reopen the terminal; run the doctor |
| Windows: `$'\r': command not found` in your own scripts | CRLF line endings: `git config --global core.autocrlf input`, then `sed -i 's/\r$//' script.sh` (HackForge's own scripts and gate.sh already tolerate CRLF) |
| Windows: gate runs in WSL instead of Git Bash | HackForge always prefers Git Bash; run the doctor — it flags WSL's bash |
| "HackForge G9/I4 …" — an edit was refused | Claude tried to weaken a locked test or check. It should fix the code instead; if the test is truly wrong, approve it yourself (§8.1) |
| "ADVISOR REQUIRED" in the loop | Normal: the loop is stuck and must consult the advisor before continuing |
| Loop ended "stuck — needs a human decision" | Read the advisor's answer in `.hackforge/advisor/` and `LOOP.md`, decide, then `/hackforge:perfect` again |
| Session crashed or laptop restarted | `cd` to the project, `claude`, type `continue` |
