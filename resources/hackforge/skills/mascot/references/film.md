# The character film

A 30–40 s film where the product's character lives inside the product. It wakes up in a studio and
says hello. It talks about the problem (the problem pops up around it as cards) and swats it away.
Then it jumps through the glass of the big screen into the app and navigates it: it walks and hops
across the real interface, types into fields, presses buttons, and talks to you with a moving mouth
and expressions. Every action changes the screen. At the end the screen shrinks into the app's
icon, and the character dives in and becomes the logo. The look and the pipeline come from a prompt
that made a Claude Code mascot film in Blender; HackForge's 3D pitch kit (`skills/video/kit3d`, its
`film` clip) turns it into something any project can run.

## The prompt blocks

Write `FILM.md` in these blocks before touching code. The four BRAND blocks are the ones you swap; the
rest of the brief only uses their names.

| Block | Says | Why it matters |
|---|---|---|
| **HERO** | The character as one smooth toy: proportions, features, colour (hex), "no voxel grid, soft rounded bevels" | One sentence everyone builds from: model, logo, avatar |
| **FACE** | Eyes, brows and mouth, and the moods it needs (happy, worried, focused, surprised, joy) | The face is what makes it a character: people watch the eyes and the mouth |
| **PROBLEM** | The pain in one or two spoken sentences, plus 3–4 card texts that pop up while it talks | The film starts from the viewer's problem, not the product |
| **APP** | The real interface: every panel or screen, and the state each is in, with real labels | The more real the labels, the more the film reads as the real product |
| **RESULT** | What the hero's actions build up to (the finished screen, the plan, the score) | Gives the hops a direction |
| **SET** | Where it floats: panels as slabs over a dark warm studio, the UI glowing like a screen | The look in one line |
| **FORMAT** | Resolution, fps, length, BPM; which tool does what (HTML for the UI, a canvas for changing parts, 3D for the world); one `timeline` file holds the layout and every event, and everything reads it | Each tool does what it's best at; nothing drifts out of sync |
| **BEATS** | Seconds → what happens: hello, problem, the jump in, each action in the app (type, press, walk), the result, the jump out, the logo. Every action changes the screen | An action that changes nothing is cut |
| **CAMERA** | Close on the face in the studio, the whole app as it jumps in, then a follow shot that leads the hero (it gets to the next target before the hero lands), framing each typed field, out to the whole screen, ends on the logo | The face reads, every change is in frame, landings are sharp |
| **LOOK** | The app as a glowing screen behind glass; lights kept off the screen; bloom; 0.5 shutter blur; the body must read its colour | The line that fixes the first previews |
| **CHECKS** | UI textures and a contact sheet first, then ~18 half-res stills, then the full render | Look before spending compute |
| **SOUND** | Synthesized only (no samples): a beat at the film's BPM that drops on the pop, an effect for every event landing on its frame, the voice on top, a limiter at −1 dBFS | Every hit lands; no licensing questions |

Example (the Harness film, `promo/forge-film` in Harness):
- **HERO:** "Forge, a soft anvil-shaped blob, stubby legs, a tiny hammer, warm orange #EE8A4A".
- **FACE:** "tall black eye slits with a glint, small brows, a mouth that opens into a D, a tongue when it concentrates".
- **PROBLEM:** "Hackathons are chaos. Five people, five Claudes, and nobody knows who's doing what", with the cards "Who's on the API?", "Merge conflict!", "Out of usage" and "36 h left".
- **APP:** Harness's team run in dark theme.
- **BEATS:**
  1. The light clunks on and Forge wakes up. "Hi! I'm Forge!"
  2. The worried problem line while the cards pop up; it swats them, "Harness fixes that. Come on!", and the screen powers on.
  3. It jumps through the glass onto Your name and types "Veeti", stomps Start, presses Copy (teammates turn ready), then Continue.
  4. It types the challenge into Setup and stamps the files in (they fly into the drop zones), then Continue.
  5. It stamps Accept and run.
  6. It walks along the milestones, each one filling with a rising ding, and lands on Done (confetti, ^^ eyes).
  7. It hops out, the screen becomes the Harness icon, and it dives in and becomes the mark.

## How the kit builds it
- `story.py`: the project's file. It holds the BRAND blocks, the voice, the lines with their moods,
  the problem cards, and the clips; the character film is `film()`.
  - The beats are built with `f.intro()`, `f.enter()`, `f.go(t, state, target, action, then=…)`,
    `f.say()` and `f.outro()` (from `film.py`, the library).
  - From those it derives the moves (walk or hop, from the distance), the screen changes (a ripple
    out from the press for a new step, a crossfade for an update), the face keyframes, the camera
    shots and every sound cue.
  - `check()` enforces the rules. `python3 story.py film` writes `build/film/timeline.json`.
- `capture_ui.mjs` + `ui_states.mjs`:
  - The real app, screenshotted per state at 2× (3840×2160) with Chrome's device scale (not zoom;
    zoom crops and enlarges), the dark colour scheme emulated, and each target's rectangle saved.
  - Typing fields are captured at every step of their text, with no caret.
  - For an Electron app, `launch()` it with Playwright's `_electron` and push states over IPC
    (`promo/forge-film/capture_ui.mjs` in Harness does this).
