COMPLIANCE: PASS
MOCK_SCORE: 8.4
GATE: PASS
MODE: full
INTEGRITY: OK

_Generated from verify.json 2026-10-14T12:00:00+03:00 — do not edit by hand._

## Compliance  (must be all ✅ to submit)

| ID | Status | Evidence | Fix |
|---|---|---|---|
| R1 | ✅ pass | no external LLM API in requirements.txt |  |

## Mock score: 8.4 / 10

| ID | Criterion | Score | Weight | Status | Evidence |
|---|---|---|---|---|---|
| J1 | Impact | 8.5 | 0.3 | pass | demo step 2, evidence/screens/forecast.png |

## Fix order

1. [major] Accuracy claim not measured on held-out data — run eval on split v2

## Blind first impression

... (vote: maybe)
Divergence: rubric judges 8.6, blind judge lost at the architecture slide

## Not observed

- J3 live demo on venue Wi-Fi
