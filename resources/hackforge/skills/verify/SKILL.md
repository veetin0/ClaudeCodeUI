---
name: verify
description: Independent audit of a HackForge project — clean run with recorded evidence, read-only compliance audit of every rule and deliverable, a read-only judge panel, an optional rubric-free blind judge, the integrity lock — merged into verify.json, the file the loop gate trusts. Use after a milestone, before submitting, or when the user asks "are we done / is this compliant".
argument-hint: "[quick | full | final] [--blind]"
---

# HackForge verify — $ARGUMENTS

Nobody grades their own work: each step runs in a fresh agent context, and the graders have no write access.
Launch every agent with its role's model from STATE.md (`${CLAUDE_PLUGIN_ROOT}/reference/profiles.md`).

**Mode** — `quick`, `full` (default when no argument), or `final` (= full + blind judge + submission checks):
- **quick** (cheap, used inside the loop): step 1, then one generalist `hackforge:judge` scoring only the criteria the last change could affect (copy the other criteria from the previous verify.json), and reuse the previous compliance items unless dependencies, deliverables, licences or anything named in RULES.md changed — then run the auditor too. No blind judge. Write `"mode": "quick"`.
- **full**: everything below. Write `"mode": "full"`. The loop can only end as *done* on a full verify.

## 1. Evidence first
Run `hackforge:verifier`. Save its report verbatim to `.hackforge/evidence/verifier-latest.md` (and a timestamped copy). Screenshots/frames it captured stay in `.hackforge/evidence/`.

## 2. Graders in parallel (read-only, fresh context)
- `hackforge:compliance-auditor` → every R and D: pass / fail / not_observed.
- `hackforge:judge` panel per the profile — one generalist, or technical + business/sponsor + experience personas (optionally on two models). Each reads the evidence file, never re-runs or edits anything.
- `hackforge:blind-judge` when `--blind`, when `$ARGUMENTS` is `final`, or as the profile says — once per presentation artifact that exists (DEMO.md, README.md, slides exported to images, 3–5 frames of the demo video, the main UI screenshots). Give it **only** the artifact paths and one line about the audience from BRIEF.md. It never sees RULES, scores or this skill.

Pass `.hackforge/DIRECTIVES.md` to the auditor and judges (not to the blind judge).

## 3. Integrity
Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" integrity check --json`. Any violation is a **critical** finding.

## 4. Merge into `.hackforge/verify.json`
Schema `hackforge-verify.v1` (example: `${CLAUDE_PLUGIN_ROOT}/reference/schemas/verify.example.json`):
- `mode`: quick or full.
- `compliance`: PASS only if every auditor item is pass.
- `gate`: PASS/FAIL from the verifier's `gate.sh` run.
- `integrity`: OK or the violation count.
- `mock_score`: mean of the panel's `weighted_score`, one decimal. A criterion that was `not_observed` scores at most 5 — unseen is not proven.
- `criteria`: per J, the panel mean with status and evidence.
- `compliance_items`: the auditor's items.
- `findings`: merged and de-duplicated across judges; severity critical / major / minor; ranked by gain per hour; integrity violations and failed rules are critical.
- `blind_judge`: impression, vote, and **divergence** — where the blind take disagrees with the rubric judges. It never changes `mock_score`; it's a signal for the pitch.
- `design_scan` (when `.hackforge/evidence/design-scan.json` exists and says `available`): `{"available": true, "total": n, "by_category": {...}, "top_rules": [...]}` copied from it. Its `quality` findings (contrast, accessibility) become **major** findings, and repeated `slop` findings (the same rule in 3+ places) become **minor** ones, each with the file and a concrete fix. It never changes `mock_score` directly; the experience judge weighs it.
- `unverified`: everything not observed.

Then render `.hackforge/VERIFY.md` from it — never write VERIFY.md by hand: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools verify-md` (the stable format people, the Harness dashboard and older tools read), and regenerate the pages: `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" tools views all`.

## 5. Fix order
1. integrity violations (revert — never "fix" by changing the check)
2. failing hard rules / missing deliverables
3. failing gate checks
4. findings by gain per hour

If `$ARGUMENTS` is `final`, also confirm deadline and time zone, submission channel and format, repo visibility, video/slide length, that the last commit is pushed, and point the user to `.hackforge/views/accept.html` (ship / wait / reject).

Report to the user in a few lines: compliant yes/no, mock score, integrity, the top 3 fixes, and anything not observed.
