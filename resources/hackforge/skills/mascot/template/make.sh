#!/usr/bin/env bash
# The character film, start to finish.
#   ./make.sh          voice → screens → timeline → stills → frames → sound → video + logo
#   ./make.sh check    stop after the stills: look at build/stills/ before rendering
#   ./make.sh smoke    the first 3 s at low resolution, end to end (checks the pipeline in ~1 min)
set -euo pipefail
cd "$(dirname "$0")"
MODE=${1:-all}
step() { printf '\n== %s\n' "$*"; }

[ -d node_modules/three ] && [ -d node_modules/playwright-core ] || npm install --no-audit --no-fund
python3 -c 'import numpy, scipy, soundfile, pedalboard' 2>/dev/null || python3 -m pip install -r requirements.txt
command -v ffmpeg >/dev/null || { echo "ffmpeg is needed (brew install ffmpeg / apt install ffmpeg)"; exit 1; }
mkdir -p build out

step "voice";    python3 voice.py
step "screens";  node capture_ui.mjs
step "timeline"; python3 timeline.py

if [ "$MODE" = smoke ]; then
  rm -rf build/frames
  step "frames (3 s, 480×270)"; W=480 H=270 SUB=1 node render.mjs frames 0 90
  step "sound";    python3 sound.py
  ffmpeg -loglevel error -y -framerate 30 -i build/frames/%05d.png -i build/sound.wav -t 3 \
    -c:v libx264 -pix_fmt yuv420p -crf 23 -c:a aac -b:a 128k out/smoke.mp4
  echo "→ out/smoke.mp4"
  exit 0
fi

step "stills";   node render.mjs stills
ffmpeg -loglevel error -y -pattern_type glob -i 'build/stills/*.png' -vf "scale=480:-1,tile=4x5" -frames:v 1 build/stills.png
echo "→ build/stills.png (contact sheet)"
[ "$MODE" = check ] && { echo "Look at the stills, fix, run ./make.sh check again; then ./make.sh"; exit 0; }

rm -rf build/frames
step "frames";   node render.mjs frames
step "sound";    python3 sound.py
NAME=$(python3 -c 'import timeline as T; print(T.HERO["name"].lower() + "-" + T.APP["name"].lower())')
# AAC overshoots the master's -1 dBFS peak by about a dB: -1.2 dB keeps the true peak under -1.
step "video";    ffmpeg -loglevel error -y -framerate 30 -i build/frames/%05d.png -i build/sound.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -af volume=-1.2dB -c:a aac -b:a 192k -shortest -movflags +faststart "out/$NAME.mp4"
step "logo";     node render.mjs logo
ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of compact "out/$NAME.mp4"
echo "→ out/$NAME.mp4 and out/logo.png"
