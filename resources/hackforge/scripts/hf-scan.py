#!/usr/bin/env python3
"""Inventory the challenge/ folder so Claude knows what it has before reading.

Usage: hf-scan.py [folder]   (default: ./challenge)
Prints files grouped by kind with sizes, and flags what each kind suggests.
"""
import os, sys, json
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from collections import defaultdict

KINDS = {
    "document": {".pdf", ".docx", ".doc", ".md", ".txt", ".rtf", ".odt", ".pptx", ".key", ".html", ".htm"},
    "data": {".csv", ".tsv", ".json", ".jsonl", ".parquet", ".xlsx", ".xls", ".xml", ".yaml", ".yml", ".sqlite", ".db", ".h5", ".npy", ".npz", ".geojson", ".shp"},
    "3d": {".blend", ".glb", ".gltf", ".fbx", ".obj", ".stl", ".ply", ".usd", ".usdz", ".3mf", ".dae"},
    "cad": {".step", ".stp", ".iges", ".igs", ".dxf", ".dwg", ".scad", ".f3d", ".sldprt"},
    "image": {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".tif", ".tiff", ".heic", ".psd", ".fig", ".ai"},
    "audio": {".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aiff", ".mid", ".midi"},
    "video": {".mp4", ".mov", ".avi", ".mkv", ".webm"},
    "code": {".py", ".ipynb", ".js", ".ts", ".tsx", ".jsx", ".swift", ".c", ".cpp", ".h", ".rs", ".go", ".java", ".kt", ".ino", ".sh"},
    "font": {".ttf", ".otf", ".woff", ".woff2"},
    "archive": {".zip", ".tar", ".gz", ".tgz", ".7z", ".rar"},
}
HINTS = {
    "3d": "3D assets present → consider Blender (bpy, headless) / three.js / a rendered demo",
    "cad": "CAD present → consider CadQuery / OpenSCAD / FreeCAD for parametric parts",
    "audio": "audio present → consider audio processing, sound design or audio in the demo",
    "video": "video present → consider ffmpeg processing, CV, or a video deliverable",
    "data": "data present → set up /hackforge:eval and a data audit early",
    "archive": "archives present → extract them before reading (they may hide more material)",
    "font": "fonts present → likely a brand kit; use them in UI and slides",
}

def human(n):
    for u in ["B", "KB", "MB", "GB"]:
        if n < 1024: return f"{n:.0f}{u}"
        n /= 1024
    return f"{n:.1f}TB"

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "challenge"
    if not os.path.isdir(root):
        print(f"No {root}/ folder. Run /hackforge:init to create it."); return
    groups = defaultdict(list)
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if not x.startswith(".")]
        for f in files:
            if f.startswith(".") and f != ".env.example": continue
            p = os.path.join(d, f); ext = os.path.splitext(f)[1].lower()
            kind = next((k for k, v in KINDS.items() if ext in v), "other")
            if f == "hackforge.yaml": kind = "config"
            groups[kind].append((os.path.relpath(p, root), os.path.getsize(p)))
    total = sum(len(v) for v in groups.values())
    print(f"# challenge/ inventory — {total} files\n")
    for kind in sorted(groups, key=lambda k: -len(groups[k])):
        items = sorted(groups[kind])
        print(f"## {kind} ({len(items)})")
        for rel, size in items[:60]:
            print(f"- {rel}  ({human(size)})")
        if len(items) > 60: print(f"- … {len(items) - 60} more")
        print()
    hints = [HINTS[k] for k in groups if k in HINTS]
    if hints:
        print("## Signals"); [print(f"- {h}") for h in hints]
    prompts = [r for r, _ in groups.get("document", []) if r.startswith("prompts" + os.sep)]
    print(f"\nTeam directive files: {len(prompts)}")

if __name__ == "__main__":
    main()
