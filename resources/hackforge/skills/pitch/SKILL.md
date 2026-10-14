---
name: pitch
description: Produces the presentation side of a hackathon entry — a README a judge can follow in a minute, a timed demo script ordered by judging weight, slides, a one-pager and a demo video plan, using the project's real measured results and assets. Use near the end of the build or when the user asks for the pitch, demo, slides or video.
argument-hint: "[--minutes 3] [--video] [--slides]"
---

# HackForge pitch — $ARGUMENTS

Inputs: RULES (deliverables D and pitch limits), DECISION, SCORES.md, verify.json, `assets/`, DIRECTIVES.

1. **README.md** — what it is in one sentence, a screenshot or render, how to run it in one command, what's measured (numbers from SCORES.md only), architecture in a small diagram, credits/licences.
2. **.hackforge/DEMO.md** — a script for the allowed length (default 3 min), with timings: hook (the problem in the sponsor's words) → the demo moment → walk through criteria in weight order with proof → impact and what's next. Every claim maps to something that is built and verified; anything not built is "next steps", never shown as done.
3. **Slides** if a deliverable needs them (or `--slides`): build them from the demo script — one idea per slide, real screenshots, renders and charts, sponsor-appropriate visual style. Use the session's slide tooling, or a pptx/HTML deck if that's what's required.
4. **Video** if required (or `--video`): run the `hackforge:video` skill — it picks a 3D or animated treatment that fits the subject, storyboards it, builds the assets, adds voice, music and sound effects, and renders to the exact length limit.
5. **Backup plan** — a recorded demo or screenshots in case live demo fails; note it in DEMO.md.

6. **Blind test before you ship it.** Launch `hackforge:blind-judge` once per artifact (README, DEMO.md, slide images, 3–5 video frames, main screenshots) with **only** the path and one line about the audience. Wherever its 30-second take doesn't match the pitch you intended, or it got lost, rewrite that part — rubric judges miss "it doesn't land". Record the result under `blind_judge` in verify.json at the next verify.
7. **UI screens** in the pitch must score ≥ 6 on every axis of `${CLAUDE_PLUGIN_ROOT}/reference/ui-rubric.md`.

Check every deliverable against RULES (format, length, size), regenerate `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools views accept`, and update STATE.md.
