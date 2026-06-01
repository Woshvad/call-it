---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 02
subsystem: contracts
tags: [solidity-0.8.30, settlement, pyth, foundry, reentrancy-guard, ownable2step, cei, rep-delta, dispute, force-settle]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManagerTest/FfmSettlementTest/SettlementDisputeTest RED-gate test scaffolds (04-01)
  - phase: 03-challengeescrow
    provides: ChallengeEscrow.settleDuel seam + IChallengeEscrow.getChallenge interface

provides:
  - SettlementManager.sol: 14-step atomic settle(callId,pythUpdateData,acceptedChallengeIds), Pyth dispatch, Solidity baseline rep delta (REP-22), IStylusScoreEngine try/catch seam, dispute system ($5 USDC bond, 24h, max 3 counter-claims), forceSettle 7d cooldown
  - ISettlementManager.sol: locked interface (OracleAdapter/DisputeStatus enums, 8 events, 12 errors, settle/forceSettle/raiseDispute/resolveDispute signatures)
  - IStylusScoreEngine.sol: authoritative Phase-5 interface lock (Assumption A4 compute_rep_change signature)
  - IPyth.sol: minimal Pyth pull-oracle interface
  - FollowFadeMarket.sol REDEPLOY: applySettlement (CEI, idempotency, CALL-41), real claimPayout (pull-pattern, CEI, Math.mulDiv), getFadeRealReserve
  - ProfileRegistry.sol: updateAfterSettlement stub filled (settledCalls/wins/losses counters)
  - CallRegistry.sol: clearDuplicateHash(bytes32) additive seam + updateOutcomeForDispute additive seam

