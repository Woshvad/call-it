---
phase: 02-followfademarket
plan: 01
subsystem: testing
tags: [foundry, vitest, amm, follow-fade, tdd, invariants, parity]

# Dependency graph
requires: []
provides:
  - "Wave 0 RED gate test scaffold: 5 Foundry test files covering SOCIAL-01..28, k-invariant, TVL boundary, multi-call interference"
  - "TypeScript AMM parity stubs (D-29): computeMinSharesOut, computeCallerExitPenaltyPct, computeCallerExitRepDelta, computePositionSlashSplit"
  - "FfmTestHelper: abstract base deploying 3-contract stack for all FFM test contracts"
affects:
  - "02-followfademarket (all subsequent plans: tests turn GREEN when Plan 02 ships FollowFadeMarket.sol)"
  - "Phase 1.5 and Phase 4 (SOCIAL-27 Phase 4 stub documents SettlementManager dependency)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: RED gate test files created before implementation contract — compile failure is expected until Plan 02"
    - "D-29 parity pattern: pure BigInt TypeScript functions mirroring Solidity AMM formulas for CI anti-drift"
    - "FfmTestHelper abstract base: centralizes 3-contract setUp() deployment pattern across all FFM test contracts"
    - "Invariant testing with Foundry StdInvariant: k-invariant and USDC balance == reserves invariants"

key-files:
  created:
    - packages/contracts/test/helpers/FfmTestHelper.sol
    - packages/contracts/test/FollowFadeMarket.t.sol
    - packages/contracts/test/FollowFadeMarketGates.t.sol
    - packages/contracts/test/FollowFadeMarketInterference.t.sol
    - packages/contracts/test/TvlAggregation.t.sol
    - packages/shared/src/validation/follow-fade-gates.ts
    - packages/shared/test/follow-fade-gates.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Test file placed in packages/shared/test/ not src/validation/ to match vitest include pattern [Rule 3]"
  - "FfmTestHelper uses vm.etch pattern from CallRegistry.t.sol analog to deploy MockUSDC at 0xaf88d065"
  - "computeMinSharesOutWithSlippage exported as convenience wrapper applying 1% SLIPPAGE_TOLERANCE_BPS"
  - "SOCIAL-27 Phase 4 stub uses vm.skip() with descriptive message rather than empty body to document cross-phase dependency"

patterns-established:
  - "FfmTestHelper extends FfmTestHelper is Test pattern: all FFM test contracts inherit the abstract helper"
  - "Wave 0 RED gate: compile error on missing FollowFadeMarket.sol is documented in commit message as expected"

requirements-completed:
  - SOCIAL-01
  - SOCIAL-02
  - SOCIAL-03
  - SOCIAL-04
  - SOCIAL-05
  - SOCIAL-06
  - SOCIAL-07
  - SOCIAL-08
  - SOCIAL-09
  - SOCIAL-10
  - SOCIAL-11
  - SOCIAL-12
  - SOCIAL-13
  - SOCIAL-14
  - SOCIAL-15
  - SOCIAL-16
  - SOCIAL-17
  - SOCIAL-18
  - SOCIAL-19
  - SOCIAL-20
  - SOCIAL-21
  - SOCIAL-22
  - SOCIAL-26

# Metrics
duration: 10min
completed: 2026-05-29
---

# Phase 2 Plan 1: FollowFadeMarket Wave 0 Test Scaffold Summary

**Wave 0 RED gate: 5 Foundry test files covering SOCIAL-01..28 + k-invariant + TVL boundary, plus TypeScript BigInt AMM parity stubs (computeMinSharesOut, computeCallerExitPenaltyPct, computePositionSlashSplit) with 26 Vitest tests GREEN**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-29T15:37:27Z
- **Completed:** 2026-05-29T15:47:09Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- FfmTestHelper.sol: abstract base deploys ProfileRegistry v2 + CallRegistry v2 + FollowFadeMarket, etches MockUSDC at 0xaf88d065, funds alice/bob, exposes _seedPool() helper
- FollowFadeMarket.t.sol: unit test stubs for all SOCIAL-01..28 behaviors including SOCIAL-27 Phase 4 snapshot and vm.skip stub
- FollowFadeMarketGates.t.sol: invariant_kNeverShrinks + invariant_usdcBalanceMatchesReserves + invariant_noOverClaim + penalty injection + expiry gate strict-less-than
- FollowFadeMarketInterference.t.sol: multi-call isolation tests (Pitfall 9)
- TvlAggregation.t.sol: $4999/$5001 boundary tests + combined CR+FFM TVL aggregation
- follow-fade-gates.ts + 26 Vitest tests all GREEN: pnpm --filter @call-it/shared test exits 0

## Task Commits

Each task was committed atomically:

1. **Task 1: FfmTestHelper + FollowFadeMarket unit test scaffold** - `16cf6a6` (test)
2. **Task 2: Invariant fuzz tests + TVL boundary tests** - `0d794d2` (test)
3. **Task 3: TypeScript AMM parity stubs (D-29)** - `b48e78b` (feat)

**Plan metadata:** (docs commit — see final_commit below)

