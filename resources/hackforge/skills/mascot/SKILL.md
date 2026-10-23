---
name: mascot
description: Optional — builds a product around a character. For an AI product, makes a toy-like mascot that is the assistant's face in the app, the logo, and the star of a short film where it says hello, talks about the problem, jumps into the app and lives there (walks across the real UI, types into fields, presses buttons; every action changes the screen), talks with a moving mouth and expressions, and ends by diving into the logo. Use only when the product has an AI assistant or agent, or the team asks for a mascot, character, avatar or a character-led promo; never by default.
argument-hint: "[all|character|avatar|logo|film] [--hero \"description\"] [--voice own|elevenlabs|kokoro] [--length 35]"
---

# HackForge mascot — $ARGUMENTS

An option, not a style for every project. Offer it when it raises a criterion — UX, storytelling, brand, a demo video — and the product has an AI that talks to people. Skip it otherwise. Check RULES.md for generated media and third-party assets, and **never use another company's mascot as your own brand** (Clawd is Anthropic's; a project gets its own character).

## 1. The character → `.hackforge/MASCOT.md`
Write the HERO block (it's reused by the logo, the avatar and the film):
- **Shape:** one smooth toy — soft rounded bevels, no voxel grid, a silhouette that reads at 32 px. Built from 3–6 rounded boxes, capsules and cones blended together.
- **Colour:** one body colour from DESIGN.md (the film's look must make the body read *this* colour); dark eye slits; at most one prop that hints at what the product does (a hammer for a builder tool, a lens for search, a leaf for energy).
- **Face:** eyes (slits or ovals), optional brows and a mouth, placed where they can act. It has to look happy, worried, focused, surprised and overjoyed, and talk with a moving mouth.
- **Personality** in three words, and a **voice** (pitch, pace, energy).
Sketch three options in words, pick one, say in one line why it fits the product and the audience.

## 2. In the app (optional, its own builder task)
Where the AI speaks — chat bubbles, empty states, onboarding — the character appears with five states: idle (breathing), thinking (looks up, prop taps), talking (mouth flaps with streamed text or TTS), success (a hop), error (droops). Keep it light: SVG + CSS or a small canvas; 3D only if the app is 3D already. The film's moods (`template/scene/face.js`: eyes, brows, mouth shapes, blush) are the reference for the avatar's faces. Add it to the milestone contract as a task with its own owned paths.

## 3. The logo
The mark is the character's front silhouette, flat, one colour on the brand tile (eye slits cut out in the tile colour). Export `assets/logo/` as SVG and PNG at 1024, 512, 256 and 32 px, and check it at 32 px. The film renders it as its last frame too (`out/logo.png`).

## 4. The film
**The story:** the hero wakes up in a studio and says hello. It talks about the problem while the problem pops up around it as cards, and swats them away. Then it jumps through the glass of the big screen behind it into the app. Inside, the app fills the frame and the hero lives on it:
- it walks and hops from element to element, standing on buttons and fields like platforms;
- it types into fields (the real text appears under it) and presses buttons;
- it talks to you with a moving mouth and expressions;
- every action changes the screen.

At the end it hops back out, the screen shrinks into the app's icon, and the hero dives in and becomes the logo.

Read `references/film.md` first: the prompt blocks this follows, what each one does, and the lessons that make it look good. Copy `${CLAUDE_PLUGIN_ROOT}/skills/mascot/template/` to `video/mascot/` and work there; its README says what each file does. Run `./make.sh smoke` once first: it films the bundled stand-in app (`demo/`) in about a minute and proves Node, Python, Chrome and ffmpeg all work here.
1. **BRAND:** in `timeline.py`, fill HERO (colour, size on the app), APP, LOGO (tile colours, the app's current mark as `icon`), SET and MUSIC.
   - In `scene/hero.js`, write the hero's body: a signed-distance function of rounded boxes, capsules and cones, smooth-blended and meshed once with marching cubes, plus its legs and prop.
   - Also in `hero.js`, write its `FACE`: where the face plate sits, the eyes, the brows and the mouth. `scene/face.js` draws them on a plate that hugs the body, with moods: neutral, happy, joy, excited, worried, focused, surprised, proud and sleep.
2. **APP:** in `ui_states.mjs`:
   - point `url` at the running app;
   - list its screens (how to reach each, the way a user would) and the elements the hero lands on;
   - give each field it types into a `type: { target, text }`.

   `node capture_ui.mjs` screenshots each state at 3840×2160 (dark theme if it has one) and records every element's rectangle, so the hero lands on real buttons. It also captures each typing field at every step of its text, so the typing is the real app's text. An Electron app exports `launch()` instead (example in the file). Delete `demo/` once it points at the real app.
3. **LINES and PROBLEM:** a hello, the problem (one or two sentences, with 3–4 short cards that pop up), how the product fixes it, then one short line per step in the app, and the product's name over the logo. About 30–40 s in total (≈ 2.5 words/s). Each line has a `mood`.
   - `python3 voice.py` speaks them with `VOICE['engine']`:
     - `kokoro`: free, offline, natural English; the model downloads from GitHub releases;
     - `elevenlabs`: `ELEVENLABS_API_KEY` and a `voice_id`, when the rules allow;
     - `own`: the team's recordings in `recordings/<id>.wav`;
     - `silent`: timing only.
   - It also reads the mouth shapes from the audio (open, round, wide, 60 per second), so the lip sync works with any voice.
   - The voice comes first: the timeline is laid out around it.
4. **BEATS:** in `build()`:
   - `f.intro()` lays out the studio part from the voice;
   - `f.enter(t, state, target)` is the jump in;
   - `f.go(t, state, target, 'press' | 'stamp' | 'type' | 'cheer', then='next_screen')` covers each action. The hero walks when the next target is on the same row and hops otherwise. `note=` adds a rising ding; `chips=` flies files into a zone.
   - `f.say(id, t)` places a line, `f.shot(...)` overrides the camera, and `f.outro(t)` adds the finale.

   `python3 timeline.py` refuses:
   - a press that changes nothing;
   - typing without captured steps;
   - leaving before an action is done;
   - moves or lines that overlap;
   - screens that weren't captured.
5. **CHECKS before any full render:** `./make.sh check` renders up to 20 half-res stills (the studio, the problem, the jump in, every action, the jump out, the icon, the logo) and a contact sheet, `build/stills.png`. **Look at it** (and at `build/ui/`), fix, and run it again. Then render a quick full-length preview: `W=480 H=270 SUB=1 node render.mjs frames`, a few minutes, and a sheet of one frame per second. It shows camera moves and pacing that stills miss. Most of the polish comes from this step.
6. **Render:** `./make.sh` → frames, then `python3 sound.py`, then the ffmpeg mux and `out/logo.png`.
   - **Sound:** all synthesized: a hesitant pluck under the problem, the beat dropping as the hero lands in the app, an effect for every step, key press and press on its frame, and the voice on top, through a compressor and a limiter at −1 dBFS.
   - **Render time:** the template renders with Three.js in headless Chrome's software GL, so it works anywhere Node runs. That's about 1–9 s per 1080p frame on a CPU, so 1–3 h for a 35 s film. Start it in the background and keep working. One process is usually fastest (software GL already uses several cores; `JOBS=2` only on a big machine). A cut-off render resumes with `node render.mjs frames <from> <to>`.
   - **Blender (optional):** with Blender and a GPU (`hf-run.sh toolcheck`), the same `build/timeline.json` can drive a Blender scene for Cycles quality. Never a blocker.
7. **Deliver** `video/mascot/out/<name>.mp4` (1920×1080, 30 fps, H.264 + AAC) and `out/logo.png`. With the Harness pitch studio (`pitch/script.json`), copy the MP4 into `pitch/public/` and add a `screen` scene for it; never touch the narration fields.

## 5. Check
- `ffprobe`: duration, 1920×1080, 30 fps, an audio stream. `sound.py` prints the peak (≤ −1 dBFS) and the voice level over the music while the hero talks (aim for +6 dB or more).
- Extract one frame per beat and look: the body reads its colour, the UI text is legible, no light blows out on the screens, the logo is crisp.
- `hackforge:blind-judge` with five frames and the lines: does a stranger understand what the product does and remember its name?
- Record the outputs in STATE.md.
