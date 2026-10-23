# Playbook: pitch video with 3D and motion

The video is often the only thing every judge watches in full. Its visuals should come from the **subject**: a physical product deserves a 3D hero, a data product deserves data that moves, an app deserves its real UI. Pick the treatment first, then the tools.

## 1. Choose the treatment by subject

| Subject | Hero treatment | Supporting motion | Tools |
|---|---|---|---|
| Physical product, hardware, energy, industrial equipment (switchgear, turbine, sensor) | **3D hero**: slow orbit, then an **exploded view** that separates the parts and labels the one that matters | Callouts that track 3D points, a cutaway, before/after | Blender model → glTF → `@remotion/three`; or Blender-rendered turntable as a video clip |
| Digital twin, building, site, spatial scan (e.g. VEO360) | **3D flythrough** of the space; tags pop in at their 3D positions | Camera path along the workflow, scan "materialising" from points to mesh | glTF/point cloud in `@remotion/three`; screen capture of the real viewer |
| Data, AI, forecasting, market signals (e.g. IRMA) | **Data in motion**: signals flow in as particles, merge into the model, fan out into scenarios | Line charts that draw themselves, counters that count up, a highlighted insight | Remotion SVG/Canvas charts from the real data; `@remotion/three` particles for the hero |
| Software, app, SaaS | **Device mockup in 3D** playing the real screen recording | Cursor-led zooms into the key click, UI elements lifting out of the screen | Playwright capture → `@remotion/three` phone/laptop with `useVideoTexture`; Remotion zoom/pan |
| Algorithm, science, maths | **Explainer**: the idea built step by step | Equations transforming, graph traversal, before/after metric | Manim scenes rendered to MP4, cut into Remotion |
| Mobility, logistics, maps | **Animated route map** zooming from region to street | Fleet dots moving, heat building up | Map screenshots/tiles + SVG paths animated in Remotion |
| Health, social impact, education | **Human-first**: illustrated people/icons, warm colour, real quotes | Gentle kinetic typography, simple iconography | Remotion + SVG illustrations; real footage only if allowed |
| Game, interactive, XR | **Gameplay capture** with a 3D logo reveal | Speed ramps, UI overlays | Capture + `@remotion/three` logo |
| AI assistant or agent with a character (optional, `hackforge:mascot`) | **Character-led film**: the mascot hops across the real UI, every hop changes the screen, it explains the product and dives into the logo | Captions, a synthesized hit on every landing, the logo reveal | `skills/mascot/template` (Three.js in headless Chrome; Blender optional), Kokoro or the team's own voice |

Rules: one hero treatment per video (two at most). It must explain something; spinning a model with no point is noise. Use the team's real assets from `challenge/assets/` and the real product wherever possible. Never show anything as working that isn't built: label concepts as concepts.

## 2. Story (60–120 s, adjust to the rules' limit)

| Time | Beat | Visual |
|---|---|---|
| 0–5 s | Hook — the problem in the sponsor's words | the strongest visual first (3D reveal, data surge, real pain on screen) |
| 5–15 s | Problem | a number or a before-state, in motion |
| 15–20 s | Reveal — name + logo | hero treatment lands on the beat (riser → impact) |
| 20–60 s | Demo — the one thing it does | real product, zooms on the key interaction, 3D callouts |
| 60–75 s | Proof — measured results | counters and charts from SCORES.md only |
| 75–90 s | Impact + call to action | logo, one-line promise, URL/QR held 3 s |

About 2.5 spoken words per second. One idea per scene; a visual change every 2–4 s; at most 5 words on screen at once; captions throughout (judges often watch muted).

## 3. Remotion project
```bash
npx create-video@latest video        # Blank template; accept agent skills if offered
cd video && npm i
npm i three @react-three/fiber @react-three/drei @remotion/three @types/three   # only if a 3D treatment is used
npx skills add remotion-dev/skills    # Remotion's own Claude skills
```
- In `remotion.config.ts`: `Config.setChromiumOpenGlRenderer('angle')` (needed for Three.js; new projects include it). Server-side renders need `chromiumOptions: { gl: 'angle' }`.
- Inside `<ThreeCanvas>`, use `<Sequence layout="none">` — the default `<div>` isn't allowed there.
- Animate with `useCurrentFrame()` + `interpolate`/`spring` in the markup, not `useFrame()`: every frame must be deterministic.
- Compositions: `Pitch16x9` 1920×1080 and `Pitch9x16` 1080×1920, 30 fps; scene lengths come from the voiceover files.