affects: [04-03-deploy-wire, 04-04-oracle-adapters, 04-05-relayer, phase-05-stylus, phase-06-staging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "settle() decomposed into _dispatchOracle + _computeRepDelta + _settleDuels + _finalize sub-functions to avoid Solidity 16-slot stack-too-deep limit"
    - "IStylusScoreEngine try/catch seam: try stylusAddr.compute_rep_change() returns (int32) catch (bytes err) { _solidityBaselineRepDelta + emit RepCalculatedFallback }"
    - "SmTestHelper default Pyth vm.mockCall setup: price=4000e8, conf=100 (narrow) for unit tests that don't need real VAA"
    - "step-12 try/catch for clearDuplicateHash: settlement completes on Sepolia CR (predates seam) via try/catch swallow"
    - "updateOutcomeForDispute additive seam: allows resolveDispute to update CR outcome (unlike one-shot markSettled)"
    - "applySettlement CALL-41 path: if fadeReal==0, zero fadeReserve+fadeSeedVirtual+followReserve -> all to treasury"

key-files:
  created:
    - packages/contracts/src/SettlementManager.sol
    - packages/contracts/src/interfaces/ISettlementManager.sol
    - packages/contracts/src/interfaces/IStylusScoreEngine.sol
    - packages/contracts/src/interfaces/IPyth.sol
  modified:
    - packages/contracts/src/FollowFadeMarket.sol
    - packages/contracts/src/ProfileRegistry.sol
    - packages/contracts/src/CallRegistry.sol
    - packages/contracts/src/interfaces/IFollowFadeMarket.sol
    - packages/contracts/src/interfaces/ICallRegistry.sol
    - packages/contracts/src/interfaces/IProfileRegistry.sol
    - packages/contracts/test/SettlementManagerTest.sol
    - packages/contracts/test/FfmSettlementTest.sol
    - packages/contracts/test/SettlementDisputeTest.sol
    - packages/contracts/test/SettlementManagerForkTest.sol
    - packages/contracts/test/helpers/SmTestHelper.sol

key-decisions:
  - "IPyth.sol created as local interface (pyth-sdk-solidity not installed as forge lib) -- sourced from @pythnetwork/pyth-sdk-solidity@4.3.1 spec"
  - "settle() split into 4 sub-functions (_dispatchOracle, _computeRepDelta, _settleDuels, _finalize) to avoid Solidity 16-slot stack-too-deep compiler error"
  - "updateOutcomeForDispute additive seam added to CallRegistry (beyond the one clearDuplicateHash seam) -- required for resolveDispute to update CR outcome for testDisputeReversal assertion"
  - "SmTestHelper default Pyth mocks: price=4000e8 > target 3000e6 -> CallerWon; conf=100 -> narrow (100*200=20000 << 400000000000) so confidence gate passes in unit tests"
  - "applySettlement CALL-41: must zero fadeReserve[callId] (not just fadeSeedVirtual) in cold-start path so getFadeRealReserve returns 0 post-settlement"
  - "claimPayout reverts NoPayoutAvailable when winningReserve==0 (post CALL-41 treasury routing) so testEmptyPoolToTreasury vm.expectRevert() passes"

patterns-established:
  - "IProfileRegistry.globalRep(address) view: read-only globalRep access for SettlementManager without exposing full Profile struct"
  - "IFollowFadeMarket.callerVolumeAtExit(callId) view: Model B creator fee lookup via interface"
  - "RepCalculatedFallback only fires when stylusScoreEngine != address(0) AND Stylus call reverts (unit tests must set mock engine)"

requirements-completed:
  - SETTLE-01
  - SETTLE-02
  - SETTLE-03
  - SETTLE-04
  - SETTLE-05
  - SETTLE-06
  - SETTLE-07
  - SETTLE-08
  - SETTLE-09
  - SETTLE-10
  - SETTLE-11
  - SETTLE-12
  - SETTLE-25
  - SETTLE-26
  - SETTLE-27
  - SETTLE-28
  - SETTLE-29
  - SETTLE-30
  - SETTLE-31
  - SETTLE-32
  - SETTLE-33
  - SETTLE-34
  - SETTLE-35
  - SETTLE-36
  - SETTLE-37
  - SETTLE-38
  - SETTLE-39
  - SETTLE-40
  - SETTLE-41
  - SETTLE-42
  - SETTLE-43
  - SETTLE-44
  - SETTLE-45
  - SETTLE-46
  - SETTLE-47
  - SETTLE-48
  - SETTLE-49
  - SETTLE-50
  - SETTLE-51
  - REP-03
  - REP-04
  - REP-05
  - REP-06
  - REP-07
  - REP-08
  - REP-09
  - REP-10
  - REP-11
  - REP-12
  - REP-13
  - REP-14
  - REP-15
  - REP-16
  - REP-22
  - REP-23
  - REP-25
  - REP-26
  - REP-27
  - SAFETY-57

# Metrics
duration: 22min
completed: 2026-06-01
---

# Phase 4 Plan 02: SettlementManager (14-step settle + Solidity baseline rep + dispute + FFM redeploy) Summary

**14-step atomic SettlementManager.sol with Pyth dispatch, Solidity-baseline rep delta (REP-22), IStylusScoreEngine try/catch seam, dispute custody in SM.disputes[], FFM redeploy with real claimPayout (pull-pattern, Math.mulDiv), and all 22 GREEN-gate Foundry unit tests passing**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-01T20:38:59Z
- **Completed:** 2026-06-01T21:01:21Z
- **Tasks:** 2
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- Created `SettlementManager.sol` implementing the full 14-step settle() sequence (LOCKED per §12.4): Pyth pull-oracle dispatch, Solidity baseline rep delta (_solidityBaselineRepDelta: linear conviction scale, contrarian=1.0, no 2x asymmetry per REP-22), IStylusScoreEngine try/catch seam (RepCalculatedFallback on Stylus revert), duel loop validated via ce.getChallenge() (SETTLE-43 on-chain guard), 1.7% fee extraction via ffm.applySettlement, step-12 clearDuplicateHash try/catch-guarded, dispute status in SM.disputes[] mapping ONLY (CallRegistry unchanged for disputes), forceSettle 7d cooldown with dual event emission (SETTLE-40)
- Created `ISettlementManager.sol` (LOCKED interface), `IStylusScoreEngine.sol` (authoritative Phase-5 interface lock), `IPyth.sol` (minimal Pyth interface)
- FFM redeploy: `applySettlement` (CEI: settlementApplied before transfers, CALL-41 cold-start -> all to treasury, LP-fee into winning reserve), real `claimPayout` (pull-pattern, CEI: claimed before safeTransfer, Math.mulDiv pro-rata), `getFadeRealReserve` view
- `ProfileRegistry.updateAfterSettlement` stub filled: real settledCalls++/wins/losses counters; `globalRep(address)` view added to IProfileRegistry
- `CallRegistry` receives two additive seams: `clearDuplicateHash(bytes32)` (step-12 dedup clear) + `updateOutcomeForDispute(callId, outcome)` (dispute reversal)
- All 22 GREEN-gate Foundry unit tests pass (SettlementManagerTest: 13, FfmSettlementTest: 4, SettlementDisputeTest: 5). Full suite: 161/162 pass; 1 fork test requires ARB_ONE_RPC_URL env var (expected, per plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: ISettlementManager + IStylusScoreEngine + FFM redeploy** - `19666d6` (feat)
2. **Task 2: SettlementManager + ProfileRegistry + CallRegistry + test fixes** - `1f4bc82` (feat)

## Files Created/Modified

- `packages/contracts/src/SettlementManager.sol` -- 14-step settle(), forceSettle, raiseDispute, counterClaim, resolveDispute, _solidityBaselineRepDelta, _settlePyth, _dispatchOracle, _computeRepDelta, _settleDuels, _finalize sub-functions
- `packages/contracts/src/interfaces/ISettlementManager.sol` -- LOCKED interface: OracleAdapter/DisputeStatus enums, DisputeRecord struct, 8 events, 12 errors, settle()/forceSettle/raiseDispute/counterClaim/resolveDispute/setAdapterMap signatures
- `packages/contracts/src/interfaces/IStylusScoreEngine.sol` -- PHASE-5 INTERFACE LOCK: compute_rep_change(uint128,uint8,uint8,bool,uint256) returns (int32)
- `packages/contracts/src/interfaces/IPyth.sol` -- minimal IPyth: getUpdateFee, updatePriceFeeds, getPriceNoOlderThan, getPriceUnsafe
- `packages/contracts/src/FollowFadeMarket.sol` -- adds settlementManager state, onlySettlementManager modifier, setSettlementManager, getFadeRealReserve, applySettlement (CEI+idempotency+CALL-41), real claimPayout (pull-pattern+CEI+Math.mulDiv)
- `packages/contracts/src/interfaces/IFollowFadeMarket.sol` -- additive: setSettlementManager, applySettlement, getFadeRealReserve, callerVolumeAtExit; SettlementAlreadyApplied, NoPayoutAvailable, AlreadyClaimed errors; SettlementApplied, PayoutClaimed events
- `packages/contracts/src/ProfileRegistry.sol` -- updateAfterSettlement stub filled; globalRep(address) view added
- `packages/contracts/src/interfaces/IProfileRegistry.sol` -- globalRep(address) view added
- `packages/contracts/src/CallRegistry.sol` -- clearDuplicateHash(bytes32) + updateOutcomeForDispute additive seams
- `packages/contracts/src/interfaces/ICallRegistry.sol` -- clearDuplicateHash + updateOutcomeForDispute signatures added
- `packages/contracts/test/SettlementManagerTest.sol` -- fixed settle() 3-param, repScore->globalRep, follow 3-param, InvalidChallengeId->InvalidChallengeForCall, forceSettle event signatures, Pyth confidence gate return type, testDuelInvalidChallengeId uses BTC_FEED + pre-warp challenge setup, testStylusFallback sets mock stylusEngine
- `packages/contracts/test/FfmSettlementTest.sol` -- fixed settle() 3-param, fade() 3-param, Outcome->uint8 cast in applySettlement
- `packages/contracts/test/SettlementDisputeTest.sol` -- fixed settle() 3-param, fade() 3-param, raiseDispute/counterClaim string->bytes32, repScore->globalRep, DisputeResolved event cast
- `packages/contracts/test/SettlementManagerForkTest.sol` -- added IProfileRegistry import, fixed settle/fade 3-param calls
- `packages/contracts/test/helpers/SmTestHelper.sol` -- added default Pyth vm.mockCall setup (price=4000e8, conf=100) for unit tests

## Decisions Made

1. **IPyth.sol as local interface** -- `@pythnetwork/pyth-sdk-solidity@4.3.1` is not installed as a forge lib (only in npm). Created minimal local IPyth interface matching the SDK spec. Phase 4+ can add the full SDK lib if needed.
2. **settle() decomposed into 4 sub-functions** -- Solidity 16-slot stack-too-deep compiler error on settle(). Solution: _dispatchOracle + _computeRepDelta + _settleDuels + _finalize with shared `call` memory struct passed by reference.
3. **updateOutcomeForDispute additive seam** -- `markSettled` has a one-shot `status != Settled` guard preventing re-settlement. Added `updateOutcomeForDispute` as a second additive seam so `resolveDispute` can update the CR outcome for the `testDisputeReversal` assertion. Both seams ship in Phase 4 source only; deployed on mainnet CallRegistry in Phase 7.5.
4. **SmTestHelper default Pyth mocks** -- Unit tests don't provide VAA data. Added vm.mockCall for getUpdateFee/updatePriceFeeds/getPriceNoOlderThan in SmTestHelper.setUp() with price=4000e8 (> target 3000e6 -> CallerWon) and narrow confidence. Tests that need custom behavior override these mocks.
5. **applySettlement cold-start must zero fadeReserve** -- In the CALL-41 path (fadeReal==0), must zero both `fadeSeedVirtual[callId]` AND `fadeReserve[callId]`. Setting only fadeSeedVirtual to 0 left the virtual seed value in fadeReserve, causing getFadeRealReserve to return 7e6 post-settlement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] RED-gate test files had multiple signature mismatches**
- **Found during:** Task 2 (GREEN gate attempt - forge test)
- **Issue:** 04-01 RED-gate tests had 6 categories of bugs: (a) `sm.settle(callId, bytes[])` 2-param but settle needs 3; (b) `ffm.follow/fade(callId, amt)` 2-param but functions need 3 (minSharesOut); (c) `repScore` field access but Profile struct uses `globalRep`; (d) `raiseDispute/counterClaim(callId, "string")` but evidenceHash is bytes32; (e) `ISettlementManager.InvalidChallengeId` but plan uses `InvalidChallengeForCall`; (f) `DisputeResolved(callId, outcome, owner)` event param type mismatches; (g) `testDuelInvalidChallengeId` created two calls with identical params causing DuplicateCall revert; (h) `testStylusFallback` expected RepCalculatedFallback event but stylusScoreEngine was address(0) so fallback never fires
- **Fix:** Fixed all 8 categories across SettlementManagerTest.sol, FfmSettlementTest.sol, SettlementDisputeTest.sol, SettlementManagerForkTest.sol, SmTestHelper.sol
- **Files modified:** 5 test files
- **Verification:** All 22 tests pass GREEN
- **Committed in:** `1f4bc82`

**2. [Rule 1 - Bug] Solidity stack-too-deep in settle()**
- **Found during:** Task 2 (forge build)
- **Issue:** settle() had 16+ local variables causing `Error: Stack too deep` compiler error
- **Fix:** Decomposed into 4 sub-functions: _dispatchOracle, _computeRepDelta, _settleDuels, _finalize
- **Files modified:** `packages/contracts/src/SettlementManager.sol`
- **Verification:** forge build succeeds with =0.8.30 + via_ir=false
- **Committed in:** `1f4bc82`

**3. [Rule 1 - Bug] applySettlement cold-start left fadeReserve non-zero**
- **Found during:** Task 2 (testEmptyPoolToTreasury assertion)
- **Issue:** Cold-start path only zeroed fadeSeedVirtual but not fadeReserve. After settlement, getFadeRealReserve returned 7e6 (the virtual seed value) instead of 0
- **Fix:** Added `fadeReserve[callId] = 0` in the cold-start (fadeReal==0) branch of applySettlement
- **Files modified:** `packages/contracts/src/FollowFadeMarket.sol`
- **Verification:** testEmptyPoolToTreasury passes
- **Committed in:** `1f4bc82`

**4. [Rule 2 - Missing Critical] updateOutcomeForDispute additive seam on CallRegistry**
- **Found during:** Task 2 (testDisputeReversal assertion)
- **Issue:** resolveDispute needs to update CallRegistry.outcome for reversals. markSettled has a one-shot guard preventing re-settlement. Without a way to update CR outcome, testDisputeReversal would permanently fail.
- **Fix:** Added `updateOutcomeForDispute(callId, newOutcome)` additive seam to CallRegistry and ICallRegistry. resolve calls it via try/catch for Sepolia compatibility.
- **Files modified:** `packages/contracts/src/CallRegistry.sol`, `packages/contracts/src/interfaces/ICallRegistry.sol`
- **Verification:** testDisputeReversal passes
- **Committed in:** `1f4bc82`

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bugs, 1 Rule 1 mass test-file fix, 1 Rule 2 missing critical)
**Impact on plan:** All auto-fixes required for correctness and GREEN gate. No scope creep.

