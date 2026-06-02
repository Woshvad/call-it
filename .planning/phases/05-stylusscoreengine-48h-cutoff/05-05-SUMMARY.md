---
phase: 05-stylusscoreengine-48h-cutoff
plan: 05
subsystem: infra
tags: [redis, bullmq, typescript, vitest, stylus, runbook, ops]

# Dependency graph
requires:
  - phase: 05-stylusscoreengine-48h-cutoff
    provides: Phase 0 stylus-deactivation-watcher.ts worker with Redis NX idempotency pattern (plan 05-01 or phase 0)
  - phase: 04-settlementmanager
    provides: OPS-16 runbook authored alongside DeployPhase4.s.sol (plan 04-03)

provides:
  - Extended StylusDeactivationWatcherOpts with demoCutoffTimestamp?: number field
  - Demo-cutoff alert block in tick() firing stylus_demo_cutoff at T-24h/T-48h/T-72h before demo date
  - Redis key prefix stylus:demo-cutoff:T-${h}h: distinct from reactivation stylus:alert-fired:T-${N}d:
  - Test 5 in stylus-deactivation-watcher.test.ts — vitest 5/5 pass (Tests 1-4 regression + new Test 5)
  - OPS-16 runbook updated: CutoffFallback.s.sol invocation, SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA reference, no placeholder address

affects: [phase-05-deploy, phase-06-safety-drill, ops-procedures]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Demo-cutoff threshold iteration: ascending [24, 48, 72] to fire most-urgent (smallest) applicable threshold; same Redis NX EX 86400 idempotency as reactivation loop"
    - "Distinct key prefixes per alert family: reactivation=stylus:alert-fired:T-${N}d: vs demo=stylus:demo-cutoff:T-${h}h: prevents cross-alert collision (T-05-05-02)"

key-files:
  created: []
  modified:
    - apps/relayer/src/workers/stylus-deactivation-watcher.ts
    - apps/relayer/test/stylus-deactivation-watcher.test.ts
    - docs/runbooks/OPS-16-stylus-reactivation.md

key-decisions:
  - "Demo thresholds iterate ascending [24, 48, 72] (not descending like reactivation [30,15,7,1]) so that the MOST URGENT threshold fires first — 12h remaining hits T-24h, not T-72h"
  - "nowSeconds reused from tick() outer scope (declared at existing line 128) — no redeclaration needed inside demo block"
  - "OPS-16 Step 4 updated to two options: Option A (CutoffFallback.s.sol forge script, recommended) and Option B (manual cast send equivalent)"

patterns-established:
  - "Ascending threshold order for time-before-event alerts: iterate from smallest to largest, break on first match = most urgent applicable fires"

requirements-completed: [REP-19]

# Metrics
duration: 5min
completed: 2026-06-02
---

# Phase 05 Plan 05: Demo-Cutoff Watcher Extension + OPS-16 Runbook Fix Summary

