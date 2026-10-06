COMPLIANCE: FAIL
MOCK_SCORE: 8.1
GATE: PASS

## Compliance  (must be all ✅ to submit)
| ID | Status | Evidence | Fix |
|----|--------|----------|-----|
| R1 | ✅ | src/maps.ts calls Acme | |
| R2 | ✅ | MIT LICENSE | |
| D1 | ✅ | github.com/team/route | |
| D2 | ❌ | video not recorded yet | record it |

## Build & tests
All 42 tests pass.

## Mock score: 8.1 / 10  (per-criterion table)
| ID | Criterion | Weight | Score | Why |
|----|-----------|--------|-------|-----|
| J1 | Technical depth | 30 % | 8.5 | solid model |
| J2 | Impact | 25 % | 8.0 | |
| J3 | Demo | 25 % | 7.5 | API latency |
| J4 | Documentation | 20 % | 8.2 | |

## Fix order
1. Record the 3-minute demo video (D2)
2. README one-command setup (+0.3 J4)
3. Cache API responses for the live demo (+0.2 J3)