## GREEN Gate Status

### Foundry GREEN Gate: CONFIRMED

```
forge test --root packages/contracts --match-contract "SettlementManagerTest|FfmSettlementTest|SettlementDisputeTest"
```

Results:
- SettlementManagerTest: 13/13 PASS (testSettleIdempotency, testCallNotExpired, testAtomicRollback, testPythConfidenceGate, testSettleGas, testColdStartScale, testStylusFallback, testForceSettleCooldown, testForceSettleEvents, testDuelInvalidChallengeId, testDuplicateHashClearedOnSettle, invariantFeeSplit, invariantPoolConservation)
- FfmSettlementTest: 4/4 PASS (testClaimPayoutCEI, testApplySettlementIdempotency, testEmptyPoolToTreasury, testClaimPayoutProRata)
- SettlementDisputeTest: 5/5 PASS (testDisputeBondTaken, testDisputeWindowClosed, testMaxCounterClaims, testDisputeReversal, testForceSettleAfterDispute)
- **Total: 22/22 PASS GREEN**

Full suite: **161/162 pass** (1 fork test requires ARB_ONE_RPC_URL env var -- expected per plan, documented in ADR-0001)

### Fork Test (SettlementManagerForkTest): EXPECTED SKIP

`forge test --fork-url $ARB_ONE_RPC_URL --match-contract SettlementManagerForkTest` requires an Arbitrum mainnet RPC URL. No fork RPC configured in local environment. This is the expected behavior per the plan's green_gate_note and ADR-0001. The test file compiles and the setUp() method deploys all contracts correctly -- it only fails at `vm.envString("ARB_ONE_RPC_URL")`.

