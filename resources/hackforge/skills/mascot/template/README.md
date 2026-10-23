# Character film template

A 20–30 s film where the product's character explains the product on its real screens: it starts
as a flat sticker, knocks, peels off and pops into 3D, hops from button to button (every hop changes
the screen), talks, and ends by diving into the app icon, where it becomes the logo.

Out of the box it films a stand-in app (`demo/index.html`) with Forge, a soft anvil with a hammer.
`./make.sh smoke` checks the whole pipeline in about a minute.

## Needs
Node 20.11+, Python 3.10+, ffmpeg, and a Chrome: `CHROME_PATH`, the installed Google Chrome, or
`npx playwright install chromium`. `make.sh` installs the npm and pip packages (`three`,
`playwright-core`; `numpy`, `scipy`, `soundfile`, `pedalboard`, `kokoro-onnx`). The Kokoro voice
model (~110 MB) downloads from GitHub releases on the first `voice.py`.

## Make it yours
| File | What you change |
|---|---|
| `timeline.py` | BRAND (HERO colour, APP, LOGO, SET, MUSIC), the voice, the LINES, the hops and screen changes in `build()` |
| `scene/hero.js` | The character's shape (a signed-distance function), face, legs and prop |
| `ui_states.mjs` | Your app's URL, its screens (how to reach each one) and the elements the hero lands on |
| `recordings/<id>.wav` | Optional: your own voice lines (`VOICE['engine'] = 'own'`) |

Order: `python3 voice.py` (durations first: the beats are placed around them) →
`node capture_ui.mjs` (start your app first) → `python3 timeline.py` (checks every rule) →
`./make.sh check` (stills and a contact sheet; look at them) → `./make.sh`.

## Rules the timeline checks
- Every press or stamp lands within 0.1 s of a screen change. A hop that changes nothing is cut.
- Hops don't overlap; screen changes are in order and exist in the capture; panels were found.
- Lines don't run into each other, and the last one ends before the fade.

## Outputs
`out/<hero>-<app>.mp4` (1920×1080, 30 fps, H.264 + AAC, faststart) and `out/logo.png` (1024×1024,
transparent). Renders are about 1–8 s per frame on a CPU (SwiftShader, which already uses several
cores; `JOBS=2` only helps on a machine with many). `GL=gpu` tries the GPU instead.

## Files
- `timeline.py` → `build/timeline.json`: the single source of truth; the scene and the sound read it.
- `voice.py` → `build/voice/*.wav`, `build/voice.json` (durations, mouth envelope).
- `capture_ui.mjs` + `ui_states.mjs` → `build/ui/*.png` (3840×2160), `build/ui_layout.json`.
- `scene/` (Three.js, `window.renderFrame(t)`), `render.mjs` (stills, frames, logo), `util.mjs`.
- `sound.py` → `build/sound.wav`: music, effects on their frames, the voice on top, limiter at −1 dBFS.
- `demo/index.html`: the stand-in app. Delete it once `ui_states.mjs` points at yours.