### 3D hero sketch (orbit + exploded view)
```tsx
import {ThreeCanvas} from '@remotion/three';
import {useGLTF} from '@react-three/drei';
import {interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const Part = ({node, i, explode}: {node: any; i: number; explode: number}) => (
  <primitive object={node} position={[node.position.x, node.position.y + explode * (i - 2) * 0.35, node.position.z]} />
);

export const Hero3D = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const {scene} = useGLTF(staticFile('models/product.glb'));
  const orbit = interpolate(frame, [0, 8 * fps], [-0.6, 0.6]);
  const explode = spring({frame: frame - 3 * fps, fps, config: {damping: 200}});
  return (
    <ThreeCanvas width={width} height={height} camera={{position: [0, 1.2, 4], fov: 35}}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <directionalLight position={[-5, 2, -3]} intensity={0.6} color="#9ec5ff" />
      <group rotation={[0, orbit, 0]}>
        {scene.children.map((n, i) => <Part key={n.uuid} node={n} i={i} explode={explode} />)}
      </group>
    </ThreeCanvas>
  );
};
```
Check stills before rendering anything long: `npx remotion still Pitch16x9 out/hero.png --frame=120` and **look at the image**. If the model is blank, the asset didn't load in time — preload it and check again.

### Getting a 3D model
1. The team's or sponsor's model in `challenge/assets/` (convert to glTF in Blender: File → Export → glTF Binary, Y-up, metres, < 10 MB).
2. Model it procedurally with a Blender Python script (see `3d-blender.md`) — primitives + bevels + materials, named parts so they can explode.
3. A licensed model (CC0/CC-BY with credit in `assets/CREDITS.md`) only if the rules allow third-party assets.
Blender can also render the hero shot itself (EEVEE for speed): render a PNG sequence and use it as a clip in Remotion.

### Motion that looks expensive
- Springs with damping ~200 for UI, slight overshoot for icons; ease-out for text.
- Camera moves slowly and continuously; cut on the voiceover beat.
- Kinetic typography for the hook and the result number; keep everything else calm.
- One accent colour for highlights; the brand's palette and font everywhere (see `pitch-assets.md`).
- Depth: subtle parallax between background, product and labels.

## 4. Sound
- **Voice**: your own recorded voice is most convincing; ElevenLabs (`/v1/text-to-speech/{voice}/with-timestamps`, fixed seed, one file per scene) gives word timings for captions. Free fallbacks: macOS `say -o vo.aiff`, Windows PowerShell `System.Speech` — fine for drafts.
- **Music**: instrumental only, composed to length (ElevenLabs `/v1/music`, `force_instrumental: true`, a composition plan whose sections match the scenes) or a licensed library track.
- **Sound effects**: whoosh on transitions, soft click on UI, pop on labels, tick on counters, riser → impact on the reveal, chime on the result (ElevenLabs `/v1/sound-generation` or CC0 libraries). At most one every 2–3 s, synced to the exact frame of the motion.
- **Mix**: voice 1.0; music ducked to ~0.14 under speech, ~0.45 in gaps (ease 0.3 s); SFX 0.2–0.5. Final loudness: `ffmpeg -i in.mp4 -c:v copy -af loudnorm=I=-14:TP=-1:LRA=11 out.mp4`.
- Commercial use of generated audio needs a paid ElevenLabs plan; check the hackathon's rules on generated media. Keys live in `.env`, never in the repo.

## 5. Keep it cheap and fast
- Storyboard first (text) and get it approved — changing words is free, re-rendering isn't.
- Generate audio once, cache the files, regenerate a single scene when its line changes.
- Preview with stills and `--frames=0-300` ranges; render full quality only at the end (`--crf=18`).
- 3D render time grows with resolution and lights; test one second before rendering ninety.

## 6. Done means
- Duration within the limit (`ffprobe -v error -show_entries format=duration -of csv=p=0 out/pitch.mp4`), 1080p, H.264 + AAC, plays in a browser.
- Captions throughout; every claim matches SCORES.md; credits for third-party assets.
- A blind judge watched 4–5 frames + the script and could say what it is and why it matters.
- Add the duration and existence checks to gate.sh.
