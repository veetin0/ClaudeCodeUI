# The character film

A 20–30 s film where the product's character explains the product on its real interface, every hop
changing the screen, and ends by jumping into the logo. The structure comes from a prompt that made a
Claude Code mascot film in Blender; the template turns it into a pipeline any project can run.

## The prompt blocks

Write `FILM.md` in these blocks before touching code. The four BRAND blocks are the ones you swap; the
rest of the brief only uses their names.

| Block | Says | Why it matters |
|---|---|---|
| **HERO** | The character as one smooth toy: proportions, features, colour (hex), "no voxel grid, soft rounded bevels" | One sentence everyone builds from: model, logo, avatar |
| **APP** | The real interface: every panel or screen, and the state each is in, with real labels | The more real the labels, the more the film reads as the real product |
| **RESULT** | What the hero's actions build up to (the finished screen, the plan, the score) | Gives the hops a direction |
| **SET** | Where it floats: panels as slabs over a dark warm studio, the UI glowing like a screen | The look in one line |
| **FORMAT** | Resolution, fps, length, BPM; which tool does what (HTML for the UI, a canvas for changing parts, 3D for the world); one `timeline` file holds the layout and every event, and everything reads it | Each tool does what it's best at; nothing drifts out of sync |
| **BEATS** | Seconds → what happens. Every hop lands on something that changes the screen | A jump that changes nothing is cut |
| **CAMERA** | Wide on the whole interface, then follows each hop at the hero's height with shallow focus, whips to each target, ends on the logo | Keeps the eye on the hero and the change |
| **LOOK** | UI as emission under black glossy glass; lights kept out of the UI reflections; bloom; 0.5 shutter blur; the body must read its colour | The line that fixes the first previews |
| **CHECKS** | UI textures and a contact sheet first, then ~18 half-res stills, then the full render | Look before spending compute |
| **SOUND** | Synthesized only (no samples): a beat at the film's BPM that drops on the pop, an effect for every event landing on its frame, the voice on top, a limiter at −1 dBFS | Every hit lands; no licensing questions |

Example (the film this template came from): HERO "Forge, a soft anvil-shaped blob, stubby legs, a
tiny hammer, warm orange #EE8A4A, two black eye slits"; APP "Harness's team run in dark theme: Team
(join command, members turning Ready), Setup (challenge text, Files and Private files drop zones),
Plan (decision and milestones, Accept and run), Run (timeline M1–M3, crew cards), Done"; RESULT "a
finished run"; SET "every panel a floating slab over a dark warm studio". BEATS: a flat sticker on the
screen knocks twice, peels off, pops into 3D (the glass cracks); hops on Start (teammates appear), Copy,
Continue, stamps the challenge in (files fly into the drop zones), hammers Accept and run, four hops
along the milestone timeline (each fills a milestone, a rising glockenspiel note each), lands on Done
(confetti); the panels power down and fall away; it dives into the app icon and becomes the logo.

## How the template is built
- `timeline.py`: the single source of truth. BRAND blocks, voice settings, the lines, hops (take-off,
  landing, target element, height, what the landing does), screen changes (ripple out from the press
  for a new step, crossfade for an update), the finale, the camera shots, and every sound cue derived
  from those events. `check()` enforces the rules. Writes `build/timeline.json`.
- `capture_ui.mjs` + `ui_states.mjs`: the real app, screenshotted per state at 2× (3840×2160) with
  Chrome's device scale (not zoom; zoom crops and enlarges), dark colour scheme emulated, and each
  target's and panel's rectangle saved. For an Electron app, `launch()` it with Playwright's
  `_electron` and push states over IPC (`promo/forge-film/capture_ui.mjs` in Harness does this).
- `voice.py`: Kokoro per line, pitched up a few semitones for a character voice (pedalboard), trimmed;
  writes durations and a per-frame loudness envelope (the hero's mouth flaps with it).
- `scene/`: Three.js in headless Chromium, every frame a pure function of time (`window.renderFrame(t)`).
  Screens are slabs whose top is an unlit shader sampling the screenshots (two textures + a ripple or
  crossfade), the hero is a marching-cubes mesh of its SDF with a physical "vinyl toy" material.
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
  a caption doubling the end card) show up in 18 half-res stills in under a minute.

## Blender (optional)
With Blender and a GPU, the same `build/timeline.json` can drive a Cycles scene: UI slabs as emission
planes under black glass (`Principled BSDF`, roughness 0.05), the hero as one smooth mesh (the SDF
exported from `scene/hero.js` as OBJ, or modelled with subdivision), AgX or Standard view transform,
0.5 shutter, bloom via the compositor's Glare node. Render 18 stills at half resolution first. Never
let it block the film: the Three.js render is the deliverable unless Blender's is done and checked.
