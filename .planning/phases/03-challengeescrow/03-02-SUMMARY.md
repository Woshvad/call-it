---
phase: 03-challengeescrow
plan: 02
subsystem: contracts
tags: [solidity, foundry, challenge-escrow, escrow, cei, tvl-cap, duel, settlement-seam]

requirements-completed: [SOCIAL-29, SOCIAL-31, SOCIAL-32, SOCIAL-33, SOCIAL-34, SOCIAL-35, SOCIAL-36, SOCIAL-37, SOCIAL-38, SOCIAL-39, SOCIAL-46, SOCIAL-47, SOCIAL-48]

key-files:
  created:
    - packages/contracts/src/ChallengeEscrow.sol
  modified: []

key-decisions:
  - "Accept formula implemented as min(callerInputStake, challengerStake) — the planned min(challengerStake, challengerStake) copy-paste bug (STATE.md Known Plan Issue #1) was fixed on sight; explicit comment at ChallengeEscrow.sol:203"
  - "getTvl() returns the totalEscrow counter, NOT USDC.balanceOf(this) — avoids double-counting against the 3-way cap (Pitfall B)"
  - "_pushOverage uses IERC20.transfer (bool return), NOT safeTransfer — a griefing overcommitter wallet cannot revert settleDuel; on push failure state rolls back and UnclaimedOverageCreated is emitted for the claimOverage fallback (Pitfall C / D-03)"
  - "_checkTvlCap aggregates callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming against own tvlCap (D-04); both proposeChallenge and acceptChallenge enforce it"
  - "settlementManager starts at address(0); settleDuel guarded onlySettlementManager (D-01 seam) — Phase 4 wires it via one setSettlementManager call, no ChallengeEscrow redeploy"
  - "claimDuelPayout + claimOverage are NOT whenNotPaused-guarded (§10.3 pause carve-out); proposeChallenge + acceptChallenge ARE"
  - "No single-accept guard — many accepted duels per call, keyed by challengeId (D-09)"

duration: ~13min (interrupted by API socket error after the implementation commit; closed out by orchestrator)
completed: 2026-06-01
---

# Phase 3 Plan 2: ChallengeEscrow.sol GREEN Implementation Summary

**Single non-upgradeable money contract for all 1v1 duel escrow logic — turns the Plan 03-01 RED Foundry tests GREEN. Phase-4-ready via the settleDuel authorization seam (D-01); asymmetric-stake overage handled by push-then-claim (Pitfall 21 / D-03); 3-way TVL cap via a totalEscrow counter (Pitfall B / D-04).**

## Performance

- **Tasks:** 1
- **Files:** 1 created (`packages/contracts/src/ChallengeEscrow.sol`, 469 lines)
- **Completed:** 2026-06-01

## Accomplishments

- Full `ChallengeEscrow.sol` implementing the §12.3 LOCKED `IChallengeEscrow` interface: `proposeChallenge`, `acceptChallenge`, `rejectChallenge`, `claimRefund`, `settleDuel`, `claimDuelPayout`, `claimOverage`, `getChallenge`, `getTvl`, `setSettlementManager`, `pause`/`unpause`.
- `pragma solidity =0.8.30` (exact pin, CI grep guard); inherits Ownable2Step + ReentrancyGuard + Pausable; all USDC paths use `USDC_ARB_NATIVE` from `constants/USDC.sol` (no literal address).
- CEI ordering throughout — every state write precedes `safeTransfer`/`safeTransferFrom` (documented invariant in the file header).
- `pot = min(callerStake, challengerStake) * 2`; `payout = pot * 99 / 100`; 1% protocol fee to treasury (§8.9, no creator/LP fee for duels).
- Self-challenge ban, MIN/MAX stake bounds, `CHALLENGE_ACCEPTANCE_WINDOW = 24h`, idempotent `claimDuelPayout` (`AlreadyClaimed`), `NotDuelWinner` revert for non-winners.

## Task Commits

1. **Task 1: ChallengeEscrow.sol GREEN implementation** — `b0fddab` (feat)

## Verification

- `forge test --match-contract ChallengeEscrow` → **28/28 PASS, 0 failed** (ChallengeEscrow.t.sol 9 + ChallengeEscrowGates.t.sol 11 + ChallengeEscrowParity.t.sol 8). Independently re-run by the orchestrator after the executor's API interruption — confirmed green.
- Commit message records 139 total contract tests passing under the CI fuzz profile (1000 runs).
- Accept-formula bug fix verified at `ChallengeEscrow.sol:206` (`_min(callerInputStake, ch.challengerStake)`).
- Pitfall B verified at `getTvl()` (returns `totalEscrow`); Pitfall C verified at `_pushOverage` (`IERC20.transfer` bool).

## Deviations from Plan

**1. [Known Plan Issue #1 — fixed on sight] Accept stake formula.** The plan's Task 1 `<action>` carried a `min(challengerStake, challengerStake)` copy-paste bug (the `<behavior>` block was correct). Implemented correctly as `min(callerInputStake, challengerStake)` so asymmetric stakes work (SOCIAL-31). Flagged by the orchestrator before dispatch and confirmed in the contract.

**2. [Closeout] Executor API interruption.** The executor agent hit an API socket error *after* committing the implementation (`b0fddab`) but *before* writing this SUMMARY and updating tracking. The orchestrator verified the GREEN gate independently (28/28) and wrote this SUMMARY + tracking updates. No code was changed during closeout.

## Next Plan Readiness

- 03-03 (DeployPhase3.s.sol + Sepolia deploy) can proceed — contract compiles and is GREEN. **autonomous: false** (broadcast needs the operator key).
- D-01 seam is in place for Phase 4 SettlementManager (no redeploy).

## Self-Check: PASSED

- [x] `packages/contracts/src/ChallengeEscrow.sol` exists on disk (469 lines)
- [x] Commit `b0fddab` exists in git log
- [x] `forge test --match-contract ChallengeEscrow` → 28 passed, 0 failed
- [x] Accept formula is `min(callerInputStake, challengerStake)` (ChallengeEscrow.sol:206)
- [x] `getTvl()` returns `totalEscrow` (not balanceOf); `_pushOverage` uses `IERC20.transfer`
- [x] `settleDuel` guarded `onlySettlementManager`; `settlementManager` defaults to `address(0)`

---
*Phase: 03-challengeescrow*
*Completed: 2026-06-01 (closed out by orchestrator after executor API interruption)*
