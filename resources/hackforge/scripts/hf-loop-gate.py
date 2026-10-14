#!/usr/bin/env python3
"""HackForge loop gate (v2).

Stop-hook mode (default): while .hackforge/LOOP.json is active, block Claude from ending its turn
until the project passes objective checks, or the loop must end for a recorded reason.
`--status` mode: same evaluation, prints a JSON status and never blocks (used by wake mode).

Checks per iteration
  1. integrity lock (hf_integrity): no weakening of gate.sh, tests, configs, target score
  2. .hackforge/gate.sh exits 0 (run in Git Bash on Windows, CRLF tolerated)
  3. verify.json (hackforge-verify.v1) newer than the latest code change:
     compliance PASS, no critical findings, mock_score >= target
     (falls back to COMPLIANCE:/MOCK_SCORE: lines in VERIFY.md)

Loop ends on: done · score plateau · repeated findings after an advisor consult · same failure after an
advisor consult · advisor STOP · iteration cap · time cap · deadline freeze · user kill switch (STOP_LOOP).

Advisor protocol (adapted from Claude Code Harness, MIT): fixed triggers, each consulted once —
  retry-threshold   gate.sh failed twice with the same failure signature
  repeated-findings the judge keeps raising the same findings (Jaccard >= 0.6 over 3 iterations)
The gate asks Claude to consult hackforge:advisor and save the response to
.hackforge/advisor/<trigger>.json before the loop may continue.
"""
import json, os, re, subprocess, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hf_common as C  # noqa: E402
import hf_integrity as I  # noqa: E402

STATUS_MODE = "--status" in sys.argv


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.exit(0)


def newest_source_mtime(root):
    m = 0.0
    for f in C.git_files(root):
        if f.startswith(".hackforge/"):
            continue
        try:
            m = max(m, os.path.getmtime(os.path.join(root, f)))
        except OSError:
            pass
    return m


def failure_signature(text):
    t = re.sub(r"0x[0-9a-f]+|\d+(\.\d+)?|/[\w./-]+|[A-Z]:\\[\w\\. -]+|\s+", " ", (text or "").lower())
    return C.short_hash(t.strip()[-800:])


def load_verdict(root, hf):
    """Return (verdict dict or None, problem or None)."""
    vjson, vmd = os.path.join(hf, "verify.json"), os.path.join(hf, "VERIFY.md")
    src = vjson if os.path.isfile(vjson) else vmd if os.path.isfile(vmd) else None
    if not src:
        return None, "No .hackforge/verify.json — run hackforge:verify."
    if os.path.getmtime(src) + 1 < newest_source_mtime(root):
        return None, f"{os.path.basename(src)} is older than your latest code change — run hackforge:verify again."
    if src == vjson:
        v = C.read_json(vjson)
        if not isinstance(v, dict):
            return None, "verify.json is not valid JSON (schema hackforge-verify.v1) — rewrite it."
        return v, None
    text = C.read_text(vmd, "")
    m = re.search(r"^COMPLIANCE:\s*(PASS|FAIL)", text, re.M | re.I)
    s = re.search(r"^MOCK_SCORE:\s*([0-9]+(?:\.[0-9]+)?)", text, re.M)
    return {"schema": "legacy-md", "compliance": m.group(1).upper() if m else "FAIL",
            "mock_score": float(s.group(1)) if s else None, "findings": []}, None


def run_gate(root, hf, loop):
    gate = os.path.join(hf, "gate.sh")
    if not os.path.isfile(gate):
        return False, "", ".hackforge/gate.sh is missing — write it (build + tests + acceptance checks + metric threshold)."
    bash = C.find_bash()
    if not bash:
        return False, "", "No usable bash found to run gate.sh (on Windows install Git for Windows: winget install -e --id Git.Git)."
    try:
        script = C.read_text(gate, "").replace("\r\n", "\n").replace("\r", "\n")
        r = subprocess.run([bash, "-c", script, gate], cwd=root, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=int(loop.get("gate_timeout", 900)))
        tail = (r.stdout + r.stderr).strip()[-1500:]
        if r.returncode == 0:
            return True, tail, None
        return False, tail, f"gate.sh failed (exit {r.returncode}). Last output:\n{tail}"
    except subprocess.TimeoutExpired:
        return False, "timeout", "gate.sh timed out — make it faster or raise gate_timeout in LOOP.json."


