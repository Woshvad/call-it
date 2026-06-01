---
phase: 03-challengeescrow
plan: 01
subsystem: contracts
tags: [solidity, tdd, interface, foundry, vitest, red-gate, challenge-escrow]

requires:
  - phase: 02-followfademarket
    provides: FfmTestHelper abstract base + 3-contract stack (ProfileRegistry, CallRegistry, FollowFadeMarket)
  - phase: 02-followfademarket
    provides: IFollowFadeMarket.sol interface analog (structure mirrored exactly)

provides:
  - packages/contracts/src/interfaces/IChallengeEscrow.sol — LOCKED §12.3 interface (ChallengeStatus enum, Challenge struct, 9 events, 14 errors, all function signatures)
  - packages/contracts/test/helpers/CeTestHelper.sol — abstract test base extending FfmTestHelper with ChallengeEscrow deploy + challenger actor
  - packages/contracts/test/ChallengeEscrow.t.sol — full propose/accept/reject/refund/claim matrix + 3 fuzz invariants (RED gate)
  - packages/contracts/test/ChallengeEscrowGates.t.sol — SOCIAL-29/32/33/34 and D-04 3-way TVL cap gate tests (RED gate)
  - packages/contracts/test/ChallengeEscrowParity.t.sol — Foundry-side parity with Vitest challenge-gates.test.ts (RED gate)
  - apps/web/tests/challenge-gates.test.ts — 12 Vitest parity tests for stake bounds / self-challenge / window / openToChallenges (GREEN)

affects: [03-02-challengeescrow-implementation, 03-03-deploy, 03-04-subgraph, 03-05-relayer]

tech-stack:
  added: []
  patterns:
    - "IChallengeEscrow: LOCKED interface pattern — NatSpec LOCKED header; all downstream plans import types; never modified after 03-01 commit"
    - "CeTestHelper: abstract helper extends FfmTestHelper (adds ChallengeEscrow 4th contract + challenger actor); C3 linearization safe (no StdInvariant)"
    - "RED gate pattern: test files import src/ChallengeEscrow.sol (nonexistent); compile fails by design; Plan 03-02 makes GREEN"
    - "Vitest parity: pure TS challengeGates utility object mirrors Solidity gate conditions; runs without any contract dependency"

key-files:
  created:
    - packages/contracts/src/interfaces/IChallengeEscrow.sol
    - packages/contracts/test/helpers/CeTestHelper.sol
    - packages/contracts/test/ChallengeEscrow.t.sol
    - packages/contracts/test/ChallengeEscrowGates.t.sol
    - packages/contracts/test/ChallengeEscrowParity.t.sol
    - apps/web/tests/challenge-gates.test.ts
  modified: []

key-decisions:
  - "IChallengeEscrow.sol is LOCKED — NatSpec header and T-3-01-01 threat register both document this; any drift breaks Plan 03-02/04/05"
  - "CeTestHelper does NOT inherit StdInvariant — same C3 linearization rule as FfmTestHelper; invariant contracts use explicit inheritance"
  - "openToChallenges gate test uses _seedPoolClosed() helper (calls createCall with openToChallenges=false) — CallRegistry has no setOpenToChallenges() setter; the flag is immutable after creation"
  - "Vitest file placed in apps/web/tests/ (not src/__tests__) — vitest.config.ts include pattern is tests/**/*.test.ts; plan frontmatter had wrong path"
  - "SOCIAL-46/47 regression gate: 111 existing Phase 2 tests confirmed passing before RED gate introduction (forge test output at plan start)"

metrics:
  duration: 25min
  completed: 2026-06-01
---

# Phase 3 Plan 01: ChallengeEscrow Interface + RED Gate Tests Summary

**LOCKED §12.3 IChallengeEscrow interface + CeTestHelper abstract base + full Foundry test matrix (RED gate — ChallengeEscrow.sol not yet created) + Vitest parity (GREEN)**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-01T11:25:12Z
- **Completed:** 2026-06-01T11:50:00Z
- **Tasks:** 2
- **Files modified:** 6 (6 created, 0 modified)

## Accomplishments

