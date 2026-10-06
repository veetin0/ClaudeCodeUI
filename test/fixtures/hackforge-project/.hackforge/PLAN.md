# Plan

Time budget: 48 h · Deadline: 2026-10-12T18:00+03:00 · Team: 3 · Profile: standard · Stack: TypeScript

## Milestones (vertical slices)
| M | Goal | Covers | Acceptance checks (runnable) | Time-box | Status |
|---|------|--------|------------------------------|----------|--------|
| M1 | Thinnest submittable end-to-end slice | D1, J1 | `npm test` | 8 h | ✅ |
| M2 | Route scoring with real traffic data | J2 | `npm run eval` | 12 h | ✅ |
| M3 | Demo polish and video | D2, J3 | `./gate.sh` | 8 h | 🔄 |
| M4 | Offline mode | J1 | `npm run e2e` | 6 h | ⬜ |

## Tasks per milestone
| M | Role | Task | Depends on contract | Agent / model | Branch | Status |
|---|---|---|---|---|---|---|
| M1 | backend | API client | C1 | builder / sonnet | m1-api | ✅ |
