---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 01
subsystem: testing
tags: [foundry, vitest, settlement, pyth, defillama, cex, eip712, tdd, red-gate, solidity-0.8.30]

# Dependency graph
requires:
  - phase: 03-challengeescrow
    provides: CeTestHelper abstract base + ChallengeEscrow deployed + setSettlementManager seam

provides:
  - SmTestHelper: abstract Foundry helper extending CeTestHelper, deploys SettlementManager + wires 4 contracts
  - SettlementManagerTest.sol: 13 test/invariant functions covering SETTLE-02,03,05,08,39,40,43,44,46,47,REP-14,22,23
  - FfmSettlementTest.sol: claimPayout CEI, applySettlement idempotency, CALL-41 empty-pool treasury
  - SettlementDisputeTest.sol: dispute bond, window close, MAX_COUNTER_CLAIMS=3, reversal re-distribution
  - SettlementManagerForkTest.sol: ADR-0001 mainnet-fork tests with real USDC via ARB_ONE_RPC_URL
  - pyth-adapter.test.ts: Pyth retry loop (wide confidence, 30 retries exhausted, success path)
  - defillama-adapter.test.ts: EIP-712 domain chainId=42161n binding + TVL fetch
  - cex-binance.test.ts: static HTML fixture + Innovation Zone exclusion (Pitfall 19)
  - outcome-word.test.ts: D-08 thresholds codified (CONTRARIAN HIT >= 0.5, COLD CALL delta <= 3)
  - apps/web/lib/outcome-word.ts: stub module for D-08 outcome word logic

