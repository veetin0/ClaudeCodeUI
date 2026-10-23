# Forge shows Harness

A 24.5 s character film: Forge, a soft anvil with a tiny hammer, starts as a flat sticker on
Harness's Team screen, knocks, peels off and pops into 3D, then hops through a whole team run on the
real app (Start → Copy the join command → Continue → stamps the challenge in → Accept and run → four
milestones → Done). Every hop changes the screen. Then the panels power down and fall away, and Forge
dives into the app icon and becomes the logo. Voice by Kokoro, pitched up; all sound synthesized.

This is the film HackForge's optional `/hackforge:mascot` template was generalised from
(`resources/hackforge/skills/mascot/template/`). The differences: `capture_ui.mjs` drives the real
Electron app with pushed run, team and crew states instead of a web URL, and the scene keeps
Harness's own tile (the spark and dots) and the file chips flying into Setup's three drop zones.

```bash
npm run build                 # in the repo root: the app the screens are captured from
cd promo/forge-film
./make.sh check               # voice, screens, timeline, 18 stills → build/stills.png
./make.sh                     # everything → out/forge-harness.mp4 and out/logo.png (~95 min on 4 CPUs)
```

| File | What it does |
|---|---|
| `timeline.py` | The single source of truth: lines, hops, screen changes, finale, camera, sound cues; `check()` refuses a hop that changes nothing |
| `voice.py` | Forge's lines with Kokoro (`models/`, from GitHub releases), pitched up 3.5 semitones |
| `capture_ui.mjs` | The built app under a throwaway profile, 12 states at 3840×2160 plus the rectangles Forge lands on |
| `scene/` | Three.js: screens as slabs, Forge as a marching-cubes toy, bloom, shallow focus, 5-subframe motion blur |
| `render.mjs` | Stills, frames, the logo (headless Chromium, SwiftShader) |
| `sound.py` | Music, effects on their frames, the voice on top, limiter at −1 dBFS |

Renders, models and node_modules are git-ignored.
