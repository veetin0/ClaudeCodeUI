#!/usr/bin/env bash
# The 3D kit, start to finish.
#   ./make.sh <clip>          voice → screens → timeline → stills → frames → sound → out/<clip>.mp4
#   ./make.sh check <clip>    stop after the stills (build/<clip>/stills.png): look before rendering
#   ./make.sh stem <clip>     like <clip>, with effects only (no music or voice): for a narrated pitch
#   ./make.sh smoke           every clip in story.py, 2 s at low resolution, and one contact sheet
#   ./make.sh logo [clip]     the mark alone → out/logo.png
set -euo pipefail
cd "$(dirname "$0")"
step() { printf '\n== %s\n' "$*"; }

[ -d node_modules/three ] && [ -d node_modules/playwright-core ] || npm install --no-audit --no-fund
python3 -c 'import numpy, scipy, soundfile, pedalboard, parselmouth, kokoro_onnx' 2>/dev/null || python3 -m pip install -r requirements.txt
command -v ffmpeg >/dev/null || { echo "ffmpeg is needed (brew install ffmpeg / apt install ffmpeg)"; exit 1; }
mkdir -p build out

CLIPS=$(python3 -c 'import story; print(" ".join(story.CLIPS))')
uses() { python3 -c "import json,sys; print(' '.join(json.load(open('build/$1/timeline.json'))['uses']))"; }
prepare() {
  # The voice when any clip talks, the app's screens when any clip shows them.
  if grep -q "f.say(\|f.intro(" story.py; then step "voice"; python3 voice.py; fi
  if grep -q "f.app(" story.py; then step "screens"; node capture_ui.mjs; fi
}
# AAC overshoots the master's -1 dBFS peak by about a dB: -1.5 dB keeps the true peak under -1.
mux() {
  ffmpeg -loglevel error -y -framerate 30 -i "build/$1/frames/%05d.png" -i "build/$1/$2" \
    -c:v libx264 -pix_fmt yuv420p -crf "${CRF:-18}" -preset "${PRESET:-slow}" -af volume=-1.5dB -c:a aac -b:a 192k -shortest -movflags +faststart "$3"
}

MODE=${1:-}
case "$MODE" in
  smoke)
    prepare
    step "timelines"; python3 story.py all
    for c in $CLIPS; do
      rm -rf "build/$c/frames"
      step "$c (2 s, 480×270): $(uses "$c")"
      W=480 H=270 SUB=1 node render.mjs frames "$c" 0 60
      python3 sound.py "$c" --stem >/dev/null
      CRF=26 PRESET=veryfast mux "$c" sfx.wav "out/smoke-$c.mp4"
      ffmpeg -loglevel error -y -ss 1.5 -i "out/smoke-$c.mp4" -frames:v 1 "build/$c/smoke.png"
    done
    ffmpeg -loglevel error -y $(for c in $CLIPS; do echo -n "-i build/$c/smoke.png "; done) \
      -filter_complex "$(n=0; for c in $CLIPS; do echo -n "[$n]"; n=$((n+1)); done)hstack=inputs=$(echo $CLIPS | wc -w)" out/smoke.png
    echo "→ out/smoke-<clip>.mp4 and out/smoke.png"
    ;;
  check)
    prepare
    step "timeline"; python3 story.py "$2"
    step "stills";   node render.mjs stills "$2"
    ffmpeg -loglevel error -y -pattern_type glob -i "build/$2/stills/*.png" -vf "scale=480:-1,tile=4x5" -frames:v 1 "build/$2/stills.png"
    echo "→ build/$2/stills.png"
    ;;
  logo)
    python3 story.py "${2:-logo}"
    node render.mjs logo "${2:-logo}"
    ;;
  ""|-h|--help)
    sed -n '2,7p' "$0"; echo "clips: $CLIPS"
    ;;
  *)
    STEM=""; [ "$MODE" = stem ] && { STEM=1; shift; MODE=$1; }
    prepare
    step "timeline"; python3 story.py "$MODE"
    step "stills";   node render.mjs stills "$MODE"
    rm -rf "build/$MODE/frames"
    step "frames";   node render.mjs frames "$MODE"
    if [ -n "$STEM" ]; then
      step "sound (effects only)"; python3 sound.py "$MODE" --stem; mux "$MODE" sfx.wav "out/$MODE.mp4"
    else
      step "sound"; python3 sound.py "$MODE"; mux "$MODE" sound.wav "out/$MODE.mp4"
    fi
    ffprobe -v error -show_entries format=duration:stream=codec_type,width,height,r_frame_rate -of compact "out/$MODE.mp4"
    echo "→ out/$MODE.mp4"
    ;;
esac
