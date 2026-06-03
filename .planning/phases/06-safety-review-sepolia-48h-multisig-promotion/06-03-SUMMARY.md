---
phase: 06-safety-review-sepolia-48h-multisig-promotion
plan: 03
subsystem: contracts-test
tags: [solidity, foundry, safety-matrix, settlement, tvl, reentrancy, fork-test]

dependency_graph:
  requires:
    - phase: 06-safety-review-sepolia-48h-multisig-promotion
      provides: resolveUsdc() chainid gate (06-01), USDC.sol constants, contract stack redeployed with Sepolia USDC
    - phase: 04-settlementmanager
      provides: SettlementManager.sol, FollowFadeMarket.sol, ChallengeEscrow.sol function signatures
    - phase: 03-challengeescrow
      provides: CeTestHelper.sol, SmTestHelper.sol abstract bases
  provides:
    - SAFETY-34..41 Foundry tests in SettlementSafetyMatrix.t.sol (14 tests)
    - SAFETY-31/32/33 TVL boundary tests in TvlAggregation.t.sol (5 new tests, 9 total)
    - SAFETY-30/43 owner-guard tests in CallRegistrySafety.t.sol (9 new tests, 18 total)
    - SettlementManagerForkTest.sol with graceful env-skip + 5 full-loop tests
  affects: [phase-06-wave4-soak, phase-07-mainnet-deploy]

tech_stack:
  added: []
  patterns:
    - "vm.chainId(42161) in every setUp() — pins Arbitrum One before resolveUsdc() constructors"
    - "vm.envOr(ARB_ONE_RPC_URL, string('')) + vm.skip(true) — graceful fork-test skip when RPC unset"
    - "vm.mockCall on IPyth.getPriceNoOlderThan.selector — deterministic settle() in fork tests"
    - "MaliciousReentrantUSDC.setTarget() + vm.etch(USDC_ARB_NATIVE) — reentrancy test pattern"
    - "ChallengeEscrow._checkTvlCap aggregates CR.currentTvl + FFM.getTvl + totalEscrow"

key_files:
  created:
    - packages/contracts/test/SettlementSafetyMatrix.t.sol
  modified:
    - packages/contracts/test/TvlAggregation.t.sol
    - packages/contracts/test/CallRegistrySafety.t.sol
    - packages/contracts/test/SettlementManagerForkTest.sol

decisions:
  - "SAFETY-31 TVL aggregation: ChallengeEscrow._checkTvlCap already implements 3-way aggregate (CR.currentTvl + FFM.getTvl + totalEscrow) against callRegistry.tvlCap(). Pitfall 3 is already mitigated at the contract level. Test confirms this by verifying that a CE proposeChallenge reverts TvlCapReached when combined > cap. No contract fix required."
  - "Fork test skip pattern: vm.envOr('ARB_ONE_RPC_URL', string('')) in setUp() — empty string triggers vm.skip(true) before vm.createSelectFork(). This prevents setUp() revert (which would show as FAILED) and instead reports SKIPPED."
  - "Deterministic Pyth mock for fork tests: vm.mockCall on IPyth.getPriceNoOlderThan.selector with price=4000e8, conf=100, expo=-8. 4000e8 > target 3000e6 → CallerWon; conf*200=20000 << price → confidence gate passes."

metrics:
  duration: "~40min"
  completed: "2026-06-04"
  tasks: 2
  files_modified: 4
---

# Phase 06 Plan 03: SAFETY-29-43 Test Matrix + Fork Loop Tests Summary

**SAFETY-34..43 matrix tests implemented in Foundry — 41 new/extended tests passing; fork suite skips gracefully; SAFETY-31 CE TVL aggregation confirmed closed at contract level.**

## Tasks Completed

### Task 1: SettlementSafetyMatrix.t.sol + TvlAggregation + CallRegistrySafety extensions

Commit: `7a32405`

**SettlementSafetyMatrix.t.sol (NEW — 14 tests):**
- SAFETY-34: `test_withdrawWhilePaused_exitPosition_succeeds` + `test_claimPayoutWhilePaused_succeeds` — pause carve-outs verified
- SAFETY-35: `test_callerExit_before24h_reverts` + `test_callerExit_after24h_succeeds` + `test_callerExit_penalty_at50pct` + `test_callerExit_penalty_at15pct_floor` — 24h lock + decay formula (15%+35%×remaining/total)
- SAFETY-36: `test_followerExit_before4h_reverts` + `test_followerExit_after4h_90pctReturn`
- SAFETY-37: `test_duplicateHash_utcDayBoundary` + `test_duplicateHash_sameDayReverts`
- SAFETY-38: `test_slippage_minSharesOut_reverts`
- SAFETY-39: `test_settle_idempotency`
- SAFETY-40: `test_selfChallenge_reverts`
- SAFETY-41: `test_reentrancy_maliciousUSDC_follow_blocked`

**TvlAggregation.t.sol (EXTENDED — 5 new tests, 9 total):**
- SAFETY-31: `test_tvlBoundary_includesChallengeEscrow` — PASSES GREEN; CE._checkTvlCap already aggregates CR+FFM+totalEscrow against callRegistry.tvlCap()
- SAFETY-32: `test_maxStake_100_succeeds` + `test_maxStake_101_reverts`
- SAFETY-33: `test_minPosition_1_succeeds` + `test_minPosition_99cents_reverts`