- `voice.py`: per line, a WAV (Kokoro with a Praat character treatment, ElevenLabs, or the team's
  own recordings), its duration, and the mouth shapes over time read from the audio.
- `scene/`: Three.js in headless Chromium, every frame a pure function of time
  (`window.renderFrame(t)`). `main.js` loads only the modules the clip uses from `scene/lib/`.
  - **The studio (`stage.js`, `cards.js`):** a pedestal, a spotlight, the problem cards.
  - **The screen (`screen.js`, `fx.js`):** the screenshots on one plane facing the camera, with
    typing patches, a press dent, a power-on and the shrink into the icon. Its glass ripples when the
    hero passes through.
  - **The hero (`character.js`, `hero.js`, `path.js`):** a marching-cubes mesh of its SDF with a
    vinyl-toy material. It stands on the top edges of targets; the camera leads it.
  - **Its face (`face.js`):** one shader on a plate projected onto the body's surface.
  - **The logo (`logo.js`):** the tile, the hero's silhouette as the mark, the wordmark.
- `render.mjs`: stills, frames and the logo (1024×1024, transparent, a finer mesh). One process is
  usually fastest: Chrome's software GL already spreads a frame over several cores, and four
  processes on four cores ran five times slower than one.
- `sound.py`: music, effects and voice from the timeline; ducking; compressor and limiter.

## Lessons (each one cost a render)
- **Tone mapping:** three.js's AgX greys out saturated colours; Khronos PBR Neutral keeps the body and
  the logo tile their true colour. Add a little contrast after it.
- **No glass lit by lights:** a glossy physical glass layer over the UI catches the key light as a
  bright blob. Fake the glass in the screen shader (a faint sheen) and keep real lights off the UI.
- **Accumulate motion blur without auto-clear:** `renderer.autoClear = false` while adding subframes,
  or only the last subframe survives (dark, see-through frames). Use 5–6 subframes over half a frame
  so fast hops blur instead of strobing, and jitter each subframe by a fraction of a pixel instead of
  MSAA (much faster in software GL; the average is antialiased).
- **Ripples need width:** an effect that moves fast (the screen-change ring) must be wider than its
  per-subframe travel, or it shows as several rings.
- **Voice first:** speak the lines, then place the beats around their real durations; the hero's mouth
  follows the voice envelope.
- **Fog sparingly:** a little depth haze reads as "studio"; more turns the whole frame grey.
- **Flashes are outlines:** a press flash that fills a large element turns it into a bright block.
- **Look at the stills:** most problems (a light in the glass, washed-out colour, a hop out of frame,
  a caption doubling the end card) show up in 20 half-res stills in under a minute. Then a 480×270
  full-length preview (minutes) shows what stills can't: camera moves, pacing, blur.
- **The face is the character:** a mouth slit that only flaps is invisible at film size. Draw the
  face crisply (a shader on a plate that hugs the body), give it moods, and get close to it while it
  talks. Cross brows plus an open mouth read as shouting: soften a frown while it speaks.
- **Lip sync from the audio:** loudness opens the mouth, low energy rounds it (oo), high energy widens
  it (ee). Smooth it like lips (quick to open, slower to close, shut between syllables) or it twitches.
- **Typed text must be in frame:** stand the hero near where the text starts, and frame the field
  while it types.
- **Lead the action:** a follow camera that chases the hero is still moving when it lands, and the
  press blurs. Move the camera to the next target first, so it has settled by the landing.
- **Keep jumps in frame:** a big leap's arc can leave the top of the shot; lower it.
- **Props stay outside the body:** a hammer anchored inside the face block swings through the body.
  Give the character an arm and a fist in its SDF, hold the prop at the fist, and clamp every pose
  to an outer sector; `scene/check_prop.mjs` proves no angle touches.
- **A lively voice, not a chipmunk:** a phase-vocoder pitch shift sounds metallic, and a plain TTS
  voice sounds flat. Move the pitch and formants with Praat (PSOLA), widen the melody, and act the
  exclamations a little faster and higher. Let the team pick from an audition.
- **Effects that end must switch off:** a ripple left at radius 0 glows at the press point for as
  long as that screen stays.
- **Let the checker pace it:** it catches a hop that leaves before a press is done, or two lines
  running into each other. Fix the beat, not the check.

## Blender (optional)
With Blender and a GPU, the same `build/film/timeline.json` can drive a Cycles scene: UI slabs as emission
planes under black glass (`Principled BSDF`, roughness 0.05), the hero as one smooth mesh (the SDF
exported from `scene/character.js` as OBJ, or modelled with subdivision), AgX or Standard view transform,
0.5 shutter, bloom via the compositor's Glare node. Render 18 stills at half resolution first. Never
let it block the film: the Three.js render is the deliverable unless Blender's is done and checked.
