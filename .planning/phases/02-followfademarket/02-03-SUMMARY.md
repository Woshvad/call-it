---
phase: 02-followfademarket
plan: 03
subsystem: contracts
tags: [solidity, call-registry, profile-registry, settlement, outcome, caller-exit, mark-settled]

# Dependency graph
requires:
  - phase: 02-followfademarket
    provides: "Wave 1 FollowFadeMarket AMM, CallRegistry v2 (stake-forward, markCallerExited), ProfileRegistry v2 (authorizedRepWriters, applyRepDelta)"
provides:
  - "ICallRegistry.sol: Outcome enum (Pending/CallerWon/CallerLost), callerExitedAt + outcome fields in Call struct, markSettled signature, real computeCallerExitPenalty view"
  - "CallRegistry.sol: markSettled(callId, Outcome) settlementManager-guarded, callerExitedAt set in markCallerExited, real penalty formula (15+35*remaining/totalDuration)"
  - "Phase 4-ready authorization surface: markSettled + markCallerExited auth guards complete"
affects:
  - "Phase 4: SettlementManager calls markSettled; reads callerExitedAt from Call struct via getCall"
  - "Phase 4: FollowFadeMarket.claimPayout stub can now read outcome from Call struct"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Outcome enum as a stable-ordinal type: Pending=0, CallerWon=1, CallerLost=2 — never reorder"
    - "markCallerExited sets callerExitedAt = block.timestamp (SOCIAL-21 Phase 4 skip-rep-delta guard)"
    - "computeCallerExitPenalty is view (not pure): reads _calls storage, returns 0 for invalid callId"

key-files:
  created: []
  modified:
    - packages/contracts/src/CallRegistry.sol
    - packages/contracts/src/interfaces/ICallRegistry.sol

key-decisions:
  - "Task 2 (ProfileRegistry) was a no-op: 02-02 Wave 1 executor pre-implemented all authorizedRepWriters, applyRepDelta, setAuthorizedRepWriter, updateAfterSettlement migration — verified and documented"
  - "CallerExited ordinal stays at 3 (not 2 as plan text suggested): Disputed=2 was added in Phase 1 and tests are GREEN with Disputed=2, CallerExited=3; changing ordinals would break ABI compatibility"
  - "Outcome enum defined with Pending=0 (default, zero-initialized) so uninitialized calls always read Pending"
  - "computeCallerExitPenalty returns 0 for invalid callId (bounds guard), otherwise real formula; changed from pure to view in interface"

patterns-established:
  - "Guarded status transition pattern: markCallerExited (FFM guard) + markSettled (settlementManager guard) — Phase 4 SettlementManager needs only setSettlementManager(addr) to gain markSettled access"

requirements-completed:
  - SOCIAL-09
  - SOCIAL-21
  - SOCIAL-23
  - SOCIAL-24
  - SOCIAL-25
  - SOCIAL-26
  - SOCIAL-27

# Metrics
duration: 10min
completed: 2026-05-29
---

# Phase 2 Plan 3: CallRegistry + ProfileRegistry Redeploy Diff Summary

**Phase 4-ready authorization surface: markSettled with Outcome enum, callerExitedAt in Call struct, real computeCallerExitPenalty formula (15+35*remaining/totalDuration) — 111 tests GREEN**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-29T16:27:00Z
- **Completed:** 2026-05-29T16:35:35Z
- **Tasks:** 2 (1 real change, 1 verification no-op)
- **Files modified:** 2

## Accomplishments

- ICallRegistry.sol: `Outcome` enum (Pending=0/CallerWon=1/CallerLost=2), `callerExitedAt` + `outcome` fields in Call struct, `markSettled(callId, Outcome)` signature, real `computeCallerExitPenalty` as view
- CallRegistry.sol: `markSettled` function with `NotSettlementManager` guard, `callerExitedAt = block.timestamp` set in `markCallerExited`, real penalty formula replacing stub `return 0`
- Task 2 (ProfileRegistry): verified fully pre-implemented by 02-02 — no-op with documentation
- All 111 tests remain GREEN (2 skip for Phase 4 stubs)

## Task Commits