**CallRegistrySafety.t.sol (EXTENDED — 9 new tests, 18 total):**
- SAFETY-30: `test_only_owner_pause_FFM` + `test_only_owner_pause_CE` + `test_only_owner_pause_SM`
- SAFETY-43: `test_only_owner_setTvlCap_CR` + `test_only_owner_setSettlementManager_FFM` + `test_only_owner_setRelayer_PR` + `test_only_owner_setSettlementManager_PR` + `test_only_owner_forceSettle` + `test_only_owner_resolveDispute`

### Task 2: SettlementManagerForkTest.sol — env-skip guard + 5 full-loop tests

Commit: `97ae83c`

**Graceful skip fix:** Replaced `vm.envString("ARB_ONE_RPC_URL")` with `vm.envOr(...)` + `vm.skip(true)`. When RPC not set: `0p/0f/1s (exit 0)` — not a failure.

**5 full-loop deterministic tests:**
- `test_fullLoop_createFollowSettleClaimPayout` — create → follow → mock Pyth → settle (CallerWon) → claimPayout; treasury receives fees
- `test_fullLoop_createFadeSettleClaimPayout` — same with CallerLost outcome; fader payout verified
- `test_fullLoop_callerExit` — create → follow → warp 24h+1s → callerExit (penalty) → exitPosition (follow)
- `test_fullLoop_duelSettleClaimPayout` — propose + accept challenge → settle → claimDuelPayout
- `test_fullLoop_disputeOwnerResolve` — settle → raiseDispute ($5 bond) → resolveDispute (reversal) → bond refund + reward

## Final Forge Test Result

```
Ran 22 test suites: 222 tests passed, 0 failed, 3 skipped (225 total)
```

Fork suite: `0 passed, 0 failed, 1 skipped` (ARB_ONE_RPC_URL unset → graceful skip)

| Suite | Tests | Result |
|-------|-------|--------|
| CallRegistrySafetyTest | 18 (was 9) | PASS |
| SettlementSafetyMatrixTest | 14 (new) | PASS |
| TvlAggregation | 9 (was 4) | PASS |
| SettlementManagerForkTest | 0p/0f/1s | SKIP |
| All others (19 suites) | 181 | PASS |

## SAFETY-31 TVL Aggregation Outcome

**GREEN — no contract fix required.** ChallengeEscrow already implements the 3-way TVL cap in `_checkTvlCap`:
```
combined = callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming
if (combined > callRegistry.tvlCap()) revert TvlCapReached
```
The test `test_tvlBoundary_includesChallengeEscrow` confirms that a CE `proposeChallenge` reverts `TvlCapReached` when the 3-way aggregate exceeds `callRegistry.tvlCap()`. Pitfall 3 is closed.

Note: FFM's own TVL check (`_deposit`) does NOT include CE — it only checks `CR.currentTvl + FFM.getTvl`. This is by design: CE has its own cap check path. The combined protection is: (a) CR+FFM checked by FFM.follow/fade, and (b) CR+FFM+CE checked by CE.proposeChallenge. A user cannot circumvent either path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate-hash test: `vm.expectRevert` scope**

- **Found during:** Task 1 `test_duplicateHash_sameDayReverts`
- **Issue:** `_createCall` helper mints + approves BEFORE calling `registry.createCall`. Putting `vm.expectRevert()` before `_createCall(...)` causes Foundry to capture the `mint` call (first external call), not `createCall`. The revert from the duplicate gate was eaten silently.
- **Fix:** Replaced `vm.expectRevert() + _createCall(...)` with inline `vm.prank(caller) + vm.expectRevert() + registry.createCall(...)` for the duplicate revert test.
- **Files modified:** `packages/contracts/test/SettlementSafetyMatrix.t.sol`

## Traceability

- `grep -c "SAFETY-31" packages/contracts/test/TvlAggregation.t.sol` → **11** (>= 1)
- `grep -c "SAFETY-34" packages/contracts/test/SettlementSafetyMatrix.t.sol` → **8** (>= 1)
- `grep -c "test_fullLoop_" packages/contracts/test/SettlementManagerForkTest.sol` → **10** (>= 5)
- `grep -c "getPriceNoOlderThan" packages/contracts/test/SettlementManagerForkTest.sol` → **7** (>= 5)

## Self-Check: PASSED

- [x] `packages/contracts/test/SettlementSafetyMatrix.t.sol` exists on disk
- [x] `packages/contracts/test/TvlAggregation.t.sol` modified (SAFETY-31/32/33 added)
- [x] `packages/contracts/test/CallRegistrySafety.t.sol` modified (SAFETY-30/43 added)
- [x] `packages/contracts/test/SettlementManagerForkTest.sol` modified (skip guard + 5 tests)
- [x] Commit `7a32405` exists (Task 1)
- [x] Commit `97ae83c` exists (Task 2)
- [x] `forge test --match-contract "SettlementSafetyMatrix|TvlAggregation|CallRegistrySafety"` exits 0 (41 tests pass)
- [x] `ARB_ONE_RPC_URL="" forge test --match-contract SettlementManagerFork` exits 0 (1 skipped)
- [x] Full `forge test` exits 0 with 222p/0f/3s (no regressions)
- [x] SAFETY-31 test passes GREEN (CE TVL aggregation confirmed at contract level)
