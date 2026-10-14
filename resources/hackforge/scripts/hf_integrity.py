#!/usr/bin/env python3
"""HackForge integrity lock — makes "never weaken the checks" enforceable.

    hf-run.sh integrity lock [--reason R]        snapshot gate.sh, tests, lint/test/CI configs, target score
    hf-run.sh integrity check [--json]           report weakening since the lock (exit 3 on violations)
    hf-run.sh integrity status                   short human summary
    .hackforge/approve.sh <path|--all> "reason"  OPERATOR ONLY: accept a deliberate change (guard blocks Claude)

Rules (deterministic, no LLM):
  I1 gate.sh only grows: every locked check line must still be there
  I2 no weakening lines added to gate.sh / CI: `|| true`, `set +e`, `|| exit 0`, `--passWithNoTests`, `continue-on-error: true`
  I3 locked test files may not be deleted
  I4 locked test files may not lose assertions
  I5 locked test files may not gain skip/only/xfail markers
  I6 locked lint/type/test-runner/CI configs may not change
  I7 the loop's target score may not be lowered
Inspired by Claude Code Harness (MIT) test-tampering rules; reimplemented for HackForge.
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hf_common as C  # noqa: E402

TEST_DIRS = {"test", "tests", "__tests__", "spec", "specs", "e2e"}
TEST_NAME = re.compile(r"(^test_.*\.py$|_test\.(py|go)$|\.(test|spec)\.[cm]?[jt]sx?$|Tests?\.(swift|java|kt|cs)$|_spec\.rb$)", re.I)
CONFIG_NAME = re.compile(
    r"^(\.eslintrc(\..*)?|eslint\.config\.[cm]?[jt]s|tsconfig(\..*)?\.json|\.prettierrc(\..*)?|prettier\.config\.[cm]?js"
    r"|biome\.jsonc?|pytest\.ini|tox\.ini|\.flake8|mypy\.ini|ruff\.toml|\.ruff\.toml|jest\.config\.[cm]?[jt]s"
    r"|vitest\.config\.[cm]?[jt]s|playwright\.config\.[cm]?[jt]s|\.pre-commit-config\.yaml)$", re.I)
ASSERT_RE = re.compile(r"\bassert\b|\bexpect\s*\(|\bself\.assert\w+|\bassert_\w+\s*\(|\.should\b|\bt\.(Error|Errorf|Fatal|Fatalf)\b|\bXCTAssert\w*|\bassert\w*\s*\(")
SKIP_RE = re.compile(r"\.(skip|only)\s*\(|\bx(it|describe|test)\s*\(|@pytest\.mark\.(skip|skipif|xfail)|\bpytest\.(skip|xfail)\s*\(|@unittest\.skip|\bt\.Skip(Now)?\(|\b(it|test)\.todo\s*\(")
WEAKEN_RE = re.compile(r"\|\|\s*true\b|^\s*set\s+\+e\b|\|\|\s*exit\s+0\b|--passWithNoTests|continue-on-error:\s*true|--exit-zero\b", re.M)


def is_test_path(p):
    parts = p.replace("\\", "/").split("/")
    return any(x.lower() in TEST_DIRS for x in parts[:-1]) or bool(TEST_NAME.search(parts[-1]))


def is_ci_path(p):
    p = p.replace("\\", "/")
    return p.startswith(".github/workflows/") or p in (".gitlab-ci.yml",) or p.startswith(".husky/")


def is_config_path(p):
    return bool(CONFIG_NAME.match(p.replace("\\", "/").split("/")[-1])) or is_ci_path(p)


def check_lines(text):
    out = []
    for line in (text or "").replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if s and not s.startswith("#"):
            out.append(s)
    return out


def counts(text):
    t = (text or "").replace("\r\n", "\n")
    return len(ASSERT_RE.findall(t)), len(SKIP_RE.findall(t))


def lock_path(root):
    return os.path.join(C.hf_dir(root), "LOCK.json")


def snapshot_entry(root, rel_path, text=None):
    text = C.read_text(os.path.join(root, rel_path)) if text is None else text
    if text is None:
        return None
    a, s = counts(text)
    kind = "gate" if rel_path == ".hackforge/gate.sh" else "test" if is_test_path(rel_path) else "config"
    e = {"kind": kind, "sha256": C.sha256_text(text.replace("\r\n", "\n"))}
    if kind == "gate":
        e["lines"] = check_lines(text)
    if kind == "test":
        e.update(asserts=a, skips=s)
    if is_ci_path(rel_path):
        e["lines"] = check_lines(text)
    return e


def lock(root, reason="baseline"):
    files = {}
    if os.path.isfile(os.path.join(root, ".hackforge", "gate.sh")):
        files[".hackforge/gate.sh"] = snapshot_entry(root, ".hackforge/gate.sh")
    for p in C.git_files(root):
        if p.startswith(".hackforge/") or "node_modules/" in p:
            continue
        if is_test_path(p) or is_config_path(p):
            e = snapshot_entry(root, p)
            if e:
                files[p] = e
    loop = C.read_json(os.path.join(C.hf_dir(root), "LOOP.json"), {}) or {}
    rc, head = C.git(root, "rev-parse", "HEAD")
    data = {"schema": "hackforge-lock.v1", "locked_at": C.now_iso(), "reason": reason,
            "commit": head.strip() if rc == 0 else None,
            "target_score": loop.get("target_score"), "files": files}
    C.write_json(lock_path(root), data)
    C.append_jsonl(os.path.join(C.hf_dir(root), "approvals.log"), {"at": C.now_iso(), "action": "lock", "reason": reason, "files": len(files)})
    write_approve_helper(root)
    return data


def write_approve_helper(root):
    # Portable: committed to the repo and used by teammates on other machines (macOS, Linux, Windows Git Bash),
    # so it finds the newest installed HackForge at run time instead of hard-coding this machine's path.
    C.write_text(os.path.join(C.hf_dir(root), "approve.sh"),
                 "#!/usr/bin/env bash\n"
                 "# OPERATOR ONLY - run this yourself in a terminal to accept a deliberate change to a locked file.\n"
                 "# Usage: bash .hackforge/approve.sh <path|--all|--unlock> \"reason\"\n"
                 'cd "$(dirname "$0")/.." || exit 1\n'
                 'HF="${HACKFORGE_PLUGIN_ROOT:+$HACKFORGE_PLUGIN_ROOT/scripts/hf-run.sh}"\n'
                 '[ -f "$HF" ] || HF="$(find "$HOME/.claude/plugins" -path "*hackforge*" -name hf-run.sh 2>/dev/null | sort | tail -1)"\n'
                 '[ -f "$HF" ] || { echo "HackForge plugin not found. Install it, or set HACKFORGE_PLUGIN_ROOT to the plugin folder."; exit 1; }\n'
                 'export CLAUDE_PROJECT_DIR="$PWD" CLAUDE_PLUGIN_ROOT="$(cd "$(dirname "$HF")/.." && pwd)"\n'
                 'exec bash -c \'eval "$(tr -d "\\r" < "$0")"\' "$HF" integrity approve "$@"\n')


def evaluate(root, path, entry, text):
    """Violations for one locked file given its current text (None = deleted)."""
    v = []
    kind = entry.get("kind")
    if text is None:
        if kind in ("test", "gate"):
            v.append(("I3" if kind == "test" else "I1", f"{path} was deleted"))
        else:
            v.append(("I6", f"locked config {path} was deleted"))
        return v
    if C.sha256_text(text.replace("\r\n", "\n")) == entry.get("sha256"):
        return v
    if kind == "gate" or entry.get("lines") is not None:
        now = check_lines(text)
        nowset = set(now)
        missing = [l for l in entry.get("lines", []) if l not in nowset]
        if kind == "gate" and missing:
            v.append(("I1", f"gate.sh lost {len(missing)} locked check line(s), e.g. `{missing[0][:80]}`"))
        added = [l for l in now if l not in set(entry.get("lines", []))]
        bad = [l for l in added if WEAKEN_RE.search(l)]
        if bad:
            v.append(("I2", f"{path}: weakening line added `{bad[0][:80]}`"))
        if is_ci_path(path) and missing:
            v.append(("I6", f"CI file {path} lost {len(missing)} line(s)"))
        return v
    if kind == "test":
        a, s = counts(text)
        if a < entry.get("asserts", 0):
            v.append(("I4", f"{path}: assertions dropped {entry.get('asserts')} → {a}"))
        if s > entry.get("skips", 0):
            v.append(("I5", f"{path}: skip/only/xfail markers added ({entry.get('skips')} → {s})"))
        return v
    v.append(("I6", f"locked config {path} changed (loosening lint/type/test config is not allowed)"))
    return v


def check(root):
    lk = C.read_json(lock_path(root))
    if not lk:
        return {"locked": False, "ok": True, "violations": [], "warnings": []}
    viol, warn = [], []
    for path, entry in (lk.get("files") or {}).items():
        text = C.read_text(os.path.join(root, path))
        found = evaluate(root, path, entry, text)
        viol += [{"rule": r, "path": path, "detail": d} for r, d in found]
        if not found and text is not None and C.sha256_text(text.replace("\r\n", "\n")) != entry.get("sha256") and entry.get("kind") == "test":
            warn.append({"path": path, "detail": "test changed without losing assertions — reviewer should confirm expectations weren't loosened"})
    loop = C.read_json(os.path.join(C.hf_dir(root), "LOOP.json"), {}) or {}
    if lk.get("target_score") is not None and loop.get("target_score") is not None:
        try:
            if float(loop["target_score"]) < float(lk["target_score"]):
                viol.append({"rule": "I7", "path": ".hackforge/LOOP.json", "detail": f"target score lowered {lk['target_score']} → {loop['target_score']}"})
        except (TypeError, ValueError):
            pass
    return {"locked": True, "ok": not viol, "violations": viol, "warnings": warn, "locked_at": lk.get("locked_at")}


def check_proposed(root, rel_path, new_text):
    """Used by the guard before a Write/Edit lands."""
    lk = C.read_json(lock_path(root))
    if not lk:
        return []
    entry = (lk.get("files") or {}).get(rel_path)
    if entry:
        return evaluate(root, rel_path, entry, new_text)
    # New file: block obvious weakening in new CI files only.
    if is_ci_path(rel_path) and WEAKEN_RE.search(new_text or ""):
        return [("I2", f"{rel_path}: weakening pattern in a new CI file")]
    return []


def approve(root, target, reason):
    lk = C.read_json(lock_path(root))
    if not lk:
        print("No lock yet."); return 1
    if not reason:
        print("A reason is required: approve.sh <path|--all|--unlock> \"why\""); return 2
    log = os.path.join(C.hf_dir(root), "approvals.log")
    if target == "--unlock":
        os.remove(lock_path(root)); C.append_jsonl(log, {"at": C.now_iso(), "action": "unlock", "reason": reason})
        print("Unlocked."); return 0
    if target == "--all":
        lock(root, reason=f"operator relock: {reason}"); print("Relocked everything."); return 0
    p = C.rel(root, target)
    e = snapshot_entry(root, p)
    files = lk.setdefault("files", {})
    if e is None:
        files.pop(p, None)
    else:
        files[p] = e
    loop = C.read_json(os.path.join(C.hf_dir(root), "LOOP.json"), {}) or {}
    if p == ".hackforge/LOOP.json":
        lk["target_score"] = loop.get("target_score")
    C.write_json(lock_path(root), lk)
    C.append_jsonl(log, {"at": C.now_iso(), "action": "approve", "path": p, "reason": reason})
    print(f"Approved current state of {p}."); return 0


def main(argv):
    root = C.project_root()
    cmd = argv[0] if argv else "status"
    if cmd == "lock":
        reason = argv[argv.index("--reason") + 1] if "--reason" in argv else "baseline"
        d = lock(root, reason); print(f"Locked {len(d['files'])} file(s) at {d['locked_at']}."); return 0
    if cmd == "check":
        r = check(root)
        if "--json" in argv:
            print(C.json.dumps(r, ensure_ascii=False))
        else:
            for x in r["violations"]:
                print(f"❌ {x['rule']} {x['detail']}")
            for x in r["warnings"]:
                print(f"⚠ {x['path']}: {x['detail']}")
            print("RESULT:", "no lock" if not r["locked"] else "OK" if r["ok"] else f"{len(r['violations'])} violation(s)")
        return 0 if r["ok"] else 3
    if cmd == "status":
        r = check(root)
        print("Integrity:", "not locked" if not r["locked"] else ("OK" if r["ok"] else f"{len(r['violations'])} violation(s)") + f" (locked {r.get('locked_at')})")
        return 0
    if cmd == "approve":
        if len(argv) < 2:
            print('Usage: approve.sh <path|--all|--unlock> "reason"'); return 2
        return approve(root, argv[1], " ".join(argv[2:]).strip())
    print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
