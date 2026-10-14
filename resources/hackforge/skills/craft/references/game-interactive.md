# Playbook: Games, 3D web & interactive

**When:** engagement, education, simulation or training challenges; showing a digital twin; anything where letting judges *play* beats watching.

- **Browser 3D**: three.js or React Three Fiber + drei; load glTF from Blender; `<model-viewer>` for zero-code product viewing with AR on phones.
- **WebXR / AR**: model-viewer `ar` attribute, or three.js WebXR for a headset if one is available on site.
- **Godot** (`godot --headless --export-release "Web" build/index.html`) for real games; keep export presets in the repo.
- **Simulations**: Python (SimPy, Mesa, Gymnasium) for the engine; stream state to a web view.
- Performance budget for the demo machine: 60 fps target, compressed textures, LOD on heavy meshes. Test on the actual demo laptop/browser.
- Always add a 30-second guided path (auto-play or a "Start demo" button) so the judge sees the best part without learning controls.
