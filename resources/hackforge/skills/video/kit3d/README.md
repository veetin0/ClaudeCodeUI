# 3D pitch kit

Short 3D clips for a pitch video, rendered with Three.js in headless Chrome, so they work anywhere
Node runs. One engine with several kinds of shot. A clip can be a 5–10 s hero shot to cut into a
narrated pitch (it comes with an effects-only sound stem), or a whole 30–40 s character film with a
voice and music.

Out of the box it films a stand-in app (`demo/index.html`, "Tinker"), a procedural product, and
Forge, a soft anvil with a tiny hammer. `./make.sh smoke` renders two low-res seconds of every
clip, plus a contact sheet, in a few minutes. It proves Node, Python, Chrome and ffmpeg all work.

## The shots
| Shot | What it shows | Builder (in `story.py`) | Module |
|---|---|---|---|
| **app** | The real app filling the frame. A glossy 3D cursor glides to each target, dips and clicks (a ring spreads), and types (the field's captured text goes in). Every press changes the screen: a ripple out from the press for a new step, a crossfade for an update | `f.app(navigator='cursor')`, `f.go(...)` | `screen.js`, `cursor.js`, `fx.js` |
| **device** | The same app on a 3D laptop (the lid opens, the screen powers on) or a phone (rises in and floats). Slow orbit, push-in, close-up | `f.device('laptop')`, `f.app(mode='device')`, `f.power(t)` | `device.js` |
| **product** | A physical product on a pedestal: it turns, explodes into its parts, and labelled callouts point at them. A glTF (`.glb`) with named parts, or the bundled demo sensor | `f.product(model, explode, callouts)` | `product.js` |
| **cards** | The problem (or stats) as cards popping up in 3D, wobbling, then swept away | `f.card_beat(texts, t0, out=...)` | `cards.js` |
| **logo** | The tile rises, the mark shines, the wordmark; or, after the app, the screen shrinks into the app's icon | `f.logo()`, `f.outro_screen(t)` | `logo.js` |
| **character film** | The character wakes in a studio, says hello, talks about the problem (cards), jumps through the screen's glass into the app and navigates it (walks, hops, types, presses), talks with a moving mouth and moods, then dives into the logo | `f.app(navigator='hero')`, `f.intro()`, `f.enter()`, `f.outro()` | `hero.js`, `face.js`, `path.js`, `character.js` |

`story.py` ships one clip of each kind: `film`, `walkthrough`, `device`, `product`, `problem`, `logo`.
The scene loads only the modules a clip uses (`uses` in its timeline).

## Needs
- Node 20.11+, Python 3.10+ and ffmpeg.
- A Chrome: `CHROME_PATH`, the installed Google Chrome, or `npx playwright install chromium`.
- `make.sh` installs the npm packages (`three`, `playwright-core`) and the pip packages (`numpy`,
  `scipy`, `soundfile`, `pedalboard`, `kokoro-onnx`, `praat-parselmouth`).
- A clip that talks: the Kokoro voice model (~110 MB) downloads from GitHub releases on the first
  `voice.py`.

## Make it yours
| File | What you change |
|---|---|
| `story.py` | BRAND (HERO, APP, LOGO with your app's mark, SET, MUSIC), the VOICE, the LINES with their moods, the PROBLEM cards, and the clips: one function each, listed in `CLIPS` |
| `ui_states.mjs` | Your app's URL, its screens (how to reach each one, the way a user would), the elements the cursor or the character lands on, and `type: { target, text }` for each field it types into. `viewport = [w, h]` for a phone-sized capture |
| `scene/character.js` | Only for a character: its body (a signed-distance function), legs, prop (`PROP` poses, kept outside the body; `node scene/check_prop.mjs` checks), and `FACE` |
| `scene/lib/face.js` | Only for new moods: neutral, happy, joy, excited, worried, focused, surprised, proud, sleep |
| `assets/` | Your app's icon (transparent PNG, `LOGO['icon']`), a product model (`.glb`) |
| `recordings/<id>.wav` | Optional: your own voice lines (`VOICE['engine'] = 'own'`) |

`film.py` is the library (don't edit it for a project). Its docstrings document every builder.

## Order
1. `python3 voice.py`: only if a clip talks. Durations come first, since the beats sit around them.
   `python3 voice.py --audition` renders the first lines in a few voices (`out/audition.mp4`) to
   pick one.
2. `node capture_ui.mjs`: only if a clip shows the app. Start your app first.
3. `python3 story.py <clip>` (or `all`): writes `build/<clip>/timeline.json` and checks every rule.
4. `./make.sh check <clip>`: up to 20 half-res stills and a contact sheet (`build/<clip>/stills.png`).
   **Look at it**, fix, run it again.
5. `./make.sh <clip>`: frames, sound, `out/<clip>.mp4`. Or `./make.sh stem <clip>` for an
   effects-only sound, for a clip that goes into a narrated pitch.

`make.sh` runs steps 1–3 itself. A quick full-length preview before the real render:
`python3 story.py <clip> && W=480 H=270 SUB=1 node render.mjs frames <clip>`.

## Writing a clip
```python
def walkthrough(f):
    f.app(navigator='cursor')                        # the app fills the frame, a 3D cursor drives
    f.screen(0, 'describe_empty', 'cut')             # the first screen
    f.shot(0, 'screen')                              # the camera: the whole screen
    f.go(0.9, 'describe_empty', 'prompt', 'type', then='describe_filled')   # types the idea
    f.go(3.25, 'describe_filled', 'build', 'press', then='build_1')         # flip: a new step
    f.shot(3.5, 'follow', blend=0.9, zoom=1.6)       # leads the cursor to each target
    f.go(4.4, 'build_1', 'step1', 'press', then='build_2', how='fade', note='C6')  # an update + a ding
    f.end(9.2)                                       # its length (fade=0 for a hard cut)
```
- `f.go(t, state, target, does, then=...)` arrives at `target` at `t` and acts: `press`, `stamp`
  (a big hit with sparks), `type`, `cheer` (confetti), or `None` (just go there). `then` changes
  the screen as it lands. `note=` adds a rising ding; `chips=[(state, target)]` flies files in.
- The trip there is timed from the distance: the cursor glides; the character walks along a row
  and hops otherwise.
- `f.shot(t, name, blend, **options)` sets the camera.
  - App shots: `screen`, `focus` (rect), `follow` (zoom), `out`.
  - Device shots: `device_hero` (from/to: an orbit), `device_front` (from/to: a push-in),
    `device_close` (rect).
  - Product shots: `product_orbit`, `product_close`.
  - Studio shots: `studio_wide`, `studio_talk`, `studio_mid`.
  - `logo`, and the character's `follow` and `talk`.
- Typing frames itself: a `focus` shot on the field while the text goes in, then `follow`.
- `f.say(id, t)` places a line. `f.mood(t, mood)` sets the character's face.

## Rules the timeline checks
- Every press or stamp changes the screen (`then=`). A typing field has captured steps.
- The navigator doesn't leave before its action is done, and moves don't overlap.
- The screens exist in the capture.
- Lines don't run into each other, and the last one ends before the fade.

## In a pitch video
Render the clip with `./make.sh stem <clip>` and copy `out/<clip>.mp4` into the pitch's `public/`.
- In Remotion, play it with `<OffthreadVideo>`.
- In the Harness pitch studio, use a `screen` scene with `media` and `seconds`.

The narration and the music stay in the pitch. The clip brings only its effects, which already land
on its frames. Use `fade=0` in `f.end()` when the edit cuts straight to the next scene.

## Render time
About 1–9 s per 1080p frame on a CPU (SwiftShader software GL, 5 motion-blur subframes): a 7 s clip
takes 5–30 min, and a 35 s film takes 1–3 h. Start long renders in the background and keep working.
- One process is usually fastest: software GL already spreads a frame over several cores.
  `JOBS=2` helps only on a big machine.
- A cut-off render resumes with `node render.mjs frames <clip> <from> <to>`.
- `GL=gpu` tries the GPU. Check that a still looks the same.

## Outputs
- `out/<clip>.mp4`: 1920×1080, 30 fps, H.264 + AAC, faststart. The true peak stays under −1 dBFS.
- `out/logo.png`: 1024×1024 on transparent (`./make.sh logo`).
- `out/smoke.png`, `out/smoke-<clip>.mp4`: from `./make.sh smoke`.

## Files
- `story.py`: yours. `film.py`: the builders, the checks, the sound cues.
- `voice.py` writes `build/voice/*.wav` and `build/voice.json`: the durations, and the mouth shapes
  over time, read from the audio.
  - Its engines: Kokoro with a Praat character treatment (pitch, formants, a wider melody),
    ElevenLabs, your recordings, or silent.
- `capture_ui.mjs` and `ui_states.mjs` write `build/ui/*.png` (2× the viewport), the typing steps,
  and `build/ui_layout.json`.
- `scene/`: Three.js, every frame a pure function of time (`window.renderFrame(t)`).
  - `main.js` loads the clip's modules from `scene/lib/`.
  - `core.js` is the renderer, the lights, the camera blending, and the post: bloom, depth of field,
    the grade, captions, the wordmark.
- `render.mjs`: stills, frames, one still, the logo. `util.mjs`: Chrome and a static server.
- `sound.py` writes `build/<clip>/sound.wav` (music, effects, the voice on top, a limiter at
  −1 dBFS) or `sfx.wav` (`--stem`).
- `demo/index.html`: the stand-in app. Delete it once `ui_states.mjs` points at yours.

## Lessons (each one cost a render)
- **Lights off glossy things.** A spotlight on a laptop lid, or the studio's ceiling reflected in a
  glossy bezel, blows out into a white blob. Devices get no spotlight, and satin metal with its
  reflections turned down. A light-coloured product top gets a soft spot.
- **Tone mapping:** PBR Neutral keeps the brand colours true (AgX greys them out).
- **Motion blur:** accumulate subframes with `autoClear = false`, and jitter each one by a fraction
  of a pixel instead of MSAA.
- **Effects that end must switch off.** A ripple of radius 0 still glows at the press point.
- **Flashes are outlines:** a filled flash turns a big element into a bright block.
- **Lead the action:** the camera reaches the next target before the cursor or the character does,
  so presses are sharp.
- **Voice first**, then the beats around its real durations.
- **Look at the stills**, then a 480×270 full-length preview, before any full render.