- `IChallengeEscrow.sol`: pragma =0.8.30 exact; SPDX MIT; LOCKED header NatSpec; `ChallengeStatus` enum (Proposed/Accepted/Rejected/Refunded/Settled); `Challenge` struct with all 11 fields per RESEARCH.md Pattern 1; 9 events (all indexed on `challengeId`); 14 custom errors; all function signatures with pause carve-out NatSpec on `claimDuelPayout`/`claimOverage`; compiles standalone (confirmed via `forge build src/interfaces/IChallengeEscrow.sol`)

- `CeTestHelper.sol`: abstract contract extending FfmTestHelper; boots 4-contract stack (super.setUp() → ProfileRegistry + CallRegistry + FollowFadeMarket + ChallengeEscrow); `challenger` actor with 1000 USDC mint; max-approve for alice/bob/challenger; `_proposeChallenge(from, callId, stake)` helper; C3-safe (no StdInvariant inheritance)

- `ChallengeEscrow.t.sol`: 11 tests covering full lifecycle: testProposeAndAccept, testRejectRefundsImmediately, testClaimRefundAfterWindow (vm.warp 25h), testClaimDuelPayout_winner (mock settleDuel), testClaimDuelPayout_idempotent (AlreadyClaimed), testClaimDuelPayout_nonWinner (NotDuelWinner), testAsymmetricPot (pot = min*2), testOveragePushFail, testClaimOverageLosing; plus 3 fuzz invariants (fuzz_escrowConservation, fuzz_payoutCeiling, fuzz_overageConservation)

- `ChallengeEscrowGates.t.sol`: 9 gate tests: testProposeRevertsNotOpen (SOCIAL-29), testSelfChallengeBanned (SOCIAL-32), testChallengeNotLive (SOCIAL-33), testWindowExpired (SOCIAL-34), testTvlCap3Way + testTvlCap3Way_acceptReverts (D-04), testStakeBelowMinimum, testStakeAboveMaximum, testClaimRefundBeforeWindow, testClaimPayoutBeforeSettle, testSettleDuelUnauthorized

- `ChallengeEscrowParity.t.sol`: 8 Foundry tests mirroring Vitest names exactly: test_stakeBelowMinimum, test_stakeAtMinimum, test_stakeAboveMaximum, test_stakeAtMaximum, test_selfChallengeDetected, test_openToChallengesFlag_false, test_windowExpired, test_windowValid

- `challenge-gates.test.ts`: 12 Vitest tests in 4 describe blocks (stake bounds, self-challenge, openToChallenges flag, acceptance window); pure TS `challengeGates` utility object; all 12 PASS (`pnpm --filter @call-it/web test --run challenge-gates` exits 0)

- RED gate confirmed: `forge build` fails with `ChallengeEscrow.sol not found` for all 3 test files and CeTestHelper — expected behavior per TDD protocol

- SOCIAL-46/47 regression: 111 existing Phase 2 tests confirmed passing before RED gate introduction

## Task Commits

1. **Task 1: IChallengeEscrow.sol + CeTestHelper + RED Foundry tests** — `27d8084`
2. **Task 2: Vitest challenge-gates parity (GREEN)** — `133b49d`

## Files Created/Modified

- `packages/contracts/src/interfaces/IChallengeEscrow.sol` — LOCKED §12.3 interface; compiles standalone; pragma =0.8.30; no inline USDC address
- `packages/contracts/test/helpers/CeTestHelper.sol` — Abstract helper extending FfmTestHelper; ChallengeEscrow + challenger actor
- `packages/contracts/test/ChallengeEscrow.t.sol` — Full lifecycle test matrix + fuzz invariants (RED gate)
- `packages/contracts/test/ChallengeEscrowGates.t.sol` — Gate/revert tests for all SOCIAL-29..34 conditions + D-04 (RED gate)
- `packages/contracts/test/ChallengeEscrowParity.t.sol` — Foundry-side parity with Vitest (RED gate)
- `apps/web/tests/challenge-gates.test.ts` — 12 Vitest parity tests (GREEN)

## Decisions Made

1. **`_seedPoolClosed()` helper instead of `setOpenToChallenges()`** — CallRegistry has no toggle function; `openToChallenges` is set at call creation time and is immutable. Gate tests that require a closed call use a helper that passes `false` to `createCall` directly.

