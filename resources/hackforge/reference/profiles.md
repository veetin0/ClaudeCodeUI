# HackForge profiles, plans and budgets

A **profile** sets how much HackForge spends — agents, models, depth, loop length. Your **plan** decides which models are sensible to use. Set both in `challenge/hackforge.yaml`; any `models:` entry overrides the tables for that role, and a model you name always wins.

## Your plan (`plan:`)

| plan | default profile | models HackForge uses by default |
|---|---|---|
| `pro` | **lean** | Sonnet for most work, Opus only for the few high-leverage calls (architects, advisor), Haiku for checks. **Never Fable** — on Pro and standard Team seats Fable isn't in your plan limits and bills to pay-as-you-go usage credits. |
| `team` | standard | as `pro` unless you set `fable_ok: true` (premium seats include Fable within limits) |
| `max` | standard | Opus where it matters; Fable only in the `max` profile or when you set it under `models:` (Fable counts against your weekly limits, capped at 50 %) |
| `api` | standard | as `max`, billed per token |
| `auto` | — | treated as `pro` (the safe choice) until you say otherwise |

Fable is never chosen unless `plan` is `max`/`api` (or `team` with `fable_ok: true`) **and** either the profile is `max` or you named it in `models:`. If a model is refused on your account, use the next one down (fable → opus → sonnet → haiku) and note it in STATE.md.

## Profiles

| | lean | sprint | standard | deep | max |
|---|---|---|---|---|---|
| Use for | Pro plan, any length; keep usage low | < 8 h, puzzle rounds | a normal 24–48 h hackathon on Max/Team | big prize, hard problem | no budget limit |
| Research agents | 0 (inline skim) | 0 | 1 | 2 | 3 |
| Possibilities scout | inline | inline | 1 | 1 | 1 + tool tests |
| Solution architects | 2 | 2 | 3 | 5 | 7 |
| Judge panel (kickoff) | 1 | 1 | 1 | 3 personas | 3 personas × 2 models |
| Spike bake-off | no | no | no | top 2 | top 3 |
| Parallel builders | 2 | 1–2 | 3 | 5 | 6 |
| Verify per loop iteration | quick | quick | quick, full every 4th | quick, full every 3rd | full |
| Blind judge | final only | no | final only | every full verify | every full verify |
| Loop max iterations | 12 | 10 | 30 | 60 | 150 |
| Loop target score | 8.5 | 8.5 | 9.0 | 9.3 | 9.5 |
| Agent effort | medium | medium | high | high | max |

**Quick verify** = verifier + one generalist judge on what changed, reusing the last compliance audit unless dependencies, deliverables or rules-relevant files changed. **Full verify** = verifier + compliance auditor + the whole panel (+ blind judge). The loop can only finish as *done* on a full verify.

## Default models per role

| Role | lean (Pro) | sprint | standard | deep | max |
|---|---|---|---|---|---|
| main session | sonnet (or your choice) | your choice | your choice | your choice | your choice |
| research | sonnet | sonnet | sonnet | opus | opus |
| architect | opus | sonnet | opus | opus | fable* |
| judge | sonnet | sonnet | opus | opus | opus + fable* |
| compliance-auditor | sonnet | sonnet | opus | opus | opus |
| build | sonnet | sonnet | sonnet | opus | opus |
| craft (3D, audio, video…) | sonnet | sonnet | sonnet | opus | opus |
| verify | haiku | haiku | sonnet | sonnet | opus |
| advisor | opus | opus | opus | opus | fable* |
| blind-judge | sonnet | — | sonnet | opus | opus |

\* only when the plan rules above allow Fable; otherwise opus.

Pass the role's model as the `model` parameter when launching each agent.

## `profile: auto`
Choose at kickoff and record why in STATE.md: `plan: pro` → **lean**; puzzle round or < 8 h → **sprint**; 8–36 h → **standard**; > 36 h, unusually hard, big modelling component, or the team said stakes are high → **deep**; **max** only when the user asks.

## Keeping usage under control
- Agents get only what they need: RESUME.md, the contract, the item — never the whole history.
- The loop uses quick verifies; full verifies only as the table says, and always before *done*.
- Parallelism is capped by the profile; on `lean` at most 2 agents run at once.
- `loop.max_iterations` and `loop.max_hours` are hard caps; the advisor stops spinning loops early ("stuck").
- Status, views, resume packs, integrity checks and the gate are plain scripts — they cost no tokens.

## Scaling during the run
Escalate one step (and log why in STATE.md) when: every option scores below 6 → one more lateral architect; a task fails twice → advisor first, bigger model only if the advice keeps the approach; plateau far below target with time left → full verify and a stronger judge on the weakest criterion. **Never escalate past what the plan allows.** De-escalate when time or usage runs short: fewer agents, haiku for verification, skip the bake-off.

Manual choices are authoritative: a `models:` entry or a model the user names always wins, and HackForge never raises effort on its own because a request "sounds important".