## Files Created/Modified

- `packages/contracts/test/helpers/FfmTestHelper.sol` - Abstract setUp() base: 3-contract stack deploy + MockUSDC etch + alice/bob funding + _seedPool() helper
- `packages/contracts/test/FollowFadeMarket.t.sol` - Unit stubs for SOCIAL-01..28; all RED until Plan 02 creates FollowFadeMarket.sol
- `packages/contracts/test/FollowFadeMarketGates.t.sol` - Invariant fuzz: k-invariant, balance==reserves, no-overclaim, penalty injection, expiry gate
- `packages/contracts/test/FollowFadeMarketInterference.t.sol` - Multi-call isolation tests (Pitfall 9)
- `packages/contracts/test/TvlAggregation.t.sol` - TVL boundary: $4999 OK / $5001 revert / combined CR+FFM aggregation
- `packages/shared/src/validation/follow-fade-gates.ts` - BigInt AMM parity functions (5 exports)
- `packages/shared/test/follow-fade-gates.test.ts` - 26 Vitest fixture cases; all GREEN
- `packages/shared/src/index.ts` - Added follow-fade-gates barrel exports

## Decisions Made

- Test file placed in `packages/shared/test/` (not `src/validation/`) to match the vitest.config.ts `include` pattern — the analog `call-gates-parity.test.ts` also lives in `test/`, not `src/`
- `computeMinSharesOutWithSlippage` added as convenience wrapper applying 1% tolerance (SOCIAL-06 requirement is frontend-facing)
- SOCIAL-27 Phase 4 stub uses `vm.skip()` with descriptive message to document the SettlementManager cross-phase dependency rather than a truly empty body

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Unicode em dash in vm.skip string literal**
- **Found during:** Task 1 (FollowFadeMarket.t.sol)
- **Issue:** Solidity `=0.8.30` does not allow Unicode characters in regular string literals; the em dash caused `error 8936: Invalid character in string`
- **Fix:** Replaced `—` with `--` (ASCII double-dash) in the vm.skip message
- **Files modified:** packages/contracts/test/FollowFadeMarket.t.sol
- **Verification:** `forge build` no longer shows the character error; only expected RED gate errors remain
- **Committed in:** 16cf6a6 (Task 1 commit)

**2. [Rule 3 - Blocking] Moved test file from src/validation/ to test/ directory**
- **Found during:** Task 3 (TypeScript parity stubs)
- **Issue:** vitest.config.ts `include` pattern is `['test/**/*.test.ts', '__tests__/**/*.test.ts']`; a file in `src/validation/` is never picked up by the test runner (0 new tests ran initially)
- **Fix:** Moved `follow-fade-gates.test.ts` from `src/validation/` to `test/` and updated the import path from `./follow-fade-gates.js` to `../src/validation/follow-fade-gates.js`
- **Files modified:** packages/shared/test/follow-fade-gates.test.ts (created at correct path)
- **Verification:** `pnpm --filter @call-it/shared test` shows 26 new test cases in `test/follow-fade-gates.test.ts`
- **Committed in:** b48e78b (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep. Plan executed as written otherwise.

## Issues Encountered

- Foundry `forge build --match-path` flag does not exist in this version; used `forge build` to verify RED gate errors instead (error output is identical in terms of what we needed to confirm)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 test scaffold complete: all 5 Foundry test files exist with correct pragma =0.8.30
- All error selectors reference IFollowFadeMarket (to be created in Plan 02)
- Vitest parity stubs GREEN: 119 total tests pass including 26 new follow-fade-gates cases
- RED compile gate confirmed: `FollowFadeMarket.sol` and `IFollowFadeMarket.sol` not found (expected)
- Plan 02 can proceed: ship FollowFadeMarket.sol + IFollowFadeMarket.sol and all stubs turn GREEN

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] packages/contracts/test/helpers/FfmTestHelper.sol exists
- [x] packages/contracts/test/FollowFadeMarket.t.sol exists
- [x] packages/contracts/test/FollowFadeMarketGates.t.sol exists
- [x] packages/contracts/test/FollowFadeMarketInterference.t.sol exists
- [x] packages/contracts/test/TvlAggregation.t.sol exists
- [x] packages/shared/src/validation/follow-fade-gates.ts exists
- [x] packages/shared/test/follow-fade-gates.test.ts exists
- [x] Commits 16cf6a6, 0d794d2, b48e78b all exist in git log
- [x] pnpm --filter @call-it/shared test exits 0 (119 tests, 26 new)
- [x] All 5 Foundry files use pragma =0.8.30 exactly
- [x] invariant_kNeverShrinks and invariant_usdcBalanceMatchesReserves present in FollowFadeMarketGates.t.sol
- [x] test_tvlBoundary4999Succeeds and test_tvlBoundary5001Reverts present in TvlAggregation.t.sol
- [x] Error selectors SlippageExceeded, CallPastExpiry, ExitCooldownActive, CallerExitLocked, TvlCapReached, PositionBelowMinimum, PositionAboveMaximum present in FollowFadeMarket.t.sol
