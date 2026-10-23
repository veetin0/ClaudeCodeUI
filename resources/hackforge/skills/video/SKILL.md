---
name: video
description: Makes the pitch or demo video for a project — chooses the visual treatment from the subject (3D product hero with exploded view, digital-twin flythrough, data in motion, 3D device mockup with the real UI, Manim explainer, animated map), writes a storyboard, builds 3D models and animations, adds voiceover, music and sound effects, and renders it with Remotion in 16:9 and 9:16. Use for "make the pitch video", "demo video", "trailer", or when the rules require a video.
argument-hint: "[--length 90] [--vertical] [--no-3d] [--voice own|elevenlabs|tts]"
---

# HackForge video — $ARGUMENTS

**If `pitch/script.json` exists** (the Harness app's pitch studio), build on it instead of creating a second video project: keep its narration, voice and timing, render each 3D / animated hero shot as an MP4 into `pitch/public/` (e.g. `hero-3d.mp4`, `data-flow.mp4`), and point the matching scenes at them as `"visual": "screen", "media": "<file>", "seconds": <clip length>` — or add new `screen` scenes. Change only `visual`, `media` and `seconds`; never touch `audio`, `audioSeconds` or `audioHash`, so Harness doesn't re-bill narration. The user then previews, rehearses and renders in Harness. Build the clips in their own Remotion project under `video/` (or with Blender/Manim) using the playbook below.

Read `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/video-pitch.md` first; it holds the treatment table, the story structure, Remotion/Three.js setup and the sound rules.

## 1. Inputs
DECISION.md (what it is), DEMO.md (the pitch script, if it exists), RULES.md (video length, format, whether generated media or third-party assets are allowed), BRIEF.md (audience), SCORES.md (the only numbers allowed on screen), `challenge/assets/` (brand kit, 3D models, logos), DIRECTIVES.md. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" toolcheck` to see what's installed (Node is required; Blender, ffmpeg and Manim are optional).

## 2. Treatment
Pick one hero treatment (two at most) from the table by subject, and say in one line why it fits — e.g. "switchgear product → 3D exploded view showing the monitored busbar". A product whose AI has a character (`.hackforge/MASCOT.md` exists, or the team chose a mascot) → the **character-led film** from `hackforge:mascot` can be the hero treatment, or a 20–30 s segment that the pitch video opens or closes with; build it there and bring the MP4 in as a clip. `--no-3d` or missing tools → the strongest 2D treatment instead. Respect the rules: no third-party assets if they're forbidden, label concepts as concepts.

## 3. Storyboard (cheap — approve before rendering)
Write `.hackforge/video/STORYBOARD.md`: a table of scenes with time, voiceover line, visual, motion, sound effect and the asset each needs, within the length limit (default 90 s, ~2.5 words/s). If the user is around, show it and wait for OK; otherwise proceed and note that the storyboard can still be changed.

## 4. Assets (in parallel, fresh agents)
Launch `hackforge:craftsman` per asset with the playbook and the asset spec: the 3D model (glTF with named parts, ≤ 10 MB), Blender clips if used, Manim scenes, Playwright screen captures of the real product at 1920×1080, charts from real data. Each one is scripted under `assets-src/` and output to `video/public/`.

## 5. Sound
Voice per `--voice` (default: ask once — own recording is best; ElevenLabs if a key is in `.env`; free system TTS for drafts). Music and sound effects as the playbook says. Generate once, cache, regenerate single scenes only.

## 6. Build and render
Remotion project in `video/`: one component per scene, durations from the voice files, word-level captions, 3D via `@remotion/three`, transitions on the voiceover beats, music ducking. Check stills of every scene (`npx remotion still … --frame=N`) and **look at them** before a full render. Render `Pitch16x9` (and `Pitch9x16` with `--vertical`), normalise loudness to −14 LUFS, check duration and format.

## 7. Check
- Launch `hackforge:blind-judge` with 5 frames (hook, reveal, demo, proof, end card) and the storyboard text, audience from BRIEF.md. Fix wherever it got lost.
- Add to gate.sh: the video exists and `ffprobe` duration ≤ the limit.
- Record the output path in STATE.md and point the user to it with one line on the treatment chosen.
