#!/usr/bin/env bash
# Forge shows Harness, start to finish. Needs the built app (npm run build in the repo root), xvfb
# on Linux, Python with requirements from the mascot template, and ffmpeg.
#   ./make.sh          voice → screens → timeline → stills → frames → sound → video + logo
#   ./make.sh check    stop after the stills (build/stills.png): look before rendering
set -euo pipefail
cd "$(dirname "$0")"
MODE=${1:-all}
step() { printf '\n== %s\n' "$*"; }
[ -d node_modules/three ] || npm install --no-audit --no-fund
python3 -c 'import numpy, scipy, soundfile, pedalboard, kokoro_onnx' 2>/dev/null || python3 -m pip install -r ../../resources/hackforge/skills/mascot/template/requirements.txt
if [ ! -f models/voices-v1.0.bin ]; then
  mkdir -p models
  for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do
    curl -fsSL -o "models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
  done
fi
mkdir -p build out

step "voice";    python3 voice.py
step "screens"
if [ "$(uname)" = Linux ] && [ -z "${DISPLAY:-}" ]; then xvfb-run -a -s "-screen 0 2400x1400x24" node capture_ui.mjs; else node capture_ui.mjs; fi
step "timeline"; python3 timeline.py
step "stills";   node render.mjs stills
ffmpeg -loglevel error -y -pattern_type glob -i 'build/stills/*.png' -vf "scale=480:-1,tile=4x5" -frames:v 1 build/stills.png
[ "$MODE" = check ] && { echo "→ build/stills.png"; exit 0; }

rm -rf build/frames
step "frames";   node render.mjs frames
step "sound";    python3 sound.py
step "video";    ffmpeg -loglevel error -y -framerate 30 -i build/frames/%05d.png -i build/sound.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -af volume=-1.5dB -c:a aac -b:a 192k -shortest -movflags +faststart out/forge-harness.mp4
step "logo";     node render.mjs logo
echo "→ out/forge-harness.mp4 and out/logo.png"
