#!/usr/bin/env python3
"""HackForge guardrails — PreToolUse hook for Bash / Write / Edit / MultiEdit.

Active only inside HackForge projects (a .hackforge/ folder exists). Fails OPEN on its own
errors (logged to .hackforge/.guard-errors.log): the Stop-hook gate re-checks integrity
fail-closed, so a guard crash can never let weakened checks pass the loop.

  G1 deny  staging/committing secret files (.env, keys, credentials) — hackathon repos are often public
  G2 deny  git push --force / -f / +refspec (use --force-with-lease)
  G3 deny  --no-verify / --no-gpg-sign on git commit/push
  G4 ask   git reset --hard, git clean -fdx (prefer git restore / git revert)
  G5 deny  rm -rf on /, ~, $HOME or anything outside the project
  G6 ask   sudo
  G7 deny  agents touching loop control: LOOP.json while the loop runs, STOP_LOOP, LOCK.json, approvals.log
  G8 deny  agents running the operator-only approve command, or relocking during the loop
  G9 deny  edits that weaken locked checks (integrity rules I1–I7)
  G10 deny writes by read-only roles (judge, blind-judge, compliance-auditor, advisor)
Inspired by Claude Code Harness (MIT) guardrails R01–R16; reimplemented and scoped for hackathons.
"""
import json, os, re, shlex, subprocess, sys, traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hf_common as C  # noqa: E402
import hf_integrity as I  # noqa: E402

SECRET_RE = re.compile(
    r"(^|/)(\.env(\.(?!example$|sample$|template$)[\w.-]+)?|.*\.pem|.*\.key|.*\.p12|.*\.pfx|.*\.keystore|id_rsa\w*|id_ed25519\w*"
    r"|credentials[\w.-]*\.json|service[-_]?account[\w.-]*\.json|secrets?\.(json|ya?ml|toml)|\.npmrc|\.pypirc)$", re.I)
READ_ONLY_ROLES = ("judge", "blind-judge", "compliance-auditor", "advisor")


def out(decision, reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                             "permissionDecision": decision,
                                             "permissionDecisionReason": f"HackForge {reason}"}}))
    sys.exit(0)


def loop_state(root):
    return C.read_json(os.path.join(C.hf_dir(root), "LOOP.json"), {}) or {}


def loop_active(root):
    return bool(loop_state(root).get("active"))


def split_commands(cmd):
    return [c for c in re.split(r"&&|\|\||;|\n|\|", cmd) if c.strip()]


def words(seg):
    try:
        return shlex.split(seg, posix=True)
    except ValueError:
        return seg.split()


def git_sub(w):
    """Return (subcommand, args) for a git invocation, skipping -C dir / -c k=v."""
    if not w or os.path.basename(w[0]) not in ("git", "git.exe"):
        return None, []
    i = 1
    while i < len(w) and w[i].startswith("-"):
        i += 2 if w[i] in ("-C", "-c") else 1
    return (w[i], w[i + 1:]) if i < len(w) else (None, [])


def secret_candidates(root, which):
    """which = 'untracked' (what `git add -A/.` would pick up) or 'tracked' (what `commit -a` picks up)."""
    rc, outp = C.git(root, "status", "--porcelain", "-uall")
    found = []
    if rc != 0:
        return found
    for line in outp.splitlines():
        code, path = line[:2], line[3:].strip().strip('"')
        if " -> " in path:
            path = path.split(" -> ")[-1]
        if not SECRET_RE.search(path):
            continue
        if which == "untracked" or code != "??":
            found.append(path)
    return found


