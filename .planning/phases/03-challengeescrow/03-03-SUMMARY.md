---
phase: 03-challengeescrow
plan: 03
subsystem: contracts-deploy
tags: [foundry, deploy, arbitrum-sepolia, addresses, challenge-escrow]

requirements-completed: [SOCIAL-36, SOCIAL-48]

key-files:
  created:
    - packages/contracts/script/DeployPhase3.s.sol
  modified:
    - packages/shared/src/constants/addresses.ts
    - packages/subgraph/subgraph.yaml

key-decisions:
  - "Deployed ChallengeEscrow to Arbitrum Sepolia at 0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2 (block 272815420) with user authorization; dry-run validated all 5 assertions before broadcast"
  - "settlementManager left at address(0) at deploy (D-01) — Phase 4 rotates it via setSettlementManager, no redeploy"
  - "addresses.ts + subgraph.yaml wired to the real address + deploy block in the same change (commit 1cb6586)"
  - "Arbiscan --verify deferred (optional; run forge verify-contract later)"

duration: ~part of the run-everything session
completed: 2026-06-01
---

# Phase 3 Plan 3: DeployPhase3 + Sepolia Deploy + addresses.ts Summary

**ChallengeEscrow deployed live to Arbitrum Sepolia and wired into shared constants + subgraph manifest.**

## Accomplishments

- `DeployPhase3.s.sol` — Foundry deploy script: deploys `ChallengeEscrow(CallRegistry v2, FollowFadeMarket, USDC native, treasury, tvlCap=5_000_000_000)` with 5 post-deploy on-chain assertions. Committed `a823af0`.
- **Live deploy (Arbitrum Sepolia, chain 421614):** `0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2`, block **272815420**, tx `0x507d8e265338c87ee8e80281bc496b1fd6b7dff26e2b5fd3de8554183da48748`. Dry-run validated first (assertions + gas), then broadcast.
- On-chain verification: `tvlCap()`=5e9, `getTvl()`=0, `settlementManager()`=0x0 (D-01), `callRegistry()`/`followFadeMarket()` correctly wired.
- `addresses.ts` `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` + `subgraph.yaml` ChallengeEscrow data source (address + startBlock 272815420) wired to the real values (commit `1cb6586`).

## Task Commits

1. **Task 1: DeployPhase3.s.sol** — `a823af0`
2. **Task 2: Sepolia deploy (broadcast)** — on-chain tx `0x507d8e26…` (no repo commit; broadcast artifact in `packages/contracts/broadcast/`)
3. **Task 3: addresses.ts + subgraph.yaml wiring** — `1cb6586`

## Deviations from Plan

- The deploy + wiring were originally deferred at the 03-03 checkpoint (operator chose "continue code, defer live infra"), then run later in the same session once the user explicitly authorized all 3 live actions. The deploy script + assertions were unchanged.

## Self-Check: PASSED

- [x] `packages/contracts/script/DeployPhase3.s.sol` exists
- [x] ChallengeEscrow live on-chain at `0x59eb7C80…bec2` (cast reads confirm constructor wiring)
- [x] `addresses.ts` `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` = real address
- [x] `subgraph.yaml` ChallengeEscrow startBlock = 272815420
- [x] shared + subgraph build clean after wiring

---
*Phase: 03-challengeescrow*
*Completed: 2026-06-01*
