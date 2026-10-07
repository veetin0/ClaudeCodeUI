# Pitch video

A narrated demo video built with [Remotion](https://remotion.dev), driven by `script.json`.

- Edit the script in Harness (event mode → **Pitch**), or by hand.
- Put the screen recording of the demo in `public/` (e.g. `public/demo.mp4`) and reference it from a
  `screen` scene's `media`.
- Narration MP3s are generated into `public/audio/` by Harness (ElevenLabs). A scene whose text changed
  after its audio was made falls back to an estimated length and plays no audio until it is regenerated.

```bash
npm install
npm run studio     # live preview (Harness → Preview does this too)
npm run render     # → out/pitch.mp4
```
