# Playbook: 3D with Blender

**When it earns its place:** a physical product, device, building, site or process the judges should *see*; a digital twin; visualising data in space; hero renders for the pitch; a model for a web/AR viewer.

## Setup
- macOS: `brew install --cask blender` → binary `/Applications/Blender.app/Contents/MacOS/Blender`. Linux: `blender` from blender.org (snap/apt versions lag).
- Always run headless and scripted: `blender -b -P assets-src/<asset>/build.py -- --out assets/<asset>`. Arguments after `--` reach the script via `sys.argv[sys.argv.index("--")+1:]`.
- **Live Blender (optional):** the community MCP for Blender (`mcp__blender__*`) lets Claude work in the user's open Blender window: `get_scene_info`, `look` (the viewport or a render), `execute_blender_code` (asks first), Poly Haven / Sketchfab asset search and import, and AI model generation (some need API keys, all ask first). In the Harness app: Settings → Dev tools → Blender (set up the add-on, then Open Blender; it connects by itself). Use it to explore and iterate quickly; the deliverable is still the reproducible script plus the exported `.glb` and renders.
- **Look at it in Harness:** the Preview tab opens any `.glb` in the project (turn it, see its named parts, triangle count and size) and reloads it when you re-export. A product `.glb` with named top-level parts can go straight into the 3D kit's `product` clip (an exploded view with callouts).

## Script skeleton
```python
import bpy, sys, math, os
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
out = argv[argv.index("--out")+1] if "--out" in argv else "out"
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)          # clean scene every run
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'; scene.unit_settings.scale_length = 1.0
# --- geometry: primitives + modifiers (bevel, array, boolean, subdivision) or import ---
# bpy.ops.import_scene.gltf(filepath=...); bpy.ops.wm.obj_import(filepath=...); bpy.ops.wm.stl_import(filepath=...); bpy.ops.import_scene.fbx(filepath=...)
# --- materials: Principled BSDF, set Base Color / Metallic / Roughness; name materials meaningfully ---
# --- camera + 3-point lights or an HDRI world; track-to constraint on the subject ---
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):          # name differs between versions
    try: scene.render.engine = eng; break
    except TypeError: pass
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
scene.render.filepath = os.path.join(out, "hero.png"); bpy.ops.render.render(write_still=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "model.glb"), export_format='GLB')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, "model.blend"))
```
- Final hero renders: Cycles; on Apple Silicon set `bpy.context.preferences.addons['cycles'].preferences.compute_device_type = 'METAL'` and `scene.cycles.device = 'GPU'`; keep samples low (64–128) with denoising.
- Turntable: animate the camera's parent empty `rotation_euler.z` 0 → 2π over N frames, render frames to PNG, then `ffmpeg -framerate 30 -i f_%04d.png -c:v libx264 -pix_fmt yuv420p turntable.mp4`.

## Quality checks
- Render a low-res preview first and **look at it** (Read the PNG). Check framing, scale, lighting, materials not all grey.
- Real-world scale (metres), applied transforms, sensible origin, Y-up on glTF export (default), polycount suitable for the web (< 100k tris for viewers), file size within the contract.
- Data-driven models (from CSV/GeoJSON): generate geometry from the data in the script so updates re-render.

## Using the result
- Web: `<model-viewer src="model.glb" camera-controls ar>` or three.js / React Three Fiber with GLTFLoader.
- Pitch: hero render on the title slide, turntable in the video, exploded view to explain components.