def evaluate(root):
    hf = C.hf_dir(root)
    loop_path = os.path.join(hf, "LOOP.json")
    loop = C.read_json(loop_path)
    if not isinstance(loop, dict) or not loop.get("active"):
        return {"active": False}

    def finish(reason):
        loop.update(active=False, ended_reason=reason, ended_at=C.now_iso())
        C.write_json(loop_path, loop)
        return {"active": True, "finished": True, "reason": reason, "loop": loop}

    # Kill switch, deadline freeze, time cap, iteration cap
    stop = os.path.join(hf, "STOP_LOOP")
    if os.path.exists(stop):
        os.remove(stop)
        return finish("stopped by user (STOP_LOOP)")
    now = datetime.now(timezone.utc)
    for key in ("deadline", "started_at"):
        if not loop.get(key):
            continue
        try:
            t = datetime.fromisoformat(str(loop[key]).replace("Z", "+00:00"))
            t = t if t.tzinfo else t.astimezone()
        except ValueError:
            continue
        if key == "deadline" and now >= t - timedelta(minutes=float(loop.get("reserve_minutes", 90))):
            return finish("deadline freeze reached — stop changing code and prepare the submission")
        if key == "started_at" and loop.get("max_hours") and now - t >= timedelta(hours=float(loop["max_hours"])):
            return finish(f"time cap of {loop['max_hours']} h reached")
    it = int(loop.get("iteration", 0))
    if it >= int(loop.get("max_iterations", 30)):
        return finish(f"iteration cap ({it}) reached")

    problems = []

    # 1. Integrity
    integ = I.check(root)
    if not integ["ok"]:
        problems.insert(0, "INTEGRITY VIOLATION — revert these changes (git restore / git revert) or ask the user to approve them "
                           "with `bash .hackforge/approve.sh <path> \"reason\"`:\n    " +
                        "\n    ".join(f"{v['rule']} {v['detail']}" for v in integ["violations"][:6]))

    # 2. gate.sh
    gate_ok, gate_tail, gate_problem = run_gate(root, hf, loop)
    if gate_problem:
        problems.append(gate_problem)

    # 3. Verdict
    verdict, vproblem = load_verdict(root, hf)
    compliant, score, findings = False, None, []
    if vproblem:
        problems.append(vproblem)
    else:
        compliant = str(verdict.get("compliance", "")).upper() == "PASS"
        if not compliant:
            problems.append("Compliance is not PASS — fix every failing hard rule / deliverable first.")
        try:
            score = float(verdict["mock_score"]) if verdict.get("mock_score") is not None else None
        except (TypeError, ValueError):
            score = None
        if score is None:
            problems.append("verify.json has no numeric mock_score.")
        findings = [f for f in verdict.get("findings", []) if isinstance(f, dict)]
        crit = [f for f in findings if str(f.get("severity", "")).lower() == "critical"]
        if crit:
            problems.append("Critical findings: " + "; ".join(str(f.get("title", ""))[:90] for f in crit[:3]))
    target = float(loop.get("target_score", 9.0))
    if score is not None and score < target:
        problems.append(f"Mock judge score {score} < target {target}.")

    # Ledger (one line per iteration) — feeds repeated-findings detection and /hackforge:retro
    top = [str(f.get("title", "")) for f in findings
           if str(f.get("severity", "major")).lower() in ("critical", "major")][:5] or \
          [str(f.get("title", "")) for f in findings[:5]]
    entry = {"at": C.now_iso(), "iteration": it + 1, "gate_ok": gate_ok,
             "gate_sig": None if gate_ok else failure_signature(gate_tail),
             "gate_tail": None if gate_ok else (gate_tail or "")[-300:],
             "compliance": "PASS" if compliant else "FAIL", "score": score,
             "findings": top, "integrity_violations": [v["rule"] for v in integ["violations"]]}
    ledger_path = os.path.join(hf, "ledger.jsonl")
    history = C.read_jsonl(ledger_path)[-6:]
    C.append_jsonl(ledger_path, entry)
    history.append(entry)

    # Score plateau
    best = loop.get("best_score")
    if score is not None:
        if best is None or score >= float(best) + 0.1:
            loop["best_score"], loop["no_gain_streak"] = score, 0
        else:
            loop["no_gain_streak"] = int(loop.get("no_gain_streak", 0)) + 1

    clean = gate_ok and compliant and integ["ok"]
    full = str((verdict or {}).get("mode", "full")).lower() == "full"
    if clean and score is not None and score >= target and not any(
            str(f.get("severity", "")).lower() == "critical" for f in findings):
        if full:
            return finish(f"done — gate green, compliant, integrity intact, score {score} ≥ {target} (full verify)")
        problems.insert(0, f"Quick verify says {score} ≥ {target}. Run a FULL verify (`/hackforge:verify full`) to confirm before the loop can finish.")
    if clean and loop.get("no_gain_streak", 0) >= int(loop.get("plateau_limit", 3)):
        return finish(f"plateau — no +0.1 gain for {loop['no_gain_streak']} iterations (best {loop.get('best_score')})")

    # Advisor triggers — each consulted once; if the same trigger fires again on evidence gathered entirely
    # after the advice was taken, a human decision is needed.
    triggers = []
    if not gate_ok and len(history) >= 2 and history[-2].get("gate_sig") == entry["gate_sig"]:
        triggers.append(("retry-threshold", entry["gate_sig"], "gate.sh failed twice with the same failure", history[-2].get("iteration", 0)))
    if len(history) >= 3 and all(h.get("findings") for h in history[-3:]):
        a, b, c = (C.tokens(" ".join(h["findings"])) for h in history[-3:])
        sim = (C.jaccard(a, b) + C.jaccard(b, c)) / 2
        if sim >= float(loop.get("repeat_threshold", 0.6)):
            triggers.append(("repeated-findings", "", f"the judge raised nearly the same findings 3 times (similarity {sim:.2f})",
                             history[-3].get("iteration", 0)))
    consulted = loop.setdefault("advisor", {})
    for code, sig, why, window_start in triggers:
        th = C.short_hash(code, sig)
        rec = consulted.get(th) or {}
        if rec.get("answered"):
            if window_start > int(rec.get("answered_iteration", 0)):
                return finish(f"stuck — {why} even after the advisor's {rec.get('decision')}; needs a human decision")
            continue
        resp = C.read_json(os.path.join(hf, "advisor", f"{th}.json"))
        if isinstance(resp, dict) and str(resp.get("decision", "")).upper() in ("PLAN", "CORRECTION", "STOP"):
            d = resp["decision"].upper()
            consulted[th] = {"reason_code": code, "answered": True, "decision": d, "answered_iteration": it + 1,
                             "summary": str(resp.get("summary", ""))[:300], "at": C.now_iso()}
            if d == "STOP":
                return finish(f"advisor STOP — {resp.get('summary', '')}"[:300])
        else:
            consulted[th] = {"reason_code": code, "answered": False, "requested_at": C.now_iso()}
            problems.insert(0, (f"ADVISOR REQUIRED ({code}: {why}). Before changing anything else, launch hackforge:advisor with an "
                                f"advisor-request (reason_code={code}, trigger={th}, the last error, what was tried, .hackforge/RESUME.md) "
                                f"and save its JSON answer exactly to .hackforge/advisor/{th}.json, then follow it."))
    for th, rec in consulted.items():
        if rec.get("answered") and rec.get("decision") in ("PLAN", "CORRECTION"):
            problems.insert(0, f"Advisor {rec['decision']} in effect (.hackforge/advisor/{th}.json): {rec.get('summary', '')}")

    loop["iteration"] = it + 1
    C.write_json(loop_path, loop)
    return {"active": True, "finished": False, "problems": problems, "loop": loop, "integrity": integ}