1. **Task 1: CallRegistry redeploy diff** - `c8fd463` (feat)
2. **Task 2: ProfileRegistry redeploy diff** - already complete via 02-02 `68eb5aa` (no new commit needed)

## Files Created/Modified

- `packages/contracts/src/CallRegistry.sol` - markSettled(callId, Outcome) with NotSettlementManager guard; callerExitedAt set in markCallerExited; computeCallerExitPenalty real formula; getCall zero-return updated with new fields
- `packages/contracts/src/interfaces/ICallRegistry.sol` - Outcome enum added; callerExitedAt + outcome in Call struct; markSettled signature; computeCallerExitPenalty changed to view with real NatSpec

## Decisions Made

- Task 2 was a no-op: 02-02 pre-implemented all ProfileRegistry changes (authorizedRepWriters, applyRepDelta, setAuthorizedRepWriter, updateAfterSettlement migration to authorizedRepWriters). Verified and documented rather than spuriously re-committed.
- `CallerExited` ordinal kept at 3 (not 2): plan text described `Live=0, Settled=1, CallerExited=2` but Phase 1 had already added `Disputed=2`. Current `Disputed=2, CallerExited=3` is ABI-correct and tests are GREEN. Added NatSpec to document the stable ordering.
- `Outcome.Pending = 0` ensures zero-initialized Call structs have the correct default without explicit initialization.
- `computeCallerExitPenalty` returns 0 for callId=0 or out-of-range (bounds guard prevents storage read on uninitialized slot).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] callerExitedAt was not being set in markCallerExited**
- **Found during:** Task 1 (delta analysis vs plan done-conditions)
- **Issue:** The plan specifies `callerExitedAt = block.timestamp` in `markCallerExited` (SOCIAL-21, patterns doc line 77-78) but the 02-02 implementation only set `status = CallerExited` without the timestamp
- **Fix:** Added `_calls[callId].callerExitedAt = uint64(block.timestamp);` to markCallerExited; added callerExitedAt field to Call struct in ICallRegistry.sol
- **Files modified:** packages/contracts/src/CallRegistry.sol, packages/contracts/src/interfaces/ICallRegistry.sol
- **Verification:** forge test: 111 passed, 0 failed
- **Committed in:** c8fd463

---

**Total deviations:** 1 auto-fixed (missing critical field)
**Impact on plan:** Fix necessary for SOCIAL-21 correctness (Phase 4 SettlementManager reads callerExitedAt to skip rep delta on exited calls). No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CallRegistry + ProfileRegistry fully Phase-4-ready: markSettled + markCallerExited auth surface complete
- Outcome enum stable: Phase 4 SettlementManager passes CallerWon/CallerLost to markSettled
- callerExitedAt in Call struct: Phase 4 SettlementManager can skip rep delta when callerExitedAt != 0 (SOCIAL-27)
- computeCallerExitPenalty is a real view: frontend can preview penalty before callerExit
- Plan 04 (DeployPhase2.s.sol) can now deploy all 3 contracts and wire their addresses

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes beyond what the plan's threat model specifies. markSettled threat T-02-03-01 (settlementManager guard) and T-02-03-02 (authorizedRepWriters guard) both implemented.

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] packages/contracts/src/CallRegistry.sol modified (markSettled, callerExitedAt, real penalty)
- [x] packages/contracts/src/interfaces/ICallRegistry.sol modified (Outcome enum, callerExitedAt, outcome fields, markSettled signature)
- [x] forge build exits 0 (Compiler run successful with warnings)
- [x] forge test: 111 passed, 0 failed, 2 skipped
- [x] forge test --match-contract TvlAggregation: 6 pass
- [x] forge test --match-contract FollowFadeMarket: 16 pass, 2 skip
- [x] Commit c8fd463 exists in git log
- [x] markSettled present in CallRegistry.sol with NotSettlementManager guard
- [x] callerExitedAt set in markCallerExited
- [x] Outcome enum has Pending=0 default
- [x] computeCallerExitPenalty returns real formula (not stub 0)
- [x] authorizedRepWriters + applyRepDelta in ProfileRegistry.sol (pre-existing from 02-02)
