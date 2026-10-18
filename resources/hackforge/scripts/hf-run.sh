#!/usr/bin/env bash
# HackForge launcher — the single entry point for hooks and skills, on macOS, Linux and Windows (Git Bash).
#
#   bash hf-run.sh stop        Stop hook: enforce the improvement loop (reads hook JSON on stdin)
#   bash hf-run.sh context     SessionStart hook: re-inject project state
#   bash hf-run.sh doctor      check this machine can run HackForge; exit 1 if the loop can't be enforced
#   bash hf-run.sh pyfind      print the command of a working Python 3
#   bash hf-run.sh py ARGS…    run Python 3 with ARGS (UTF-8 mode)
#   bash hf-run.sh scan [dir]  inventory the challenge/ folder
#   bash hf-run.sh toolcheck   list installed creative/build tools
#   bash hf-run.sh guard       PreToolUse hook: guardrails (no-op outside HackForge projects)
#   bash hf-run.sh precompact  PreCompact hook: write .hackforge/RESUME.md before context is compacted
#   bash hf-run.sh loopstatus  evaluate the loop once and print JSON (wake mode; never blocks)
#   bash hf-run.sh integrity <lock|check|status>   integrity lock (approve is operator-only: .hackforge/approve.sh)
#   bash hf-run.sh tools <resume|views|scope|permissions|lessons-*|design-scan>
#
# Hooks call it as:  bash -c 'eval "$(tr -d "\r" < "$0")"' "<path>/hf-run.sh" <mode>
# so it still runs if Git on Windows converted it to CRLF line endings.

HF_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)}"
HF_PROJECT="${CLAUDE_PROJECT_DIR:-$PWD}"
HF_DIR="$HF_PROJECT/.hackforge"
HF_MODE="${1:-}"; shift 2>/dev/null || true

hf_is_windows() { case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) return 0;; *) return 1;; esac; }

