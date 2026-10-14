#!/usr/bin/env python3
"""HackForge tools — run through the launcher: bash hf-run.sh tools <command> [args]

  verify-md                      render verify.json as VERIFY.md (stable format for humans and dashboards)
  resume                         write .hackforge/RESUME.md (state pack for fresh-context workers / after compaction)
  views [brief|progress|accept|all]  write one-page HTML decision views to .hackforge/views/
  scope <contract.json> [base] [head]  check a branch's changed files against the contract's owned paths
  permissions [--apply]          propose (or, after the user agreed, merge) a .claude/settings.local.json allowlist
  lessons-propose                propose cross-hackathon lessons from this project's ledger (proposal only)
  lessons-add "<lesson>"         append an approved lesson to ~/.hackforge/lessons.md (only after the user approved it)
  lessons-show                   print saved lessons (kickoff loads them as advisory directives)
Ideas adapted from Claude Code Harness (MIT): resume packs, sprint-contract scope leash, plan-time
pre-approval, Plan Brief / Progress / Acceptance surfaces, and the human-approved failure codifier.
"""
import fnmatch, html, json, os, re, sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hf_common as C  # noqa: E402

# ------------------------------------------------------------------ resume pack


def _tail_lines(text, n):
    return "\n".join([l for l in (text or "").splitlines() if l.strip()][-n:])


def write_resume(root):
    hf = C.hf_dir(root)
    rd = lambda n, d="": C.read_text(os.path.join(hf, n), d) or d  # noqa: E731
    loop = C.read_json(os.path.join(hf, "LOOP.json"), {}) or {}
    verdict = C.read_json(os.path.join(hf, "verify.json"), {}) or {}
    ledger = C.read_jsonl(os.path.join(hf, "ledger.jsonl"))[-3:]
    adv = []
    adv_dir = os.path.join(hf, "advisor")
    if os.path.isdir(adv_dir):
        for f in sorted(os.listdir(adv_dir))[-3:]:
            a = C.read_json(os.path.join(adv_dir, f), {}) or {}
            adv.append(f"- {f}: {a.get('decision')} — {a.get('summary', '')}")
    try:
        import hf_integrity as I
        integ = I.check(root)
        integ_line = "not locked" if not integ["locked"] else ("OK" if integ["ok"] else "; ".join(v["detail"] for v in integ["violations"][:3]))
    except Exception:
        integ_line = "unknown"
    findings = verdict.get("findings", [])[:6]
    parts = [
        "# HackForge resume pack (auto-generated — read this instead of the whole history)",
        f"_Updated {C.now_iso()}_",
        "## Goal and decision", rd("DECISION.md")[:1500] or "—",
        "## State", rd("STATE.md")[:1200],
        "## Team directives", rd("DIRECTIVES.md")[:1000],
        "## Loop", (f"iteration {loop.get('iteration')}/{loop.get('max_iterations')} · best {loop.get('best_score')} · "
                    f"target {loop.get('target_score')} · active {loop.get('active')}") if loop else "not running",
        "## Last iterations (LOOP.md)", _tail_lines(rd("LOOP.md"), 5) or "—",
        "## Latest verdict", (f"compliance {verdict.get('compliance')} · mock score {verdict.get('mock_score')} · gate {verdict.get('gate')}"
                              if verdict else "no verify.json yet"),
        "\n".join(f"- [{f.get('severity')}] {f.get('title')} → {f.get('fix', '')}" for f in findings if isinstance(f, dict)) or "",
        "## Recent gate results",
        "\n".join(f"- #{e.get('iteration')}: gate {'ok' if e.get('gate_ok') else 'FAIL'} · score {e.get('score')} · "
                  f"{(e.get('gate_tail') or '')[-160:]}" for e in ledger) or "—",
        "## Advisor", "\n".join(adv) or "no consultations",
        "## Integrity", integ_line,
        "## Rules", "Hard rules: .hackforge/RULES.md. Contracts: .hackforge/contracts/. Never weaken gate.sh, tests, configs or thresholds.",
    ]
    C.write_text(os.path.join(hf, "RESUME.md"), "\n\n".join(p for p in parts if p is not None).strip() + "\n")


# ------------------------------------------------------------------ HTML views