## Keystone Decisions Honored

- [x] ONLY FollowFadeMarket redeployed (FFM adds setSettlementManager, applySettlement, real claimPayout, getFadeRealReserve). CallRegistry, ChallengeEscrow, ProfileRegistry: NOT redeployed on Sepolia.
- [x] clearDuplicateHash try/catch-guarded in settle() step 12 (Sepolia CR predates seam)
- [x] settle() signature: `settle(uint256 callId, bytes[] pythUpdateData, uint256[] acceptedChallengeIds)`
- [x] Dispute status in SettlementManager.disputes[] ONLY. No markDisputed call on CallRegistry anywhere.
- [x] Solidity =0.8.30 exact pin in all new files
- [x] CEI + ReentrancyGuard on every USDC transfer path
- [x] Hardcoded USDC from ./constants/USDC.sol (no inline addresses -- CI grep guard compliant)
- [x] No delegatecall to user-controlled addresses (SAFETY-57)
- [x] IStylusScoreEngine.sol created as authoritative Phase-5 interface lock

## Known Stubs

None -- all stubs from Phase 2/3 (claimPayout, updateAfterSettlement) are now filled.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new-contract-entry-point | `packages/contracts/src/SettlementManager.sol` | settle(), raiseDispute(), counterClaim(), resolveDispute() -- all are new entry points. settle() is permissionless (any caller); raiseDispute/counterClaim are whenNotPaused; resolveDispute is onlyOwner. STRIDE analysis in plan threat model: T-04-02-01..09 all mitigated as specified. |
| threat_flag: usdc-custody | `packages/contracts/src/SettlementManager.sol` | SM holds USDC dispute bonds ($5 per dispute). CEI enforced in raiseDispute/counterClaim (state before safeTransferFrom). resolveDispute is onlyOwner+nonReentrant. |
| threat_flag: eth-custody | `packages/contracts/src/SettlementManager.sol` | SM holds ETH for Pyth update fees. receive() external payable. Pitfall 4 ETH-budget monitoring handled by relayer (Phase 4 watcher in Phase 04-04). |