def refresh_side_outputs(root):
    try:
        import hf_tools
        hf_tools.write_resume(root)
        hf_tools.write_views(root, which=("progress",))
    except Exception:
        pass


def main():
    data = {}
    if not STATUS_MODE:
        try:
            raw = sys.stdin.read()
            data = json.loads(raw) if raw.strip() else {}
        except ValueError:
            data = {}
    root = C.project_root(data)
    loop0 = C.read_json(os.path.join(C.hf_dir(root), "LOOP.json"), {}) or {}
    if not STATUS_MODE and loop0.get("active") and loop0.get("mode") == "wake":
        emit({})  # wake mode: /loop + ScheduleWakeup drive iterations; the Stop hook never blocks
    res = evaluate(root)
    if res.get("active"):
        refresh_side_outputs(root)
    loop = res.get("loop", {}) if res.get("active") else {}

    if STATUS_MODE:
        print(json.dumps({"active": res.get("active", False), "finished": res.get("finished", False),
                          "reason": res.get("reason"), "problems": res.get("problems", []),
                          "iteration": loop.get("iteration"), "best_score": loop.get("best_score")}, ensure_ascii=False))
        return
    if not res.get("active"):
        emit({})
    if res.get("finished"):
        emit({"decision": "block",
              "reason": f"HackForge loop ended: {res['reason']}. Write the final summary for the user as the perfect skill "
                        "describes (why it stopped, start → end score, changes, anything still failing), then stop.",
              "systemMessage": f"HackForge loop ended: {res['reason']}"})
    left = f" Deadline: {loop['deadline']} (freeze {loop.get('reserve_minutes', 90)} min before)." if loop.get("deadline") else ""
    emit({"decision": "block",
          "reason": (f"HackForge loop — iteration {loop.get('iteration')}/{loop.get('max_iterations', 30)}. Not done yet:\n- "
                     + "\n- ".join(res["problems"])
                     + f"\nBest score so far: {loop.get('best_score')}.{left}\n"
                     "Work from .hackforge/RESUME.md. Pick ONE item (integrity > advisor > rules > gate > biggest score gain per hour), "
                     "hand it to a fresh hackforge:builder with RESUME.md and the milestone contract, run gate.sh, run hackforge:verify, "
                     "commit if better or revert if worse, log it in LOOP.md, then end your turn. "
                     "Never weaken gate.sh, tests, configs or thresholds.")})


if __name__ == "__main__":
    main()