2. **Vitest file path: `tests/` not `src/__tests__/`** — Plan frontmatter listed `apps/web/src/__tests__/challenge-gates.test.ts` but `vitest.config.ts` include pattern is `tests/**/*.test.ts`. The file was placed in `apps/web/tests/` to match the actual config. All 12 tests pass.

3. **SOCIAL-46/47 regression gate** — 111 existing Phase 2 tests confirmed passing before creating CeTestHelper (which imports nonexistent ChallengeEscrow.sol and blocks all compilation). The regression confirmation is documented here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `_seedPoolClosed()` helper: CallRegistry has no `setOpenToChallenges()` setter**
- **Found during:** Task 1 (ChallengeEscrowGates.t.sol creation)
- **Issue:** Plan's gate tests called `registry.setOpenToChallenges(callId, false)` — this function does not exist in CallRegistry. The `openToChallenges` field is set at `createCall` time and is immutable.
- **Fix:** Added `_seedPoolClosed(caller, stake)` helper in both ChallengeEscrowGates.t.sol and ChallengeEscrowParity.t.sol that calls `createCall` directly with `openToChallenges = false`.
- **Files modified:** ChallengeEscrowGates.t.sol, ChallengeEscrowParity.t.sol
- **Commit:** `27d8084`

**2. [Rule 1 - Bug] Vitest test path mismatch**
- **Found during:** Task 2 (creating challenge-gates.test.ts)
- **Issue:** Plan frontmatter says `apps/web/src/__tests__/challenge-gates.test.ts` but `vitest.config.ts` include pattern is `tests/**/*.test.ts`. File at `src/__tests__/` would be ignored by Vitest.
- **Fix:** Placed file at `apps/web/tests/challenge-gates.test.ts` to match the actual include pattern.
- **Files modified:** challenge-gates.test.ts (path correction)
- **Commit:** `133b49d`

## Known Stubs

None — this is a TDD RED gate plan. The test files themselves are not stubs; they are complete tests awaiting the implementation.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes introduced. This plan creates only interface definitions and test files.

| Flag | File | Description |
|------|------|-------------|
| threat_flag: interface-lock | `packages/contracts/src/interfaces/IChallengeEscrow.sol` | LOCKED interface consumed by 4 downstream plans; any drift breaks all downstream ABI consumers (T-3-01-01 mitigated via LOCKED NatSpec header) |

## TDD Gate Compliance

- RED gate commit: `27d8084` (`test(03-01): add failing ChallengeEscrow tests...`) — confirmed compile failure
- GREEN gate: Plan 03-02 responsibility
- IChallengeEscrow.sol compiles standalone: `forge build src/interfaces/IChallengeEscrow.sol` — exit 0
- All 3 Foundry test files fail to compile (ChallengeEscrow.sol missing): `forge build` — exit 2
- Vitest parity GREEN: `pnpm --filter @call-it/web test --run challenge-gates` — 12/12 pass

## Self-Check: PASSED

- [x] `packages/contracts/src/interfaces/IChallengeEscrow.sol` exists
- [x] `packages/contracts/test/helpers/CeTestHelper.sol` exists
- [x] `packages/contracts/test/ChallengeEscrow.t.sol` exists
- [x] `packages/contracts/test/ChallengeEscrowGates.t.sol` exists
- [x] `packages/contracts/test/ChallengeEscrowParity.t.sol` exists
- [x] `apps/web/tests/challenge-gates.test.ts` exists
- [x] Commit `27d8084` exists in git log (Task 1)
- [x] Commit `133b49d` exists in git log (Task 2)
- [x] `grep "pragma solidity" packages/contracts/src/interfaces/IChallengeEscrow.sol` → `=0.8.30`
- [x] `grep "0xaf88d065" packages/contracts/src/interfaces/IChallengeEscrow.sol` → 0 results
- [x] `forge build src/interfaces/IChallengeEscrow.sol` → `Compiler run successful!`
- [x] `forge build` → exits non-0 with ChallengeEscrow.sol not found (RED gate)
- [x] `pnpm --filter @call-it/web test --run challenge-gates` → 12 passed
- [x] `grep "CHALLENGE_MIN_STAKE = 5_000_000n" apps/web/tests/challenge-gates.test.ts` → match