affects: [04-02-settle-core, 04-03-oracle-adapters, phase-05-stylus, phase-06-staging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RED-gate scaffold: test file imports non-existent source — compile/module-not-found errors are the expected Wave 0 gate"
    - "SmTestHelper C3 linearization: is CeTestHelper (NOT is CeTestHelper, StdInvariant) — StdInvariant added at concrete test level"
    - "Solidity string literals: no Unicode characters (em dash, etc.) — use ASCII hyphens in assert messages"
    - "EIP-712 domain per-adapter naming (CallIt-DefiLlama) prevents cross-adapter replay within same chain (Pitfall 7)"
    - "D-09 public viewer: viewerIsWinningFader=false always yields caller-centric outcome word, never FADED CORRECTLY"
    - "ADR-0001 fork test: vm.createSelectFork(vm.envString(ARB_ONE_RPC_URL)) in setUp() for money-path tests"

key-files:
  created:
    - packages/contracts/test/helpers/SmTestHelper.sol
    - packages/contracts/test/SettlementManagerTest.sol
    - packages/contracts/test/FfmSettlementTest.sol
    - packages/contracts/test/SettlementDisputeTest.sol
    - packages/contracts/test/SettlementManagerForkTest.sol
    - apps/relayer/src/workers/__tests__/pyth-adapter.test.ts
    - apps/relayer/src/workers/__tests__/defillama-adapter.test.ts
    - apps/relayer/src/workers/__tests__/cex-binance.test.ts
    - apps/relayer/src/workers/__tests__/outcome-word.test.ts
    - apps/relayer/src/workers/__tests__/fixtures/binance-listing.html
    - apps/web/lib/outcome-word.ts
  modified:
    - apps/relayer/vitest.config.ts

key-decisions:
  - "D-08 thresholds locked as test-of-record: CONTRARIAN HIT when fadeRealShare >= 0.5; COLD CALL when repDelta <= 3"
  - "D-09 public viewer rule enforced: viewerIsWinningFader=false always caller-centric word, never FADED CORRECTLY"
  - "Vitest include pattern extended to src/**/__tests__/**/*.test.ts to match plan file locations (Rule 3 fix)"
  - "SettlementManagerForkTest.sol imports USDC_ARB_NATIVE from constants/USDC.sol — never inline address literals"

patterns-established:
  - "Wave 0 RED gate: Foundry tests import missing SettlementManager/ISettlementManager types — expected compile failure"
  - "Wave 0 RED gate: Vitest tests import missing oracle-adapters/* — expected Cannot find module errors"
  - "SmTestHelper.setUp() wires all 4 setSettlementManager + setAuthorizedRepWriter in one call chain"

requirements-completed:
  - SETTLE-02
  - SETTLE-03
  - SETTLE-05
  - SETTLE-08
  - SETTLE-43
  - SETTLE-44
  - SETTLE-46
  - SETTLE-25
  - SETTLE-26
  - SETTLE-27
  - SETTLE-28
  - SETTLE-29
  - SETTLE-30
  - SETTLE-34
  - SETTLE-39
  - SETTLE-40
  - SETTLE-16
  - SETTLE-23
  - REP-14
  - REP-22
  - REP-23
  - SETTLE-47
  - SAFETY-57

# Metrics
duration: 12min
completed: 2026-06-01
---

# Phase 4 Plan 01: SettlementManager RED-Gate Test Scaffolds Summary

**9 Foundry + Vitest RED-gate test scaffold files covering all money-critical invariants (fee split, pool conservation, CEI, dispute reversal, D-08 outcome-word thresholds) — all fail to compile/resolve until Plans 04-02/04-03 deliver the production code**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-01T20:19:45Z
- **Completed:** 2026-06-01T20:32:09Z
- **Tasks:** 2
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments

- Created `SmTestHelper.sol` extending `CeTestHelper` — boots all 4 existing contracts + placeholder SettlementManager, wires all `setSettlementManager` + `setAuthorizedRepWriter` calls as `vm.prank(owner)`
- Created 4 Foundry test files (SettlementManagerTest, FfmSettlementTest, SettlementDisputeTest, SettlementManagerForkTest) covering 13+ test/invariant functions — RED gate confirmed via `forge build` failing on missing `SettlementManager.sol` + `ISettlementManager.sol`
- Created 4 Vitest test files for oracle adapters — RED gate confirmed via `pnpm test` failing with `Cannot find module` for each adapter module
- Codified D-08 outcome-word thresholds as the spec-of-record executable test: CONTRARIAN HIT when `fadeRealShare >= 0.5`, COLD CALL when `repDelta <= 3`
- Codified D-09 public viewer rule: `viewerIsWinningFader=false` never returns `FADED CORRECTLY` — caller-centric outcome only
- Created `fixtures/binance-listing.html` for the Innovation Zone exclusion test (Pitfall 19 weekly synthetic CI)
- ADR-0001 mainnet-fork test annotated with `// ADR-0001: forge test --fork-url $ARB_ONE_RPC_URL`

## Task Commits

Each task was committed atomically:

1. **Task 1: Foundry test scaffolds** - `e4f8146` (test)
2. **Task 1 fix: em dash in string literals** - `b7984a6` (fix)
3. **Task 2: Vitest adapter test scaffolds** - `38b3bbb` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/contracts/test/helpers/SmTestHelper.sol` — Abstract helper: CeTestHelper extension, deploys SettlementManager + wires 4 contracts
- `packages/contracts/test/SettlementManagerTest.sol` — Core invariants: AlreadySettled, CallNotExpired, AtomicRollback, PythConfidenceGate, FeeSplit/PoolConservation fuzz, ColdStartScale, StylusFallback, ForceSettle, DuelInvalidChallengeId, DuplicateHashClearedOnSettle
- `packages/contracts/test/FfmSettlementTest.sol` — FFM: claimPayout CEI, applySettlement idempotency, CALL-41 empty-pool treasury, pro-rata payout formula
- `packages/contracts/test/SettlementDisputeTest.sol` — Dispute: bond taken, window closed, MAX_COUNTER_CLAIMS=3, USDC reversal, forceSettle cooldown
- `packages/contracts/test/SettlementManagerForkTest.sol` — ADR-0001 mainnet-fork money-path tests, real USDC via `vm.createSelectFork(ARB_ONE_RPC_URL)`
- `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` — Pyth retry: wide confidence→SettlementDelayed, 30 retries exhausted→DisputeWindowOpened, success path
- `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` — EIP-712 domain: chainId=42161n, name="CallIt-DefiLlama", wrong-chainId attack scenario documented
- `apps/relayer/src/workers/__tests__/cex-binance.test.ts` — Binance fixture: detect TokenX(TKX), exclude Innovation Zone (SomeCoin), reject symbol-only match
- `apps/relayer/src/workers/__tests__/outcome-word.test.ts` — D-08/D-09 thresholds: 8 tests covering all 5 outcome words + boundary cases + public viewer rule
- `apps/relayer/src/workers/__tests__/fixtures/binance-listing.html` — Static Binance announcement fixture with 4 posts (standard, Innovation Zone, symbol-only, old)
- `apps/web/lib/outcome-word.ts` — Stub with OutcomeWordParams type, OutcomeWord union, getOutcomeWord() stub (throws until Plan 04-02)
- `apps/relayer/vitest.config.ts` — Added `src/**/__tests__/**/*.test.ts` include pattern

## Decisions Made

1. **D-08 thresholds as test-of-record** — outcome-word.test.ts is the canonical spec for `CONTRARIAN HIT (fadeShare >= 0.5)` and `COLD CALL (delta <= 3)`. These thresholds derive from the research-recommended rep-math signals. Plan 04-02 must implement `getOutcomeWord()` to match exactly.
2. **D-09 public viewer rule enforced** — `testPublicViewer` explicitly asserts `viewerIsWinningFader=false` returns `LOUD AND WRONG` (not `FADED CORRECTLY`) when the caller lost. This prevents misleading display to non-participating viewers.
3. **USDC_ARB_NATIVE imported not inlined** — SettlementManagerForkTest.sol imports from `src/constants/USDC.sol` rather than using an inline address literal, per the CI grep guard in CLAUDE.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest.config.ts to discover src/workers/__tests__/ test files**
- **Found during:** Task 2 (Vitest adapter scaffolds)
- **Issue:** The existing vitest config only includes `test/**/*.test.ts` and `__tests__/**/*.test.ts` (root-level `__tests__`). The plan places files at `src/workers/__tests__/` which was not in the include pattern — tests were not discovered and did not produce the required RED gate errors.
- **Fix:** Added `src/**/__tests__/**/*.test.ts` to the `include` array in `vitest.config.ts`.
- **Files modified:** `apps/relayer/vitest.config.ts`
- **Verification:** `pnpm --filter @call-it/relayer test --run` now discovers all 4 new test files and fails with `Cannot find module` for each oracle adapter (expected RED gate).
- **Committed in:** `38b3bbb` (Task 2 commit)

**2. [Rule 1 - Bug] Replaced em dash Unicode characters in Solidity string literals**
- **Found during:** Task 1 post-commit (forge build RED gate check)
- **Issue:** Solidity `=0.8.30` rejects Unicode characters (em dash `—`) in regular `"..."` string literals: `Error (8936): Invalid character in string`. The em dashes appeared in `assertEq` message strings in `SettlementManagerTest.sol`. Comments are not affected.
- **Fix:** Replaced `—` with `-` in 2 string literal assert messages in `SettlementManagerTest.sol`.
- **Files modified:** `packages/contracts/test/SettlementManagerTest.sol`
- **Verification:** `forge build` no longer emits `Invalid character in string` errors; only the expected RED gate errors remain.
- **Committed in:** `b7984a6` (fix commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking, 1 Rule 1 bug)
**Impact on plan:** Both fixes required for the RED gate to work correctly. No scope creep.

## RED Gate Status

### Foundry RED Gate (CONFIRMED)

```
forge build --root packages/contracts
```

Expected failures (✓ confirmed):
- `Source "src/interfaces/ISettlementManager.sol" not found` — in SettlementManagerTest.sol, FfmSettlementTest.sol, SettlementDisputeTest.sol, SettlementManagerForkTest.sol
- `Source "src/SettlementManager.sol" not found` — in SmTestHelper.sol, SettlementManagerForkTest.sol

No unexpected errors (em dash issue was fixed).

### Vitest RED Gate (CONFIRMED)

```
pnpm --filter @call-it/relayer test --run
```

Expected failures (✓ confirmed):
- `Cannot find module '../oracle-adapters/pyth-adapter.js'` — pyth-adapter.test.ts
- `Cannot find module '../oracle-adapters/defillama-adapter.js'` — defillama-adapter.test.ts
- `Cannot find module '../oracle-adapters/cex/binance-scraper.js'` — cex-binance.test.ts
- `outcome-word.test.ts: 9 tests failed` — getOutcomeWord() stub throws "not yet implemented"

All 22 existing tests still pass (regression check passes).

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `getOutcomeWord()` throws "not yet implemented" | `apps/web/lib/outcome-word.ts` | Intentional — Plan 04-02 GREEN gate will implement the body |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes were introduced. This plan creates test scaffolds only.

## Issues Encountered

None. RED gate behavior is expected and intentional.

## Next Phase Readiness

Ready for Plan 04-02 (SettlementManager + FFM redeploy GREEN gate). All test assertions are pre-written; Plan 04-02 must:
1. Create `packages/contracts/src/SettlementManager.sol` + `ISettlementManager.sol`
2. Implement real `FollowFadeMarket.applySettlement()` + `claimPayout()`
3. Implement `getOutcomeWord()` in `apps/web/lib/outcome-word.ts` matching D-08/D-09 thresholds
4. Plan 04-03 must create the oracle adapter modules for Vitest GREEN gate

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*

## Self-Check: PASSED

- [x] `packages/contracts/test/helpers/SmTestHelper.sol` exists on disk
- [x] `packages/contracts/test/SettlementManagerTest.sol` exists on disk
- [x] `packages/contracts/test/FfmSettlementTest.sol` exists on disk
- [x] `packages/contracts/test/SettlementDisputeTest.sol` exists on disk
- [x] `packages/contracts/test/SettlementManagerForkTest.sol` exists on disk
- [x] `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` exists on disk
- [x] `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` exists on disk
- [x] `apps/relayer/src/workers/__tests__/cex-binance.test.ts` exists on disk
- [x] `apps/relayer/src/workers/__tests__/outcome-word.test.ts` exists on disk
- [x] `apps/relayer/src/workers/__tests__/fixtures/binance-listing.html` exists on disk
- [x] `apps/web/lib/outcome-word.ts` exists on disk
- [x] `grep "abstract contract SmTestHelper is CeTestHelper" SmTestHelper.sol` — PASS
- [x] `grep -c "function test\|function invariant" SettlementManagerTest.sol` = 13 (>= 11 required)
- [x] `testDuelInvalidChallengeId` — asserts revert on wrong callId AND non-Accepted status — PASS
- [x] `testDuplicateHashClearedOnSettle` — asserts activeDuplicateHashes cleared after settle — PASS
- [x] `grep "claimed\[callId\]" FfmSettlementTest.sol` — CEI order comment present — PASS
- [x] `grep "testDisputeWindowClosed\|testDisputeReversal" SettlementDisputeTest.sol` — PASS
- [x] `grep "ARB_ONE_RPC_URL\|createSelectFork" SettlementManagerForkTest.sol` — PASS
- [x] No inline USDC address literals in test files (USDC_ARB_NATIVE import used) — PASS
- [x] Forge build fails with expected "file not found" for SettlementManager types — RED GATE PASS
- [x] Vitest fails with "Cannot find module" for oracle adapter modules — RED GATE PASS
- [x] D-08 CONTRARIAN HIT threshold `fadeRealShare >= 0.5` in outcome-word.test.ts — PASS
- [x] D-08 COLD CALL threshold `repDelta <= 3` in outcome-word.test.ts — PASS
- [x] D-09 `testPublicViewer` asserts `viewerIsWinningFader=false` never returns "FADED CORRECTLY" — PASS
- [x] EIP-712 `chainId=42161n` assertion in defillama-adapter.test.ts — PASS
- [x] `fixtures/binance-listing.html` contains Innovation Zone post for Pitfall 19 test — PASS
- [x] Commits `e4f8146`, `b7984a6`, `38b3bbb` exist in git log — PASS