def check_bash(root, cmd, agent):
    low = cmd.lower()
    # G7 / G8 — loop control and operator-only actions
    if re.search(r"stop_loop", low):
        out("deny", "G7: only the user may create or remove .hackforge/STOP_LOOP (it is the user's kill switch).")
    if re.search(r"(\b(bash|sh|zsh|source)\s+|(^|[;&|(]\s*)\.{0,2}/)\S*approve\.sh|integrity\s+approve", low):
        out("deny", "G8: approving changes to locked checks is operator-only. Report what you want changed and why; the user runs `bash .hackforge/approve.sh <path> \"reason\"` in their own terminal.")
    if re.search(r"lock\.json|approvals\.log", low) and not re.search(r"hf-run\.sh[\"']?\s+integrity\s+(check|status)", low):
        out("deny", "G7: .hackforge/LOCK.json and approvals.log are managed by HackForge only. Use `hf-run.sh integrity status`.")
    if loop_active(root):
        if re.search(r"loop\.json", low) and re.search(r"(>|tee|sed\s+-i|mv\s|cp\s|rm\s|truncate|python|node|perl|jq)", low):
            out("deny", "G7: LOOP.json is controlled by the loop gate while the loop runs. Make the project pass instead.")
        if re.search(r"integrity\s+lock", low) and int(loop_state(root).get("iteration", 0) or 0) > 0:
            out("deny", "G8: relocking during the loop is not allowed — it would move the goalposts.")
    for seg in split_commands(cmd):
        w = words(seg)
        if not w:
            continue
        if w[0] == "sudo":
            out("ask", "G6: sudo requested — confirm this is really needed.")
        sub, args = git_sub(w)
        if sub == "add":
            named = [a for a in args if not a.startswith("-")]
            bad = [a for a in named if SECRET_RE.search(a.replace("\\", "/"))]
            if any(a in (".", "*", ":/") for a in named) or any(a in ("-A", "--all", "-u", "--update") for a in args):
                bad += secret_candidates(root, "untracked")
            if bad:
                out("deny", f"G1: refusing to stage secret file(s): {', '.join(sorted(set(bad))[:5])}. Add them to .gitignore (keep a .env.example) and stage the rest explicitly.")
        if sub == "commit":
            if any(a in ("--no-verify", "-n", "--no-gpg-sign") for a in args):
                out("deny", "G3: --no-verify/--no-gpg-sign skips the project's checks. Fix the failing hook instead.")
            if any(a in ("-a", "--all") or (a.startswith("-") and not a.startswith("--") and "a" in a[1:]) for a in args):
                bad = secret_candidates(root, "tracked")
                if bad:
                    out("deny", f"G1: `git commit -a` would include secret file(s): {', '.join(bad[:5])}.")
        if sub == "push":
            if any(a in ("--force", "-f") or (a.startswith("-") and not a.startswith("--") and "f" in a[1:]) for a in args) or any(a.startswith("+") for a in args):
                out("deny", "G2: force-push rewrites shared history. Use --force-with-lease, or push a new commit.")
            if "--no-verify" in args:
                out("deny", "G3: --no-verify skips the project's pre-push checks.")
        if sub == "reset" and "--hard" in args:
            out("ask", "G4: git reset --hard discards uncommitted work. Prefer `git restore <file>` or `git revert <commit>`.")
        if sub == "clean" and any(a.startswith("-") and ("f" in a and ("d" in a or "x" in a)) for a in args):
            out("ask", "G4: git clean -fd/-fx deletes untracked files permanently.")
        if os.path.basename(w[0]) == "rm" and any(a.startswith("-") and "r" in a.lower() for a in w[1:]):
            for t in [a for a in w[1:] if not a.startswith("-")]:
                if t in ("/", "~", "$HOME", "${HOME}", "*", "/*", "~/", "..") or t.startswith(("~", "$HOME", "${HOME}")):
                    out("deny", f"G5: refusing rm -r on `{t}`.")
                full = os.path.normpath(os.path.join(root, os.path.expanduser(t)))
                try:
                    inside = os.path.commonpath([full, os.path.normpath(root)]) == os.path.normpath(root) and full != os.path.normpath(root)
                except ValueError:
                    inside = False
                if not inside:
                    out("deny", f"G5: refusing rm -r outside the project: `{t}`.")


def post_edit_text(root, tool, ti):
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    full = path if os.path.isabs(path) else os.path.join(root, path)
    if tool == "Write":
        return path, ti.get("content", "")
    cur = C.read_text(full, "") or ""
    edits = ti.get("edits") if tool == "MultiEdit" else [ti]
    for e in edits or []:
        old, new = e.get("old_string", ""), e.get("new_string", "")
        if e.get("replace_all"):
            cur = cur.replace(old, new)
        else:
            cur = cur.replace(old, new, 1)
    return path, cur


def check_write(root, tool, ti, agent):
    path = ti.get("file_path") or ti.get("notebook_path") or ""
    relp = C.rel(root, path)
    if agent and any(agent.endswith(r) for r in READ_ONLY_ROLES):
        out("deny", f"G10: the {agent} role is read-only.")
    base = relp.split("/")[-1]
    if relp in (".hackforge/LOCK.json", ".hackforge/approvals.log", ".hackforge/approve.sh") or base == "STOP_LOOP":
        out("deny", "G7: loop-control and lock files are managed by HackForge / the user only.")
    if relp == ".hackforge/LOOP.json" and loop_active(root):
        out("deny", "G7: LOOP.json is controlled by the loop gate while the loop runs.")
    _, text = post_edit_text(root, tool, ti)
    found = I.check_proposed(root, relp, text)
    if found:
        rule, detail = found[0]
        out("deny", f"G9/{rule}: {detail}. Fix the implementation, not the check. If the check itself is genuinely wrong, "
                    f"explain why and ask the user to approve it: bash .hackforge/approve.sh {relp} \"reason\".")


def main():
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
    root = C.project_root(data)
    if not os.path.isdir(C.hf_dir(root)):
        return
    tool = data.get("tool_name", "")
    ti = data.get("tool_input") or {}
    agent = data.get("agent_type") or ""
    try:
        if tool == "Bash":
            check_bash(root, ti.get("command", ""), agent)
        elif tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
            check_write(root, tool, ti, agent)
    except SystemExit:
        raise
    except Exception:
        try:
            with open(os.path.join(C.hf_dir(root), ".guard-errors.log"), "a", encoding="utf-8") as f:
                f.write(traceback.format_exc() + "\n")
        except OSError:
            pass


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        pass
    sys.exit(0)
