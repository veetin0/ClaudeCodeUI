---
name: video
description: Makes the pitch or demo video for a project — chooses the visual treatment from the subject (3D product hero with exploded view, digital-twin flythrough, data in motion, 3D device mockup with the real UI, Manim explainer, animated map), writes a storyboard, builds 3D models and animations, decides 3D or 2D per hero scene with a blind bake-off using HackForge's 3D pitch kit (the real app driven by a 3D cursor, a laptop or phone, an exploding product with callouts, problem cards, a logo sting, a character film), adds voiceover, music and sound effects, and renders it with Remotion in 16:9 and 9:16. Use for "make the pitch video", "demo video", "trailer", or when the rules require a video.
argument-hint: "[--length 90] [--vertical] [--no-3d] [--voice own|elevenlabs|tts]"
---

# HackForge video — $ARGUMENTS

**If `pitch/script.json` exists** (the Harness app's pitch studio), build on it instead of creating a second video project: keep its narration, voice and timing, render each 3D / animated hero shot as an MP4 into `pitch/public/` (e.g. `hero-3d.mp4`, `data-flow.mp4`), and point the matching scenes at them as `"visual": "screen", "media": "<file>", "seconds": <clip length>` — or add new `screen` scenes. Change only `visual`, `media` and `seconds`; never touch `audio`, `audioSeconds` or `audioHash`, so Harness doesn't re-bill narration. The user then previews, rehearses and renders in Harness. Build the clips in their own Remotion project under `video/` (or with the 3D kit, Blender or Manim) using the playbook below.

Read `${CLAUDE_PLUGIN_ROOT}/skills/craft/references/video-pitch.md` first; it holds the treatment table, the story structure, Remotion/Three.js setup and the sound rules.

## 1. Inputs
DECISION.md (what it is), DEMO.md (the pitch script, if it exists), RULES.md (video length, format, whether generated media or third-party assets are allowed), BRIEF.md (audience), SCORES.md (the only numbers allowed on screen), `challenge/assets/` (brand kit, 3D models, logos), DIRECTIVES.md. Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" toolcheck` to see what's installed (Node is required; Blender, ffmpeg and Manim are optional).

## 2. Treatment
Pick one hero treatment (two at most) from the table by subject, and say in one line why it fits — e.g. "switchgear product → 3D exploded view showing the monitored busbar". A product whose AI has a character (`.hackforge/MASCOT.md` exists, or the team chose a mascot) → the **character-led film** from `hackforge:mascot` can be the hero treatment, or a 20–30 s segment that the pitch video opens or closes with; build it there and bring the MP4 in as a clip. Scenes the 3D kit can do (an app walkthrough, a device, a physical product, the problem, the logo) get a bake-off in step 4. `--no-3d` or missing tools → the strongest 2D treatment instead. Respect the rules: no third-party assets if they're forbidden, label concepts as concepts.

## 3. Storyboard (cheap — approve before rendering)
Write `.hackforge/video/STORYBOARD.md`: a table of scenes with time, voiceover line, visual, motion, sound effect and the asset each needs, within the length limit (default 90 s, ~2.5 words/s). If the user is around, show it and wait for OK; otherwise proceed and note that the storyboard can still be changed.

## 4. 3D or 2D: a bake-off per hero scene
HackForge's 3D pitch kit (`${CLAUDE_PLUGIN_ROOT}/skills/video/kit3d/`; read its README) renders short Three.js clips with motion blur, bloom and shallow focus, on any machine with Node and Chrome:
- `app`: the real app filling the frame, driven by a glossy 3D cursor that glides, clicks and types; every press changes the screen;
- `device`: the app on a laptop whose lid opens, or a floating phone;
- `product`: a physical product (glTF with named parts) turning, exploding into its parts, with callouts;
- `cards`: the problem as cards popping up and swept away;
- `logo`: the tile rises and the mark shines, or the screen shrinks into the app's icon;
- `film`: the character film (`hackforge:mascot`).

For each storyboard scene the kit can do, decide with a bake-off, not by taste:
1. Copy the kit to `video/kit3d/` once and run `./make.sh smoke` (a few minutes): it proves this machine can render it. Point its `ui_states.mjs` at the running app and run `node capture_ui.mjs`.
2. Build both versions of the scene:
   - **A, 2D:** the Remotion scene, as the playbook says.
   - **B, 3D:** a clip in the kit's `story.py`, as long as the scene's voiceover line, ending with `f.end(<seconds>, fade=0)`. For a physical product, give the `product` clip a real `.glb` with named top-level parts (from `challenge/assets/`, or built in Blender per the craft playbook), not the demo model.
3. Render 3 stills of each at the same beats (the start, the key action, the end): `npx remotion still … --frame=N` for A, and `node render.mjs still <clip> <t>` for B. Put them in `video/bakeoff/<scene>-A-1.png` … `<scene>-B-3.png`, with the voiceover line in `video/bakeoff/<scene>-line.txt`.
4. Launch `hackforge:blind-judge` twice in parallel, once per version: its 3 stills, the line, and the audience from BRIEF.md. Never show one judge both versions, so each gives a first impression.
5. **Winner:** the better `vote` (yes > maybe > no). On a tie, the one whose `impression` says what the product does. If still tied, the one with fewer `lost_at`. Still tied → A, which is cheaper to change.
6. Record each bake-off in STORYBOARD.md in one line: the scene, A's and B's votes, the winner and why.
7. **A 3D winner:**
   - Render it with `./make.sh stem <clip>`. The clip carries only its effects; the narration and music stay in the pitch.
   - Copy `out/<clip>.mp4` to `video/public/` (Remotion `<OffthreadVideo>`) or `pitch/public/` (a `screen` scene with `media` and `seconds`).

**In the Harness app** the Pitch studio's **3D clips** section does the setup, stills, renders with progress, and **Add to pitch** for you; write the clips into `video/kit3d/story.py` and tell the user their names.

**Budget:** a 1080p frame takes about 1–9 s on a CPU, so a 7 s clip renders in 5–30 min. Start renders in the background and build other scenes meanwhile; a cut-off render resumes with `node render.mjs frames <clip> <from> <to>`. Skip the bake-off (and keep A) with `--no-3d`, when the smoke test fails, or when less than about two hours remain before the deadline.

## 5. Assets (in parallel, fresh agents)
Launch `hackforge:craftsman` per asset with the playbook and the asset spec: the 3D model (glTF with named parts, ≤ 10 MB), Blender clips if used, Manim scenes, Playwright screen captures of the real product at 1920×1080, charts from real data. Each one is scripted under `assets-src/` and output to `video/public/`.

## 6. Sound
Voice per `--voice` (default: ask once — own recording is best; ElevenLabs if a key is in `.env`; free system TTS for drafts). Music and sound effects as the playbook says. Generate once, cache, regenerate single scenes only.

## 7. Build and render
Remotion project in `video/`: one component per scene (a 3D winner plays its clip), durations from the voice files, word-level captions, 3D via `@remotion/three`, transitions on the voiceover beats, music ducking. Check stills of every scene (`npx remotion still … --frame=N`) and **look at them** before a full render. Render `Pitch16x9` (and `Pitch9x16` with `--vertical`), normalise loudness to −14 LUFS, check duration and format.

## 8. Check
- Launch `hackforge:blind-judge` with 5 frames (hook, reveal, demo, proof, end card) and the storyboard text, audience from BRIEF.md. Fix wherever it got lost.
- Add to gate.sh: the video exists and `ffprobe` duration ≤ the limit.
- Record the output path in STATE.md and point the user to it with one line on the treatment chosen.