# Find a Python 3 that really runs. Skips the Windows Store "python3" stub, which exits 9009.
HF_PY=()
hf_find_python() {
  local cands=() c out
  [ ${#HF_PY[@]} -gt 0 ] && return 0
  # Cache per project: Windows needs several probes otherwise, on every tool call.
  if [ -z "${HACKFORGE_PYTHON:-}" ] && [ -f "$HF_DIR/.gate-python" ]; then
    read -r -a HF_PY < "$HF_DIR/.gate-python"
    out=$("${HF_PY[@]}" -c 'print(3)' 2>/dev/null | tr -d '\r\n ')
    [ "$out" = "3" ] && return 0
    HF_PY=()
  fi
  [ -n "${HACKFORGE_PYTHON:-}" ] && cands+=("$HACKFORGE_PYTHON")
  if hf_is_windows; then cands+=("py -3" "python" "python3"); else cands+=("python3" "python"); fi
  for c in "${cands[@]}"; do
    # shellcheck disable=SC2086
    out=$($c -c 'import sys; print(sys.version_info[0])' 2>/dev/null | tr -d '\r\n ')
    if [ "$out" = "3" ]; then read -r -a HF_PY <<< "$c"; [ -d "$HF_DIR" ] && printf '%s\n' "$c" > "$HF_DIR/.gate-python" 2>/dev/null; return 0; fi
  done
  return 1
}

# Path of this bash in the form Python can execute (Git Bash, never WSL's System32\bash.exe).
hf_bash_path() {
  if hf_is_windows && command -v cygpath >/dev/null 2>&1; then cygpath -w "$BASH"; else printf '%s' "$BASH"; fi
}

hf_json_escape() { printf '%s' "$1" | tr -d '\r' | tr '\t' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN{ORS="\\n"} {print}' | sed 's/\\n$//'; }

hf_loop_active() { [ -f "$HF_DIR/LOOP.json" ] && tr -d '\r' < "$HF_DIR/LOOP.json" | grep -Eq '"active"[[:space:]]*:[[:space:]]*true'; }

hf_loop_deactivate() { # $1 = reason; edits LOOP.json without Python
  local f="$HF_DIR/LOOP.json" tmp
  tmp="$f.tmp.$$"
  tr -d '\r' < "$f" | sed -E "s/\"active\"[[:space:]]*:[[:space:]]*true/\"active\": false, \"ended_reason\": \"$1\"/" > "$tmp" && mv "$tmp" "$f"
}

hf_install_hint() {
  if hf_is_windows; then
    echo "Install Python 3: winget install -e --id Python.Python.3.12  (or python.org, tick 'Add to PATH'), then reopen the terminal and Claude Code. If Python is installed somewhere unusual, set HACKFORGE_PYTHON to its full path."
  elif [ "$(uname -s)" = Darwin ]; then
    echo "Install Python 3: brew install python (or xcode-select --install), then restart Claude Code."
  else
    echo "Install Python 3 with your package manager (e.g. sudo apt install python3), then restart Claude Code."
  fi
}

# ---------------------------------------------------------------- stop
hf_stop() {
  local input out rc fails reason msg
  input=$(cat)
  hf_loop_active || { echo '{}'; exit 0; }

  # Kill switch works even without Python.
  if [ -f "$HF_DIR/STOP_LOOP" ] && ! hf_find_python; then
    rm -f "$HF_DIR/STOP_LOOP"; hf_loop_deactivate "stopped by user (STOP_LOOP)"
    echo '{"decision":"block","reason":"HackForge loop ended: stopped by user (STOP_LOOP). Write a short summary for the user, then stop.","systemMessage":"HackForge loop ended: stopped by user"}'
    exit 0
  fi

  if hf_find_python; then
    out=$(printf '%s' "$input" | HF_BASH="$(hf_bash_path)" "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf-loop-gate.py" 2>"$HF_DIR/.gate-stderr.log")
    rc=$?
    if [ $rc -eq 0 ] && printf '%s' "$out" | grep -q '^{'; then
      rm -f "$HF_DIR/.gate-failures"
      printf '%s\n' "$out"; exit 0
    fi
    reason="the loop gate crashed (exit $rc): $(tail -c 600 "$HF_DIR/.gate-stderr.log" 2>/dev/null | tr -d '\r')"
  else
    reason="no working Python 3 was found (tried ${HACKFORGE_PYTHON:+\$HACKFORGE_PYTHON, }$(hf_is_windows && echo 'py -3, python, python3' || echo 'python3, python')). $(hf_install_hint)"
  fi

  # Fail closed, but bounded: block twice so Claude reports it, then disable the loop loudly.
  fails=$(( $(cat "$HF_DIR/.gate-failures" 2>/dev/null || echo 0) + 1 ))
  echo "$fails" > "$HF_DIR/.gate-failures"
  if [ "$fails" -le 2 ]; then
    msg="HackForge cannot enforce the improvement loop: $reason"
    printf '{"decision":"block","reason":"%s Stop working on the loop. Tell the user exactly this problem and the fix, then end your turn. After it is fixed, run /hackforge:perfect again.","systemMessage":"%s"}\n' \
      "$(hf_json_escape "$msg")" "$(hf_json_escape "⚠ $msg")"
  else
    rm -f "$HF_DIR/.gate-failures"
    hf_loop_deactivate "gate could not run"
    printf '{"systemMessage":"%s"}\n' "$(hf_json_escape "⚠ HackForge loop DISABLED — it is not being enforced: $reason")"
  fi
  exit 0
}

# ---------------------------------------------------------------- context
hf_context() {
  cat >/dev/null 2>&1 || true
  [ -d "$HF_DIR" ] || exit 0
  echo "## HackForge project state (auto-loaded)"
  for f in DIRECTIVES.md STATE.md RULES.md DECISION.md LOOP.json RESUME.md; do
    if [ -f "$HF_DIR/$f" ]; then echo; echo "### .hackforge/$f"; head -c 6000 "$HF_DIR/$f" | tr -d '\r'; echo; fi
  done
  echo
  echo "Input folder: challenge/ (brief, data, assets, prompts, hackforge.yaml). Use the role models and profile recorded in STATE.md when launching agents."
  echo "Team directives in DIRECTIVES.md shape every decision; hard rules in RULES.md override everything, directives included. If LOOP.json is active, continue the hackforge:perfect loop. Run /hackforge:verify before calling anything done."
  echo "Run HackForge scripts through the launcher: bash \"$HF_ROOT/scripts/hf-run.sh\" <scan|toolcheck|doctor|py …>. Never call python3 directly."
  if ! hf_find_python; then
    echo
    echo "WARNING for the user: no working Python 3 on this machine, so the HackForge improvement loop and scanners cannot run. $(hf_install_hint) Tell the user this before starting any HackForge work."
  fi
  exit 0
}

# ---------------------------------------------------------------- doctor
hf_doctor() {
  local bad=0 warn=0 f
  echo "# HackForge doctor ($(uname -s) $(uname -m))"
  echo "- bash: $BASH ${BASH_VERSION}"
  case "$BASH" in *[Ss]ystem32*) echo "  ❌ this is WSL's bash, not Git Bash. Install Git for Windows (winget install -e --id Git.Git) and make sure Claude Code uses it."; bad=1;; esac
  if hf_find_python; then
    echo "- ✅ Python 3: ${HF_PY[*]} ($("${HF_PY[@]}" -c 'import sys;print(sys.version.split()[0])' | tr -d '\r'))"
  else
    echo "- ❌ Python 3: not found — the improvement loop cannot be enforced. $(hf_install_hint)"; bad=1
  fi
  if command -v git >/dev/null 2>&1; then echo "- ✅ git: $(git --version)"; else echo "- ❌ git missing (builders use git worktrees)"; bad=1; fi
  for f in "$HF_ROOT"/scripts/*.sh "$HF_ROOT"/scripts/*.py; do
    if grep -q $'\r' "$f" 2>/dev/null; then echo "- ⚠ CRLF line endings in ${f##*/} (handled by the launcher; fix with: git config --global core.autocrlf input, then reinstall)"; warn=1; fi
  done
  if [ -f "$HF_DIR/gate.sh" ] && grep -q $'\r' "$HF_DIR/gate.sh"; then echo "- ⚠ .hackforge/gate.sh has CRLF line endings (the gate strips them; prefer LF)"; warn=1; fi
  if hf_is_windows && [ "$(git config --get core.autocrlf 2>/dev/null)" = "true" ]; then
    echo "- ⚠ git core.autocrlf=true converts scripts to CRLF. Recommended: git config --global core.autocrlf input"; warn=1
  fi
  [ $bad -eq 0 ] && echo "RESULT: OK$([ $warn -eq 1 ] && echo ' (with warnings)')" || echo "RESULT: FAIL — fix the ❌ items before running /hackforge:perfect"
  [ $bad -eq 0 ]
}

hf_needpy() { hf_find_python || { echo "No working Python 3. $(hf_install_hint)" >&2; exit 1; }; }

case "$HF_MODE" in
  guard)     [ -d "$HF_DIR" ] || { cat >/dev/null; exit 0; }
             hf_find_python || { cat >/dev/null; exit 0; }   # guard fails open; the Stop gate re-checks fail-closed
             "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf-guard.py"; exit 0 ;;
  precompact) cat >/dev/null 2>&1; [ -d "$HF_DIR" ] && hf_find_python && "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf_tools.py" resume >/dev/null 2>&1; exit 0 ;;
  loopstatus) hf_needpy; HF_BASH="$(hf_bash_path)" "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf-loop-gate.py" --status; exit $? ;;
  integrity) hf_needpy; "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf_integrity.py" "$@"; exit $? ;;
  tools)     hf_needpy; "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf_tools.py" "$@"; exit $? ;;
  stop)      hf_stop ;;
  context)   hf_context ;;
  doctor)    hf_doctor; exit $? ;;
  pyfind)    hf_find_python && echo "${HF_PY[*]}" || { hf_install_hint >&2; exit 1; } ;;
  py)        hf_find_python || { echo "No working Python 3. $(hf_install_hint)" >&2; exit 1; }; "${HF_PY[@]}" -X utf8 "$@"; exit $? ;;
  scan)      hf_find_python || { echo "No working Python 3. $(hf_install_hint)" >&2; exit 1; }; "${HF_PY[@]}" -X utf8 "$HF_ROOT/scripts/hf-scan.py" "${@:-challenge}"; exit $? ;;
  toolcheck) eval "$(tr -d '\r' < "$HF_ROOT/scripts/hf-toolcheck.sh")" ;;
  *) echo "usage: hf-run.sh stop|context|guard|precompact|loopstatus|integrity|tools|doctor|pyfind|py|scan|toolcheck" >&2; exit 2 ;;
esac