CSS = """:root{--bg:#f7f8fa;--card:#fff;--ink:#16181d;--mute:#5d6470;--line:#e3e6eb;--ok:#1f8a4c;--warn:#b7791f;--bad:#c53030;--acc:#2b5fd9}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--card:#1b1e23;--ink:#e9ecf1;--mute:#9aa3ae;--line:#2b3038;--ok:#48bb78;--warn:#ecc94b;--bad:#fc8181;--acc:#7aa2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px}
.sub{color:var(--mute);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpi b{display:block;font-size:24px}.kpi span{color:var(--mute);font-size:13px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--mute);font-weight:600}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.pill{display:inline-block;padding:3px 10px;border-radius:99px;font-weight:700}
.pill.ship{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}.pill.wait{background:color-mix(in srgb,var(--warn) 20%,transparent);color:var(--warn)}
.pill.reject{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}code{font-size:13px}.md p{margin:.5em 0}.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--acc)}svg{max-width:100%}"""


def md_to_html(md):
    out, lines, i = [], (md or "").splitlines(), 0
    inline = lambda s: re.sub(r"`([^`]+)`", r"<code>\1</code>", re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", html.escape(s)))  # noqa: E731
    while i < len(lines):
        l = lines[i]
        if l.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            out.append("<pre><code>" + html.escape("\n".join(lines[i + 1:j])) + "</code></pre>"); i = j + 1; continue
        if l.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            head = [c.strip() for c in l.strip().strip("|").split("|")]
            rows, j = [], i + 2
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")]); j += 1
            out.append("<table><tr>" + "".join(f"<th>{inline(h)}</th>" for h in head) + "</tr>" +
                       "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows) + "</table>")
            i = j; continue
        m = re.match(r"^(#{1,4})\s+(.*)", l)
        if m:
            lvl = min(len(m.group(1)) + 1, 4); out.append(f"<h{lvl}>{inline(m.group(2))}</h{lvl}>")
        elif re.match(r"^\s*([-*]|\d+\.)\s+", l):
            items = []
            while i < len(lines) and re.match(r"^\s*([-*]|\d+\.)\s+", lines[i]):
                items.append(re.sub(r"^\s*([-*]|\d+\.)\s+", "", lines[i])); i += 1
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ul>"); continue
        elif l.strip():
            out.append(f"<p>{inline(l)}</p>")
        i += 1
    return "\n".join(out)


def page(title, sub, body):
    return (f"<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>{html.escape(title)}</title><style>{CSS}</style><main><h1>{html.escape(title)}</h1>"
            f"<p class=sub>{html.escape(sub)}</p>{body}</main></html>")


def sparkline(values, w=420, h=60):
    vals = [v for v in values if isinstance(v, (int, float))]
    if len(vals) < 2:
        return ""
    lo, hi = min(vals), max(vals)
    span = (hi - lo) or 1
    pts = " ".join(f"{i * w / (len(vals) - 1):.1f},{h - 6 - (v - lo) / span * (h - 12):.1f}" for i, v in enumerate(vals))
    return (f"<svg viewBox='0 0 {w} {h}' role=img aria-label='score history'><polyline fill=none stroke='var(--acc)' "
            f"stroke-width=2.5 points='{pts}'/></svg><div class=sub>score {vals[0]} → {vals[-1]} over {len(vals)} iterations</div>")


def plan_rows(root):
    rows = []
    for line in (C.read_text(os.path.join(C.hf_dir(root), "PLAN.md"), "") or "").splitlines():
        m = re.match(r"^\|\s*(M\d+)\s*\|(.*)\|\s*$", line)
        if m:
            cells = [c.strip() for c in m.group(2).split("|")]
            status = cells[-1] if cells else ""
            rows.append((m.group(1), cells[0] if cells else "", status))
    return rows


def write_views(root, which=("brief", "progress", "accept")):
    hf = C.hf_dir(root)
    vd = os.path.join(hf, "views")
    os.makedirs(vd, exist_ok=True)
    rd = lambda n: C.read_text(os.path.join(hf, n), "") or ""  # noqa: E731
    stamp = f"Generated {C.now_iso()} from .hackforge/ — regenerate with: hf-run.sh tools views"
    written = []
    if "brief" in which:
        body = (f"<div class=card md>{md_to_html(rd('DECISION.md')) or '<p>No decision yet.</p>'}</div>"
                f"<h2>Options and scores</h2><div class=card md>{md_to_html(rd('OPTIONS.md')) or '<p>—</p>'}</div>"
                f"<h2>Rules we must not break</h2><div class=card md>{md_to_html(rd('RULES.md')[:6000]) or '<p>—</p>'}</div>")
        C.write_text(os.path.join(vd, "brief.html"), page("Plan brief", stamp, body)); written.append("brief.html")
    if "progress" in which:
        rows = plan_rows(root)
        done = sum(1 for r in rows if re.search(r"✅|done|complete", r[2], re.I))
        loop = C.read_json(os.path.join(hf, "LOOP.json"), {}) or {}
        ledger = C.read_jsonl(os.path.join(hf, "ledger.jsonl"))
        verdict = C.read_json(os.path.join(hf, "verify.json"), {}) or {}
        pct = int(100 * done / len(rows)) if rows else 0
        kp = [("Milestones", f"{done}/{len(rows)}"), ("Mock score", verdict.get("mock_score", "—")),
              ("Compliance", verdict.get("compliance", "—")), ("Loop", f"{loop.get('iteration', 0)}/{loop.get('max_iterations', '—')}" if loop else "off")]
        body = ("<div class=kpis>" + "".join(f"<div class='card kpi'><b>{html.escape(str(v))}</b><span>{k}</span></div>" for k, v in kp) + "</div>"
                f"<div class=card><div class=bar><i style='width:{pct}%'></i></div><div class=sub>{pct}% of milestones done (task count, not an acceptance rate)</div></div>"
                "<h2>Milestones</h2><div class=card><table><tr><th>M</th><th>Goal</th><th>Status</th></tr>" +
                "".join(f"<tr><td>{html.escape(a)}</td><td>{html.escape(b)}</td><td>{html.escape(c)}</td></tr>" for a, b, c in rows) +
                "</table></div>" + (f"<h2>Score history</h2><div class=card>{sparkline([e.get('score') for e in ledger])}</div>" if ledger else "") +
                f"<h2>Open questions</h2><div class='card md'>{md_to_html(_section(rd('STATE.md'), 'Risks')) or '<p>—</p>'}</div>")
        C.write_text(os.path.join(vd, "progress.html"), page("Progress", stamp, body)); written.append("progress.html")
    if "accept" in which:
        v = C.read_json(os.path.join(hf, "verify.json"), {}) or {}
        crit = [c for c in v.get("criteria", []) if isinstance(c, dict)]
        comp = [c for c in v.get("compliance_items", []) if isinstance(c, dict)]
        verified = sum(1 for c in crit if str(c.get("status", "")).lower() == "pass")
        ratio = verified / len(crit) if crit else 0
        critical = [f for f in v.get("findings", []) if str(f.get("severity", "")).lower() == "critical"]
        rec = ("ship" if v.get("compliance") == "PASS" and v.get("gate") == "PASS" and not critical and ratio >= 0.8
               else "wait" if v.get("compliance") == "PASS" and ratio >= 0.5 else "reject")
        cls = lambda s: "ok" if str(s).lower() == "pass" else "bad" if str(s).lower() == "fail" else "warn"  # noqa: E731
        blind = v.get("blind_judge") or {}
        body = (f"<div class=card><span class='pill {rec}'>{rec.upper()}</span> &nbsp; compliance <b>{html.escape(str(v.get('compliance', '—')))}</b>"
                f" · gate <b>{html.escape(str(v.get('gate', '—')))}</b> · mock score <b>{html.escape(str(v.get('mock_score', '—')))}</b>"
                f" · criteria verified {verified}/{len(crit)}<div class=sub>ship ≥ 80 % verified with compliance and gate passing and no critical findings; "
                f"wait ≥ 50 %; otherwise reject. Not-observed counts as not verified.</div></div>"
                "<h2>Judging criteria</h2><div class=card><table><tr><th>ID</th><th>Criterion</th><th>Score</th><th>Status</th><th>Evidence</th></tr>" +
                "".join(f"<tr><td>{html.escape(str(c.get('id', '')))}</td><td>{html.escape(str(c.get('name', '')))}</td><td>{html.escape(str(c.get('score', '')))}</td>"
                        f"<td class={cls(c.get('status'))}>{html.escape(str(c.get('status', 'not_observed')))}</td><td>{html.escape(str(c.get('evidence', '')))[:300]}</td></tr>" for c in crit) +
                "</table></div><h2>Rules and deliverables</h2><div class=card><table><tr><th>ID</th><th>Status</th><th>Evidence</th></tr>" +
                "".join(f"<tr><td>{html.escape(str(c.get('id', '')))}</td><td class={cls(c.get('status'))}>{html.escape(str(c.get('status', '')))}</td>"
                        f"<td>{html.escape(str(c.get('evidence', '')))[:300]}</td></tr>" for c in comp) +
                "</table></div>" +
                (f"<h2>Blind first impression</h2><div class=card><p>{html.escape(str(blind.get('impression', '')))}</p>"
                 f"<p class=sub>Divergence from the rubric judges: {html.escape(str(blind.get('divergence', '—')))}</p></div>" if blind else "") +
                "<h2>Open findings</h2><div class=card><ul>" +
                "".join(f"<li><b>{html.escape(str(f.get('severity', '')))}</b> {html.escape(str(f.get('title', '')))} — {html.escape(str(f.get('fix', '')))}</li>"
                        for f in v.get("findings", [])[:12] if isinstance(f, dict)) + "</ul></div>" +
                ("<h2>Unverified</h2><div class=card><ul>" + "".join(f"<li>{html.escape(str(x))}</li>" for x in v.get("unverified", [])) + "</ul></div>"
                 if v.get("unverified") else ""))
        C.write_text(os.path.join(vd, "accept.html"), page("Acceptance — ship, wait or reject?", stamp, body)); written.append("accept.html")
    return written


def _section(md, name):
    m = re.search(rf"^.*{name}.*$", md or "", re.M | re.I)
    return md[m.start():m.start() + 1200] if m else ""


# ------------------------------------------------------------------ VERIFY.md (human + dashboard view of verify.json)


def write_verify_md(root):
    """Render verify.json as VERIFY.md in the stable format Harness's dashboard and older tools parse:
    COMPLIANCE:/MOCK_SCORE:/GATE: header lines, a compliance table with ✅/❌, a mock-score table, a fix order."""
    hf = C.hf_dir(root)
    v = C.read_json(os.path.join(hf, "verify.json"))
    if not isinstance(v, dict):
        print("No valid .hackforge/verify.json"); return 2
    mark = lambda s: "✅ pass" if str(s).lower() == "pass" else "❌ fail" if str(s).lower() == "fail" else "⬜ not observed"  # noqa: E731
    cell = lambda x: str(x if x is not None else "").replace("|", "/").replace("\n", " ")[:220]  # noqa: E731
    lines = [f"COMPLIANCE: {v.get('compliance', 'FAIL')}",
             f"MOCK_SCORE: {v.get('mock_score', '')}",
             f"GATE: {v.get('gate', 'FAIL')}",
             f"MODE: {v.get('mode', 'full')}",
             f"INTEGRITY: {v.get('integrity', 'unknown')}",
             "", f"_Generated from verify.json {v.get('generated_at', C.now_iso())} — do not edit by hand._", "",
             "## Compliance  (must be all ✅ to submit)", "", "| ID | Status | Evidence | Fix |", "|---|---|---|---|"]
    for c in v.get("compliance_items", []):
        if isinstance(c, dict):
            lines.append(f"| {cell(c.get('id'))} | {mark(c.get('status'))} | {cell(c.get('evidence'))} | {cell(c.get('fix'))} |")
    lines += ["", f"## Mock score: {v.get('mock_score', '—')} / 10", "", "| ID | Criterion | Score | Weight | Status | Evidence |", "|---|---|---|---|---|---|"]
    for c in v.get("criteria", []):
        if isinstance(c, dict):
            lines.append(f"| {cell(c.get('id'))} | {cell(c.get('name'))} | {cell(c.get('score'))} | {cell(c.get('weight'))} | {cell(c.get('status'))} | {cell(c.get('evidence'))} |")
    fnd = [f for f in v.get("findings", []) if isinstance(f, dict)]
    rank = {"critical": 0, "major": 1, "minor": 2}
    fnd.sort(key=lambda f: (rank.get(str(f.get("severity", "")).lower(), 3), -(float(f.get("gain") or 0) / max(float(f.get("hours") or 1), 0.25))))
    lines += ["", "## Fix order", ""] + [f"{i}. [{f.get('severity', '')}] {f.get('title', '')} — {f.get('fix', '')}" for i, f in enumerate(fnd[:12], 1)]
    if v.get("blind_judge"):
        b = v["blind_judge"]
        lines += ["", "## Blind first impression", "", f"{b.get('impression', '')} (vote: {b.get('vote', '—')})", f"Divergence: {b.get('divergence', '—')}"]
    if v.get("unverified"):
        lines += ["", "## Not observed", ""] + [f"- {x}" for x in v["unverified"]]
    C.write_text(os.path.join(hf, "VERIFY.md"), "\n".join(lines) + "\n")
    return 0


# ------------------------------------------------------------------ scope leash


def scope(root, contract_path, base="main", head="HEAD"):
    c = C.read_json(os.path.join(root, contract_path) if not os.path.isabs(contract_path) else contract_path)
    if not c:
        print(f"Cannot read contract {contract_path}"); return 2
    owned = c.get("owned", [])
    rc, outp = C.git(root, "diff", "--name-only", f"{base}...{head}")
    if rc != 0:
        rc, outp = C.git(root, "diff", "--name-only", base, head)
    changed = [p for p in outp.splitlines() if p and not p.startswith(".hackforge/")]
    match = lambda p: any(fnmatch.fnmatch(p, g) or p.startswith(g.rstrip("*").rstrip("/") + "/") for g in owned)  # noqa: E731
    outside = [p for p in changed if not match(p)]
    untouched = [g for g in owned if not any(fnmatch.fnmatch(p, g) or p.startswith(g.rstrip("*").rstrip("/") + "/") for p in changed)]
    print(json.dumps({"contract": c.get("milestone"), "changed": changed, "out_of_scope": outside, "owned_untouched": untouched}, indent=2))
    return 3 if outside else 0


# ------------------------------------------------------------------ plan-time permissions


def permissions(root, apply=False):
    hf = C.hf_dir(root)
    cmds = set()
    for f in sorted(os.listdir(os.path.join(hf, "contracts"))) if os.path.isdir(os.path.join(hf, "contracts")) else []:
        c = C.read_json(os.path.join(hf, "contracts", f), {}) or {}
        cmds.update(c.get("validation_commands", []))
        cmds.update(d.get("command") for d in c.get("dod", []) if isinstance(d, dict) and d.get("command"))
    for line in (C.read_text(os.path.join(hf, "gate.sh"), "") or "").splitlines():
        s = line.strip()
        if s and not s.startswith(("#", "set ", "for ", "done", "if ", "fi", "then", "else", "[", "{", "}")):
            cmds.add(s)
    rules = {"Bash(bash .hackforge/gate.sh)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git add:*)", "Bash(git commit:*)",
             "Bash(git restore:*)", "Bash(git revert:*)", "Bash(git log:*)", "Bash(git worktree:*)", "Bash(git cherry-pick:*)", "Bash(git merge:*)"}
    for cmd in cmds:
        w = re.split(r"\s+", cmd.strip().lstrip("$").strip())
        if not w or not w[0] or "=" in w[0] or w[0] in ("rm", "sudo", "curl", "wget", "ssh", "scp"):
            continue
        first = w[0] if w[0] not in ("$PY", "${PY}") else "python"
        if first in ("python", "python3", "py") and len(w) > 2 and w[1] == "-m":
            rules.add(f"Bash({first} -m {w[2]}:*)")
        elif len(w) > 1 and first in ("npm", "npx", "pnpm", "yarn", "bun", "python", "python3", "py", "uv", "poetry", "cargo", "go", "make", "node"):
            rules.add(f"Bash({first} {w[1]}:*)")
        else:
            rules.add(f"Bash({first}:*)")
    proposal = {"permissions": {"allow": sorted(rules)}}
    C.write_json(os.path.join(hf, "permissions.proposed.json"), proposal)
    if not apply:
        print(json.dumps(proposal, indent=2))
        print("\nProposal saved to .hackforge/permissions.proposed.json. Show it to the user; only after they agree run: tools permissions --apply")
        return 0
    path = os.path.join(root, ".claude", "settings.local.json")
    cur = C.read_json(path, {}) or {}
    allow = set(cur.setdefault("permissions", {}).setdefault("allow", []))
    cur["permissions"]["allow"] = sorted(allow | rules)
    C.write_json(path, cur)
    print(f"Merged {len(rules)} rule(s) into .claude/settings.local.json")
    return 0


# ------------------------------------------------------------------ lessons (human-approved)


def lessons_file():
    return os.path.join(os.path.expanduser("~"), ".hackforge", "lessons.md")


def lessons_propose(root):
    hf = C.hf_dir(root)
    ledger = C.read_jsonl(os.path.join(hf, "ledger.jsonl"))
    finding_counts, gate_counts, integ_counts = Counter(), Counter(), Counter()
    sample = {}
    for e in ledger:
        for f in e.get("findings", []):
            key = " ".join(sorted(C.tokens(f))[:6])
            if key:
                finding_counts[key] += 1; sample.setdefault(key, f)
        if e.get("gate_sig"):
            gate_counts[e["gate_sig"]] += 1; sample.setdefault(e["gate_sig"], (e.get("gate_tail") or "")[-200:])
        for r in e.get("integrity_violations", []):
            integ_counts[r] += 1
    conf = lambda n: "high" if n >= 5 else "medium" if n >= 3 else "low"  # noqa: E731
    lines = ["# Proposed lessons (NOT saved — approve each one with the user first)", "",
             "Confidence: ≥5 occurrences high, ≥3 medium (as in CCH's failure codifier). Rewrite each as a short, general rule before saving.", ""]
    for k, n in finding_counts.most_common(8):
        if n >= 2:
            lines.append(f"- [{conf(n)} · {n}×] Judges kept flagging: \"{sample[k]}\" → lesson: plan for this from the start next time.")
    for k, n in gate_counts.most_common(5):
        if n >= 2:
            lines.append(f"- [{conf(n)} · {n}×] The same gate failure repeated: `{sample[k].strip()[:160]}`")
    for r, n in integ_counts.most_common():
        lines.append(f"- [{conf(n)} · {n}×] Integrity rule {r} was hit — agents tried to weaken checks; tighten contracts earlier.")
    if len(lines) == 4:
        lines.append("- Nothing recurred often enough to propose.")
    C.write_text(os.path.join(hf, "LESSONS.proposed.md"), "\n".join(lines) + "\n")
    print("\n".join(lines))
    return 0


def lessons_add(text):
    if not text.strip():
        print("Nothing to add."); return 2
    p = lessons_file()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if not os.path.exists(p):
        C.write_text(p, "# HackForge lessons (user-approved, loaded at every kickoff)\n\n")
    with open(p, "a", encoding="utf-8", newline="\n") as f:
        f.write(f"- {text.strip()}  _(added {C.now_iso()[:10]})_\n")
    print(f"Saved to {p}")
    return 0


def main(argv):
    root = C.project_root()
    cmd = argv[0] if argv else ""
    if cmd == "resume":
        write_resume(root); print(".hackforge/RESUME.md written"); return 0
    if cmd == "views":
        which = ("brief", "progress", "accept") if len(argv) < 2 or argv[1] == "all" else (argv[1],)
        for w in write_views(root, which):
            print(os.path.join(".hackforge", "views", w))
        return 0
    if cmd == "verify-md":
        return write_verify_md(root)
    if cmd == "scope":
        if len(argv) < 2:
            print("usage: scope <contract.json> [base] [head]"); return 2
        return scope(root, argv[1], *(argv[2:4]))
    if cmd == "permissions":
        return permissions(root, apply="--apply" in argv)
    if cmd == "lessons-propose":
        return lessons_propose(root)
    if cmd == "lessons-add":
        return lessons_add(" ".join(argv[1:]))
    if cmd == "lessons-show":
        print(C.read_text(lessons_file(), "No saved lessons yet.")); return 0
    print(__doc__); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
