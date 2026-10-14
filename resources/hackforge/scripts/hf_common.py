"""Shared helpers for HackForge scripts (macOS, Linux, Windows; Python 3.8+)."""
import hashlib, json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def project_root(data=None):
    return os.environ.get("CLAUDE_PROJECT_DIR") or (data or {}).get("cwd") or os.getcwd()


def hf_dir(root):
    return os.path.join(root, ".hackforge")


def read_text(path, default=None):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return default


def write_text(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def read_json(path, default=None):
    t = read_text(path)
    if t is None:
        return default
    try:
        return json.loads(t)
    except ValueError:
        return default


def write_json(path, obj):
    write_text(path, json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def append_jsonl(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def read_jsonl(path):
    out = []
    for line in (read_text(path, "") or "").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def sha256_text(text):
    return hashlib.sha256(text.encode("utf-8", "replace")).hexdigest()


def sha256_file(path):
    t = read_text(path)
    return None if t is None else sha256_text(t.replace("\r\n", "\n"))


def short_hash(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:12]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def git(root, *args, timeout=20):
    try:
        r = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout)
        return r.returncode, r.stdout
    except Exception:
        return 1, ""


def git_files(root):
    rc, out = git(root, "ls-files", "-co", "--exclude-standard")
    if rc == 0:
        return [p for p in out.splitlines() if p]
    files = []
    skip = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", "build"}
    for d, dirs, fs in os.walk(root):
        dirs[:] = [x for x in dirs if x not in skip]
        for f in fs:
            files.append(os.path.relpath(os.path.join(d, f), root).replace(os.sep, "/"))
        if len(files) > 20000:
            break
    return files


def rel(root, path):
    p = os.path.normpath(os.path.join(root, path)) if not os.path.isabs(path) else os.path.normpath(path)
    try:
        r = os.path.relpath(p, root)
    except ValueError:  # different drive on Windows
        return p.replace(os.sep, "/")
    return r.replace(os.sep, "/")


def find_bash():
    """Git Bash on Windows (never System32\\bash.exe, which is WSL), plain bash elsewhere."""
    cands = [os.environ.get("HF_BASH"), os.environ.get("CLAUDE_CODE_GIT_BASH_PATH")]
    if os.name == "nt":
        for base in (os.environ.get("ProgramFiles", r"C:\Program Files"),
                     os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
                     os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs")):
            cands.append(os.path.join(base, "Git", "bin", "bash.exe"))
    cands.append(shutil.which("bash"))
    for c in cands:
        if c and os.path.isfile(c) and "system32" not in c.lower():
            return c
    return None


def tokens(text):
    stop = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "be", "with", "it",
            "not", "no", "add", "fix", "make", "more", "missing", "should", "could", "this", "that"}
    return {w for w in re.findall(r"[a-z0-9]+", (text or "").lower()) if len(w) > 2 and w not in stop}


def jaccard(a, b):
    if not a and not b:
        return 1.0
    return len(a & b) / max(1, len(a | b))
