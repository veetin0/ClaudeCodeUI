---
name: eval
description: Builds an evaluation harness that measures a solution with the challenge's real metric before optimising it — baseline, held-out validation, experiment log. Use when a hackathon or coding task has accuracy, score, cost, latency or a leaderboard.
argument-hint: "[metric description]"
---

# HackForge eval — $ARGUMENTS

Accuracy claims are only as good as the measurement. Build the measurement first.

1. **Pin the metric.** Find exactly how submissions are scored (RULES.md J-criteria, organiser's scoring script, leaderboard docs). If they provide a scorer, use it verbatim. Otherwise implement it and write a unit test on a hand-computed example.
2. **Split honestly.** Create a held-out validation set that mirrors the hidden test set (same distribution, time-based split for time series, group split if entities repeat). Freeze it; never tune on it twice without noting it. Check for leakage: target-derived features, future data, duplicates across splits.
3. **Baseline first.** The dumbest reasonable solution (majority class, last value, linear model, greedy algorithm). Every later result is reported relative to it.
4. **One command.** `make eval` / `python -m eval` / `npm run eval` — runs the current solution on validation and prints the metric plus runtime/cost.
5. **Log every run** to `.hackforge/SCORES.md`: `date | commit | change | metric | Δ vs best | runtime | notes`. Keep the best config reproducible (seed, params, data version).
6. **Iterate on evidence.** Look at errors (worst cases, confusion matrix, failing inputs) before changing the model. Prefer changes that fix a visible error class.
7. **Report with uncertainty** where cheap — cross-validation spread or bootstrap interval — so the pitch can say "0.87 ± 0.02 F1 on held-out data, baseline 0.71".

If the target is not a single number (e.g. "useful insights"), define 3–5 concrete test cases with expected outcomes and score them the same way.