**demoCutoffTimestamp field + Redis-idempotent T-24h/T-48h/T-72h stylus_demo_cutoff alert block added to deactivation watcher; OPS-16 runbook placeholder replaced with CutoffFallback.s.sol + SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-02T06:48:05Z
- **Completed:** 2026-06-02T06:53:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended `StylusDeactivationWatcherOpts` with `demoCutoffTimestamp?: number` — watcher is no-op if not set (T-05-05-01 mitigation)
- Added demo-cutoff alert block in `tick()`: thresholds `[24, 48, 72]` ascending, same `SET NX EX 86400` Redis idempotency, key prefix `stylus:demo-cutoff:T-${h}h:` distinct from reactivation keys (T-05-05-02)
- Test 5 added: `demoCutoffTimestamp=12h` triggers `stylus_demo_cutoff` with `threshold=24`; Redis lock key matches `/stylus:demo-cutoff:T-24h:/`; vitest 5/5 pass, Tests 1-4 unchanged
- OPS-16 Step 4 updated: removed `<phase-4-deployed-solidity-baseline-address>` placeholder; replaced with `SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA` from `addresses.ts` (Phase 5 Plan 06 deploy output); added `forge script CutoffFallback.s.sol` as recommended Option A

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend deactivation watcher with demo-cutoff alert block** - `672f6d8` (feat)
2. **Task 2: OPS-16 runbook SOLIDITY_BASELINE_ADDR reference update** - `b1fa40d` (docs)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/relayer/src/workers/stylus-deactivation-watcher.ts` — Added `demoCutoffTimestamp?: number` to interface; added demo-cutoff alert block in `tick()` after reactivation threshold loop; ascending `[24, 48, 72]` threshold order; distinct `stylus:demo-cutoff:` Redis key prefix
- `apps/relayer/test/stylus-deactivation-watcher.test.ts` — Added Test 5: `demoCutoffTimestamp=+12h → sendAlert('stylus_demo_cutoff', {threshold:24})`; Redis key assertion `/stylus:demo-cutoff:T-24h:/`
- `docs/runbooks/OPS-16-stylus-reactivation.md` — Step 4 rewritten: `<phase-4-deployed-solidity-baseline-address>` removed; `SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA` + `PROXY_ADMIN_ARBITRUM_SEPOLIA` from `addresses.ts`; Option A `forge script CutoffFallback.s.sol`; Option B `cast send upgradeAndCall`; footer updated with Phase 5 references

## Decisions Made

1. **Ascending threshold order `[24, 48, 72]`** — The reactivation loop uses descending `[30, 15, 7, 1]` where first match = highest (least urgent) applicable threshold, which works because each threshold window is exclusive and the test sets up exact-threshold scenarios. For demo alerts, the test sets 12h remaining and expects T-24h (most urgent). Ascending order `[24, 48, 72]` fires the smallest (most urgent) applicable threshold first with a `break`. This is the correct interpretation of "highest triggered threshold" for this use case.

2. **`nowSeconds` reuse from outer scope** — `nowSeconds` is declared at tick() line 128 (outer function body), before the reactivation threshold loop. It remains in scope throughout tick(), so the demo-cutoff block can reference it directly without redeclaration.

3. **OPS-16 two-option format** — Added Option A (CutoffFallback.s.sol forge script) as recommended path because it includes a `require()` post-upgrade assertion. Option B (manual cast send) retained as fallback. No sections restructured.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Threshold order corrected from descending to ascending**

- **Found during:** Task 1 (first test run)
- **Issue:** Plan spec listed `const demoThresholds = [72, 48, 24] as const` (descending). With 12h remaining, 12 <= 72 fires T-72h — but Test 5 expects `threshold: 24` for 12h remaining. The plan comment "only highest triggered threshold fires" is ambiguous; the test is authoritative.
- **Fix:** Changed to `[24, 48, 72]` ascending so first match = most urgent (smallest) applicable threshold. With 12h: 12 <= 24 fires T-24h. With 36h: 36 > 24, 36 <= 48 fires T-48h. With 60h: 60 > 48, 60 <= 72 fires T-72h.
- **Files modified:** `apps/relayer/src/workers/stylus-deactivation-watcher.ts`
- **Verification:** vitest 5/5 passed after change
- **Committed in:** `672f6d8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — logic bug in threshold order from plan spec)
**Impact on plan:** Fix-only. Correct urgency semantics for demo-cutoff alerts. No scope creep.

## Issues Encountered

None beyond the threshold order bug documented above.

## User Setup Required

None - no external service configuration required. `demoCutoffTimestamp` is wired via env var `DEMO_CUTOFF_TIMESTAMP` (set after Phase 5 deploy per OPS-16 REQUIRED NEXT STEPS).

## Threat Surface Scan

No new trust boundaries introduced. Demo-cutoff alert goes to same Telegram bot as reactivation alerts (existing surface). Redis key prefix distinct from reactivation keys (T-05-05-02 mitigated).

## Next Phase Readiness

- Phase 05 Plan 06 (deploy) can proceed: watcher will fire demo-cutoff alerts once `DEMO_CUTOFF_TIMESTAMP` env var is set
- Phase 06 safety drill: OPS-16 runbook is accurate — CutoffFallback.s.sol invocation documented
- Operator: after Phase 5 deploy, set `fly secrets set DEMO_CUTOFF_TIMESTAMP=<unix-seconds> --app call-it-relayer-sepolia` to activate demo-cutoff alerts

---
*Phase: 05-stylusscoreengine-48h-cutoff*
*Completed: 2026-06-02*
