---
name: mascot
description: Optional — builds a product around a character. For an AI product, makes a toy-like mascot that is the assistant's face in the app, the logo, and the star of a short film where it explains the product by hopping across the real UI (every hop changes the screen), talks, and ends by jumping into the logo. Use only when the product has an AI assistant or agent, or the team asks for a mascot, character, avatar or a character-led promo; never by default.
argument-hint: "[all|character|avatar|logo|film] [--hero \"description\"] [--voice own|elevenlabs|kokoro] [--length 25]"
---

# HackForge mascot — $ARGUMENTS

An option, not a style for every project. Offer it when it raises a criterion — UX, storytelling, brand, a demo video — and the product has an AI that talks to people. Skip it otherwise. Check RULES.md for generated media and third-party assets, and **never use another company's mascot as your own brand** (Clawd is Anthropic's; a project gets its own character).

## 1. The character → `.hackforge/MASCOT.md`
Write the HERO block (it's reused by the logo, the avatar and the film):
- **Shape:** one smooth toy — soft rounded bevels, no voxel grid, a silhouette that reads at 32 px. Built from 3–6 rounded boxes, capsules and cones blended together.
- **Colour:** one body colour from DESIGN.md (the film's look must make the body read *this* colour); dark eye slits; at most one prop that hints at what the product does (a hammer for a builder tool, a lens for search, a leaf for energy).
- **Personality** in three words, and a **voice** (pitch, pace, energy).
Sketch three options in words, pick one, say in one line why it fits the product and the audience.

## 2. In the app (optional, its own builder task)
Where the AI speaks — chat bubbles, empty states, onboarding — the character appears with five states: idle (breathing), thinking (looks up, prop taps), talking (mouth flaps with streamed text or TTS), success (a hop), error (droops). Keep it light: SVG + CSS or a small canvas; 3D only if the app is 3D already. Add it to the milestone contract as a task with its own owned paths.

## 3. The logo
The mark is the character's front silhouette, flat, one colour on the brand tile (eye slits cut out in the tile colour). Export `assets/logo/` as SVG and PNG at 1024, 512, 256 and 32 px, and check it at 32 px. The film renders it as its last frame too (`out/logo.png`).

## 4. The film
Read `references/film.md` first: the prompt blocks this follows, what each one does, and the lessons that make it look good. Copy `${CLAUDE_PLUGIN_ROOT}/skills/mascot/template/` to `video/mascot/` and work there; its README says what each file does. Run `./make.sh smoke` once first: it films the bundled stand-in app (`demo/`) in about a minute and proves Node, Python, Chrome and ffmpeg all work here.
1. **BRAND:** fill HERO, APP, LOGO, SET and MUSIC in `timeline.py`; write the hero's shape in `scene/hero.js` (a signed-distance function of rounded boxes, capsules and cones, smooth-blended and meshed once with marching cubes; plus its eyes, mouth, legs and prop).
2. **APP:** in `ui_states.mjs`, point `url` at the running app, list its screens (how to reach each, the way a user would) and the elements the hero lands on, and the panels the window is cut into. `node capture_ui.mjs` screenshots each state at 3840×2160 (dark theme if it has one) and records every element's rectangle, so hops land on real buttons. An Electron or native-web-view app exports `launch()` instead (example in the file). Delete `demo/` once it points at the real app.
3. **LINES:** one short line per step, 20–30 s in total (≈ 2.5 words/s). `python3 voice.py` speaks them with `VOICE['engine']`: `kokoro` (free, offline, natural English; the model downloads from GitHub releases), `elevenlabs` (`ELEVENLABS_API_KEY` and a `voice_id`, when the rules allow), `own` (the team's recordings in `recordings/<id>.wav`) or `silent` (timing only). The voice comes first: the timeline is laid out around it.
4. **BEATS:** in `build()`, every hop (`press`, `stamp`, `cheer`; `note=` adds a rising ding, `chips=` flies chips into a zone) lands on something that changes the screen, and `outro(at)` adds the finale: off the screen, the panels power down and fall, the logo rises and the hero dives in. `python3 timeline.py` refuses a hop that changes nothing, hops or lines that overlap and screens that weren't captured.
5. **CHECKS before any full render:** `./make.sh check` renders up to 18 half-res stills (the sticker, the pop, every landing, the finale) and a contact sheet, `build/stills.png`. **Look at it** (and at `build/ui/`), fix, run it again. Most of the polish comes from this step.
6. **Render:** `./make.sh` → frames, `python3 sound.py` (all synthesized: music, effects on their frames, voice on top, compressor and limiter at −1 dBFS), ffmpeg mux, `out/logo.png`. The template renders with Three.js in headless Chrome's software GL, so it works anywhere Node runs: about 1–8 s per 1080p frame on a CPU, so 30–90 min for a 25 s film. Start it in the background and keep working; one process is usually fastest (software GL already uses several cores; `JOBS=2` only on a big machine). With Blender and a GPU (`hf-run.sh toolcheck`), the same `build/timeline.json` can drive a Blender scene for Cycles quality — optional, never a blocker.
7. **Deliver** `video/mascot/out/<name>.mp4` (1920×1080, 30 fps, H.264 + AAC) and `out/logo.png`. With the Harness pitch studio (`pitch/script.json`), copy the MP4 into `pitch/public/` and add a `screen` scene for it; never touch the narration fields.

## 5. Check
- `ffprobe`: duration, 1920×1080, 30 fps, an audio stream. `sound.py` prints the peak (≤ −1 dBFS) and the voice level over the music while the hero talks (aim for +6 dB or more).
- Extract one frame per beat and look: the body reads its colour, the UI text is legible, no light blows out on the screens, the logo is crisp.
- `hackforge:blind-judge` with five frames and the lines: does a stranger understand what the product does and remember its name?
- Record the outputs in STATE.md.
