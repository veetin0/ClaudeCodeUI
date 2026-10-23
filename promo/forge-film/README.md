# Forge shows Harness

A 37 s character film in three parts:
1. **The studio.** Forge, a soft anvil with a tiny hammer, wakes up when the light clunks on and says hello. It talks about hackathon chaos while the problem pops up around it as cards ("Who's on the API?", "Merge conflict!", "Out of usage", "36 h left"), then swats them away. "Harness fixes that. Come on!"
2. **Inside Harness.** Forge jumps through the glass of the big screen into the app, which now fills the frame, and lives on the real team run:
   - types "Veeti" into Your name, stomps Start, presses Copy, Continue;
   - types the challenge into Setup and stamps the files in;
   - stamps Accept and run;
   - walks along the milestones as they fill, then lands on Done.

   Its face acts the whole time: ^^ eyes, worried brows, a tongue while it types, a mouth that speaks every line.
3. **The logo.** Forge hops back out, the screen shrinks into the Harness icon, and Forge dives in and becomes the mark.

Voice by Kokoro, pitched up; all sound synthesized.

It's made with HackForge's optional `/hackforge:mascot` template (`resources/hackforge/skills/mascot/template/`). The scene, voice, sound and render scripts are the template's. The Harness-specific parts are:
- `timeline.py`: lines, problem cards, beats;
- `capture_ui.mjs`: drives the real Electron app with pushed run, team and crew states, and captures the two typed fields step by step;
- `assets/harness-mark.png`: the spark and dots from the app icon, shown on the tile before Forge dives in.

```bash
npm run build                 # in the repo root: the app the screens are captured from
cd promo/forge-film
./make.sh check               # voice, screens, timeline, stills → build/stills.png
./make.sh                     # everything → out/forge-harness.mp4 and out/logo.png (~2.5 h on 4 CPUs)
```

Renders, models and node_modules are git-ignored.
