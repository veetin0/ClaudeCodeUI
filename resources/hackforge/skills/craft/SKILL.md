---
name: craft
description: Makes a non-code asset for a project — 3D models and renders (Blender), CAD parts, audio and music, video and motion graphics, hardware firmware, game/interactive scenes, pitch visuals — as a scripted, reproducible pipeline. Use when the user asks for a 3D model, render, sound, soundtrack, video, CAD part, or similar, inside or outside a HackForge run.
argument-hint: "<what to make> [--format glb|png|wav|mp4|stl…] [--spec \"…\"]"
---

# HackForge craft — $ARGUMENTS

1. Work out the asset: what it is for (which J, where it's shown), format, size/length/resolution, style, and any source material in `challenge/assets/`. Record the spec in `.hackforge/CONTRACTS.md` under *Assets* if a project exists.
2. Read the playbook(s) that match in `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/`:
   - `3d-blender.md` — modelling, materials, renders, turntables, glTF export
   - `cad.md` — parametric parts, 3D printing, technical drawings
   - `audio.md` — sound design, music, sonification, narration
   - `video.md` — demo videos, trailers, motion graphics, explainers
   - `video-pitch.md` — the full pitch video: treatment by subject, 3D in Remotion, story, sound (or run `/hackforge:video`)
   - `hardware.md` — microcontrollers, sensors, firmware
   - `game-interactive.md` — browser 3D, game engines, AR/WebXR
   - `pitch-assets.md` — logos, brand, slide visuals, one-pagers
3. Inside a HackForge run, delegate to `hackforge:craftsman` (worktree, profile model). For a standalone request, follow the playbook directly.
4. Check the result with your own eyes and ears: render preview frames and look at them, analyse audio levels and duration, check video length/resolution, validate meshes. Iterate until it's demo quality.
5. Report the paths, the one-command rebuild, and preview images.
