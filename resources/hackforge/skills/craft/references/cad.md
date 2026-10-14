# Playbook: CAD & physical parts

**When:** enclosures, mechanical parts, anything to 3D-print or manufacture, engineering challenges where dimensions matter, technical drawings.

- **CadQuery** (`pip install cadquery`): parametric Python. Export `cq.exporters.export(part, "part.step")` and `"part.stl"`. Keep all dimensions as named parameters at the top.
- **OpenSCAD** (`brew install --cask openscad`): `openscad -o part.stl part.scad -D 'width=40'` for CLI parameters; `--render -o preview.png` for a picture.
- **FreeCAD** (`freecadcmd script.py`) for STEP-heavy workflows and drawings.
- Validate with `trimesh`: `m = trimesh.load("part.stl"); m.is_watertight; m.bounds; m.volume`. Check wall thickness ≥ 1.2 mm and overhangs for FDM printing.
- Render for the pitch through Blender (import STL/STEP-converted mesh, apply material) — see 3d-blender.md.
- Deliver STEP (engineering), STL/3MF (printing), PNG renders, and a dimensioned drawing if judges are engineers.