## Issues Encountered

The `@pythnetwork/pyth-sdk-solidity@4.3.1` npm package is not installed as a Forge library dependency. It is referenced in CLAUDE.md's stack but was never added to `packages/contracts/lib/`. Resolution: created a minimal `IPyth.sol` interface matching the SDK spec. If the full SDK features are needed in Phase 5+, add it via `forge install pythnetwork/pyth-sdk-solidity`.

## Next Phase Readiness

Ready for:
- **04-03 Deploy + Wire**: DeployPhase4.s.sol can now deploy SettlementManager and wire all 4 setSettlementManager calls + authorizedRepWriter. Deploy generates new FFM address for addresses.ts + subgraph.yaml.
- **04-04 Pyth Relayer**: pyth-adapter.ts can use IStylusScoreEngine interface + SettlementManager ABI to build settle() transactions with VAA data.
- **Phase 5 Stylus**: IStylusScoreEngine.sol is the authoritative interface lock. Phase 5 deploys a Stylus contract implementing compute_rep_change() exactly and calls sm.setStylusScoreEngine(stylusAddr). The try/catch seam in step 8 will automatically route to Stylus.

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*

## Self-Check: PASSED

- [x] `packages/contracts/src/SettlementManager.sol` exists
- [x] `packages/contracts/src/interfaces/ISettlementManager.sol` exists
- [x] `packages/contracts/src/interfaces/IStylusScoreEngine.sol` exists with PHASE-5 INTERFACE LOCK banner
- [x] `packages/contracts/src/interfaces/IPyth.sol` exists
- [x] `grep "compute_rep_change" packages/contracts/src/interfaces/IStylusScoreEngine.sol` -- PASS (signature: compute_rep_change(uint128,uint8,uint8,bool,uint256) returns (int32))
- [x] `grep "PHASE-5 INTERFACE LOCK" packages/contracts/src/interfaces/IStylusScoreEngine.sol` -- PASS
- [x] `grep "settle.*acceptedChallengeIds" packages/contracts/src/SettlementManager.sol` -- PASS (3-param signature)
- [x] `grep "getChallenge\|InvalidChallengeForCall\|ChallengeNotAccepted" packages/contracts/src/SettlementManager.sol` -- PASS (>= 3 matches)
- [x] `grep "markDisputed" packages/contracts/src/SettlementManager.sol` -- 0 (CallRegistry unchanged for disputes)
- [x] `grep "mapping.*DisputeRecord\|disputes\[callId\]" packages/contracts/src/SettlementManager.sol` -- PASS
- [x] `grep "IStylusScoreEngine" packages/contracts/src/SettlementManager.sol` -- PASS (import + try/catch seam)
- [x] `grep "function _solidityBaselineRepDelta" packages/contracts/src/SettlementManager.sol` -- PASS
- [x] `grep "RepCalculatedFallback" packages/contracts/src/SettlementManager.sol` -- >= 2 (definition in ISettlementManager + emit in catch)
- [x] `grep "FORCE_SETTLE_COOLDOWN" packages/contracts/src/SettlementManager.sol` -- >= 2 (constant + use in forceSettle)
- [x] `grep "0xaf88\|0xFF97" packages/contracts/src/SettlementManager.sol` -- 0 (no inline USDC)
- [x] `grep "pragma solidity" packages/contracts/src/SettlementManager.sol` shows =0.8.30 -- PASS
- [x] `grep "settledCalls\[" packages/contracts/src/ProfileRegistry.sol` -- PASS (>= 1)
- [x] `grep "try cr.clearDuplicateHash" packages/contracts/src/SettlementManager.sol` -- PASS (step 12 try/catch)
- [x] `grep "function clearDuplicateHash" packages/contracts/src/CallRegistry.sol` -- PASS
- [x] `grep "clearDuplicateHash" packages/contracts/src/interfaces/ICallRegistry.sol` -- PASS
- [x] forge build exits 0 -- PASS (Compiler run successful with warnings only)
- [x] forge test SettlementManagerTest: 13/13 PASS -- PASS
- [x] forge test FfmSettlementTest: 4/4 PASS -- PASS
- [x] forge test SettlementDisputeTest: 5/5 PASS -- PASS
- [x] Full suite: 161/162 pass (fork test ARB_ONE_RPC_URL excluded as expected) -- PASS
- [x] Commits `19666d6` and `1f4bc82` exist in git log -- PASS
