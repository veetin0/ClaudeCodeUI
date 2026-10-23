# Character film template

A 30–40 s film where the product's character lives inside the product:
1. **The studio.** It wakes up and says hello, then talks about the problem while the problem pops up around it as cards. It swats them away and jumps through the glass of the big screen into the app.
2. **The app.** The app fills the frame and the character lives on it. It walks and hops across the real screens, types into fields and presses buttons, and every action changes the screen. It talks to you with a moving mouth and expressions.
3. **The logo.** It hops back out, the screen shrinks into the app's icon, and it dives in and becomes the logo.

Out of the box it films a stand-in app (`demo/index.html`) with Forge, a soft anvil with a hammer.
`./make.sh smoke` checks the whole pipeline in about a minute.

## Needs
- Node 20.11+, Python 3.10+ and ffmpeg.
- A Chrome: `CHROME_PATH`, the installed Google Chrome, or `npx playwright install chromium`.
- `make.sh` installs the npm packages (`three`, `playwright-core`) and the pip packages (`numpy`, `scipy`, `soundfile`, `pedalboard`, `kokoro-onnx`).
- The Kokoro voice model (~110 MB) downloads from GitHub releases on the first `voice.py`.

## Make it yours
| File | What you change |
|---|---|
| `timeline.py` | BRAND (HERO colour and size, APP, LOGO with your app's mark, SET, MUSIC), the voice, the LINES with their moods, the PROBLEM cards, and the beats in `build()` |
| `scene/hero.js` | The character's body (a signed-distance function), legs, prop, and `FACE` (where the eyes, brows and mouth sit) |
| `scene/face.js` | Only if you want new moods: neutral, happy, joy, excited, worried, focused, surprised, proud, sleep |
| `ui_states.mjs` | Your app's URL, its screens (how to reach each one), the elements the hero lands on, and `type: { target, text }` for each field it types into |
| `recordings/<id>.wav` | Optional: your own voice lines (`VOICE['engine'] = 'own'`) |

Order:
1. `python3 voice.py`: durations first, since the beats are placed around them.
2. `node capture_ui.mjs`: start your app first.
3. `python3 timeline.py`: checks every rule.
4. `./make.sh check`: stills and a contact sheet; look at them.
5. A quick preview, then the full film: `W=480 H=270 SUB=1 node render.mjs frames`, then `./make.sh`.

## The beats in `build()`
```python
start = f.intro()                                   # studio: light, hello, problem, swat, power on
A = f.enter(start, 'home', 'prompt', typing=True)   # through the glass onto the first target
f.screen(0, 'home', 'cut')
f.say('describe', A + 0.1)                          # a line, at a time
f.go(A + 0.05, 'home', 'prompt', 'type', then='home_filled')
f.go(A + 2.75, 'home_filled', 'build', 'press', then='building')         # flip: a new step
f.go(A + 3.85, 'building', 'step1', 'press', then='building_2', how='fade', note='C6')
f.go(A + 7.75, 'preview', 'publish', 'stamp', then='live')
f.go(A + 8.95, 'live', 'badge', 'cheer')
f.outro(A + 10.6)                                   # out, the screen becomes the icon, the logo
```
The hero walks when the next target is on the same row, and hops otherwise. Camera shots, face moods and sound cues come from the beats; `f.shot(t, 'follow', zoom=1.9)` and `f.mood(t, 'proud')` override them.

## Rules the timeline checks
- Every press or stamp changes the screen (`then=`); a typing field has captured steps.
- The hero doesn't leave before its action is done, and moves don't overlap.
- The screens exist in the capture.
- Lines don't run into each other, and the last one ends before the fade.

## Outputs
- `out/<hero>-<app>.mp4`: 1920×1080, 30 fps, H.264 + AAC, faststart.
- `out/logo.png`: 1024×1024, transparent.

Renders take about 1–9 s per frame on a CPU (SwiftShader, which already uses several cores; `JOBS=2` only helps on a machine with many). `node render.mjs frames <from> <to>` renders or resumes a range. `GL=gpu` tries the GPU instead.

## Files
- `timeline.py` → `build/timeline.json`: the single source of truth; the scene and the sound read it.
- `voice.py` → `build/voice/*.wav`, `build/voice.json` (durations, mouth shapes over time).
- `capture_ui.mjs` + `ui_states.mjs` → `build/ui/*.png` (3840×2160), the typing steps, `build/ui_layout.json`.
- `scene/` (Three.js, `window.renderFrame(t)`; `hero.js`, `face.js`), `render.mjs` (stills, frames, logo), `util.mjs`.
- `sound.py` → `build/sound.wav`: music, effects on their frames, the voice on top, limiter at −1 dBFS.
- `demo/index.html`: the stand-in app. Delete it once `ui_states.mjs` points at yours.
