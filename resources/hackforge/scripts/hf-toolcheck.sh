#!/usr/bin/env bash
# Reports which creative / build tools are installed, so the possibilities scout proposes
# things that can actually be made on this machine (or says what to install).
# Run through the launcher: bash hf-run.sh toolcheck   (works on macOS, Linux, Windows Git Bash)

case "$(uname -s 2>/dev/null)" in
  Darwin) os=mac ;; MINGW*|MSYS*|CYGWIN*) os=win ;; *) os=linux ;;
esac
hint() { # mac win linux
  case $os in mac) echo "$1";; win) echo "$2";; *) echo "$3";; esac
}
check() { # name, command, mac hint, win hint, linux hint
  if command -v "$2" >/dev/null 2>&1; then
    v=$("$2" --version 2>/dev/null | head -1 | tr -d '\r' | cut -c1-60); echo "✅ $1 — $2 ${v}"
  else echo "⬜ $1 — install: $(hint "$3" "$4" "$5")"; fi
}

blender_cmd=""
if command -v blender >/dev/null 2>&1; then blender_cmd=blender
elif [ $os = mac ] && [ -x /Applications/Blender.app/Contents/MacOS/Blender ]; then blender_cmd=/Applications/Blender.app/Contents/MacOS/Blender
elif [ $os = win ]; then for b in "/c/Program Files/Blender Foundation/"Blender*/blender.exe; do [ -x "$b" ] && blender_cmd="$b"; done
fi

echo "# Tool check ($(uname -s) $(uname -m))"
echo "## Core"
if declare -F hf_find_python >/dev/null && hf_find_python; then echo "✅ Python — ${HF_PY[*]}"
elif command -v python3 >/dev/null 2>&1 && [ "$(python3 -c 'print(3)' 2>/dev/null | tr -d '\r')" = 3 ]; then echo "✅ Python — python3"
else echo "⬜ Python 3 — install: $(hint 'brew install python' 'winget install -e --id Python.Python.3.12' 'sudo apt install python3')"; fi
check Node node "brew install node" "winget install -e --id OpenJS.NodeJS.LTS" "sudo apt install nodejs npm"
check git git "xcode-select --install" "winget install -e --id Git.Git" "sudo apt install git"
check Docker docker "Docker Desktop" "Docker Desktop (winget install -e --id Docker.DockerDesktop)" "docs.docker.com/engine/install"
echo "## 3D & CAD"
if [ -n "$blender_cmd" ]; then echo "✅ Blender — $blender_cmd (headless: -b -P script.py)"
else echo "⬜ Blender — install: $(hint 'brew install --cask blender' 'winget install -e --id BlenderFoundation.Blender' 'blender.org/download')"; fi
check OpenSCAD openscad "brew install --cask openscad" "winget install -e --id OpenSCAD.OpenSCAD" "sudo apt install openscad"
check FreeCAD freecadcmd "brew install --cask freecad" "winget install -e --id FreeCAD.FreeCAD" "sudo apt install freecad"
echo "## Audio"
check FFmpeg ffmpeg "brew install ffmpeg" "winget install -e --id Gyan.FFmpeg" "sudo apt install ffmpeg"
check SoX sox "brew install sox" "winget install -e --id ChrisBagwell.SoX" "sudo apt install sox"
check FluidSynth fluidsynth "brew install fluid-synth" "github.com/FluidSynth/fluidsynth/releases" "sudo apt install fluidsynth"
echo "## Video & motion"
check Manim manim "pip install manim" "pip install manim" "pip install manim"
check ImageMagick magick "brew install imagemagick" "winget install -e --id ImageMagick.ImageMagick" "sudo apt install imagemagick"
echo "## Game & interactive"
check Godot godot "brew install --cask godot" "winget install -e --id GodotEngine.GodotEngine" "godotengine.org/download"
echo "## Hardware"
check PlatformIO pio "pip install platformio" "pip install platformio" "pip install platformio"
check arduino-cli arduino-cli "brew install arduino-cli" "winget install -e --id ArduinoSA.CLI" "arduino.github.io/arduino-cli"
echo "## Mobile & native"
[ $os = mac ] && check Xcode xcodebuild "App Store: Xcode" "" ""
check "Expo (via npx)" npx "brew install node" "winget install -e --id OpenJS.NodeJS.LTS" "sudo apt install nodejs npm"
echo "## Python libs"
pyrun=()
if declare -F hf_find_python >/dev/null && hf_find_python; then pyrun=("${HF_PY[@]}"); elif command -v python3 >/dev/null 2>&1; then pyrun=(python3); fi
if [ ${#pyrun[@]} -gt 0 ]; then
"${pyrun[@]}" -X utf8 - <<'PY' 2>/dev/null
import importlib.util as u
for m in ["numpy","pandas","torch","sklearn","scipy","matplotlib","trimesh","cadquery","librosa","pydub","soundfile","cv2","PIL","manim","gymnasium"]:
    print(("✅ " if u.find_spec(m) else "⬜ ")+m)
PY
else echo "(skipped — no Python 3)"; fi
exit 0
