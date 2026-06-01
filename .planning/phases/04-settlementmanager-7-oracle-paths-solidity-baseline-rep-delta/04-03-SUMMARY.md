---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 03
subsystem: contracts
tags: [solidity-0.8.30, deploy-script, addresses, subgraph, ops-runbook, pyth, settlement]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager.sol + FollowFadeMarket v2 (04-02)

provides:
  - DeployPhase4.s.sol: deploys FFM v2 + SettlementManager, wires 4x setSettlementManager,
    authorizes SM as rep writer, funds 0.1 ETH Pyth budget, post-deploy assertions + console REQUIRED NEXT STEPS
  - SettlementManager.json: full ABI (7 events, all functions, all errors) from forge inspect
  - addresses.ts: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA + SETTLEMENT_MANAGER_ARBITRUM_ONE placeholders + AddressRecord
  - subgraph.yaml: SettlementManager datasource with all 7 eventHandlers (blockHandler stub removed)
  - OPS-15-settlement-stuck.md: ETH balance check, Pyth retry flow, forceSettle 7d cooldown, dispute reversal note
  - OPS-16-stylus-reactivation.md: cargo stylus activate, 48h cutoff upgrade command, calendar schedule

affects: [04-04-oracle-adapters, 04-05-subgraph-handlers, 04-06-relayer, phase-05-stylus, phase-06-staging]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DeployPhase4.s.sol imports concrete contracts (CallRegistry, ProfileRegistry) for post-deploy assertions
       that access public state variables not exposed in interfaces (settlementManager(), authorizedRepWriters())"
    - "subgraph.yaml: blockHandlers removed from SettlementManager datasource; all 7 eventHandlers present
       for Plan 04-05 handler bodies to fill (grep gate enforces 7-handler minimum)"

key-files:
  created:
    - packages/contracts/script/DeployPhase4.s.sol
    - packages/subgraph/abis/SettlementManager.json
    - docs/runbooks/OPS-15-settlement-stuck.md
    - docs/runbooks/OPS-16-stylus-reactivation.md
  modified:
    - packages/shared/src/constants/addresses.ts
    - packages/subgraph/subgraph.yaml

key-decisions:
  - "DeployPhase4.s.sol imports CallRegistry + ProfileRegistry concrete contracts (not just interfaces)
     for post-deploy assertions — ICallRegistry and IProfileRegistry do not expose settlementManager()
     and authorizedRepWriters() view functions (public state variable getters). Additive import, no scope change."
  - "EMPTY_ADDRESSES removed from addresses.ts — was previously used by SETTLEMENT_MANAGER_ADDRESSES
     but now that record uses the new named constants; TS noUnusedLocals would have failed the build."
  - "subgraph.yaml blockHandlers stub replaced by 7 eventHandlers — Plan 04-05 fills handler bodies
     in settlement-manager.ts; graph-cli build intentionally blocked until 04-05 fills the exports."

# Metrics
duration: 9min
completed: 2026-06-01
---

# Phase 4 Plan 03: Deploy Script + addresses.ts + subgraph.yaml + OPS Runbooks Summary

**DeployPhase4.s.sol wired (FFM v2 + SettlementManager + 4x setSettlementManager + 0.1 ETH Pyth budget); SettlementManager.json ABI exported; addresses.ts + subgraph.yaml pre-deploy placeholders; OPS-15/OPS-16 runbooks written. STOPPED at on-chain deploy checkpoint awaiting operator.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-01T21:10:12Z
- **Completed:** 2026-06-01T21:19:17Z
- **Tasks:** 2 of 2 autonomous tasks complete (stopped at deploy checkpoint)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `DeployPhase4.s.sol`: deploys FFM v2 (same constructor as Phase 2 + new CR/PR args) + SettlementManager (7-param constructor), wires 4x `setSettlementManager` on CR/FFM/CE/PR, calls `setAuthorizedRepWriter(sm, true)`, sends 0.1 ETH to SM for Pyth VAA fees, post-deploy assertions (12 checks), DEPLOYMENT SUMMARY + REQUIRED NEXT STEPS console output. Compile: `forge build` exits 0.
- `packages/subgraph/abis/SettlementManager.json`: full ABI from `forge inspect SettlementManager abi --json` (constructor, receive, all public functions, all 7 events, all errors)
- `docs/runbooks/OPS-15-settlement-stuck.md`: ETH balance check + top-up command, Pyth confidence-wide flow, SettlementDelayed event check, relayer restart + re-enqueue via POST /api/settle/:callId, forceSettle 7-day cooldown gate (FORCE_SETTLE_COOLDOWN), dispute reversal SETTLE-35 note, incident log template
- `docs/runbooks/OPS-16-stylus-reactivation.md`: Phase 3 note (OPS-16 applies only after Phase 5 deploys Stylus), cargo stylus activate + cast send alternatives, 48h cutoff `cast send $STYLUS_PROXY_ADMIN "upgrade(address,address)" ...` command, T-30/15/7/1d calendar alert schedule, post-reactivation verification
- `packages/shared/src/constants/addresses.ts`: added `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` (zeroed placeholder with doc comment), `SETTLEMENT_MANAGER_ARBITRUM_ONE`, updated `SETTLEMENT_MANAGER_ADDRESSES` AddressRecord to use named constants (removed `EMPTY_ADDRESSES`); FFM v2 TODO comment. `pnpm --filter @call-it/shared build` exits 0.
- `packages/subgraph/subgraph.yaml`: replaced Phase-0 `blockHandlers: [handleBlock]` stub with 7 `eventHandlers` for SettlementManager datasource (addresses match ISettlementManager.sol event signatures); added FFM v2 TODO comment. Grep gate: `grep -c "handle..." = 7` passes.

## Task Commits

Each task was committed atomically:

1. **Task 1: DeployPhase4.s.sol + SettlementManager.json ABI + OPS runbooks** - `b1848f1` (feat)
2. **Task 2: addresses.ts + subgraph.yaml placeholders** - `69ba257` (feat)

## Files Created/Modified

- `packages/contracts/script/DeployPhase4.s.sol` -- deploy script: FFM v2 + SM + 4x wire + auth + 0.1 ETH + assertions
- `packages/subgraph/abis/SettlementManager.json` -- full ABI from forge inspect (all events/functions/errors)
- `docs/runbooks/OPS-15-settlement-stuck.md` -- OPS-15: ETH balance, Pyth retry, forceSettle 7d cooldown, SETTLE-35
- `docs/runbooks/OPS-16-stylus-reactivation.md` -- OPS-16: cargo stylus activate, 48h cutoff command
- `packages/shared/src/constants/addresses.ts` -- SETTLEMENT_MANAGER constants + AddressRecord
- `packages/subgraph/subgraph.yaml` -- SettlementManager 7 eventHandlers (blockHandler stub removed)

## Decisions Made

1. **Concrete contract imports in DeployPhase4.s.sol** -- `ICallRegistry` and `IProfileRegistry` interfaces do not expose `settlementManager()` or `authorizedRepWriters()` public state variable getters. Added concrete `CallRegistry` and `ProfileRegistry` imports for the post-deploy assertion block. The tx broadcast path still uses interfaces; only the read-only assertions use concrete types.
2. **EMPTY_ADDRESSES removed from addresses.ts** -- Was previously assigned to `SETTLEMENT_MANAGER_ADDRESSES` as a placeholder. Replaced with named constants; `EMPTY_ADDRESSES` became unused (TypeScript `noUnusedLocals` would break the build). Removed.
3. **subgraph.yaml 7 eventHandlers replace blockHandler stub** -- Phase 0 `handleBlock` stub in settlement-manager.ts is now an orphaned export (subgraph.yaml no longer references it). Plan 04-05 writes the real handler bodies. The graph-cli `build` will fail until 04-05 because the AS exports referenced in subgraph.yaml don't exist yet in settlement-manager.ts -- this is intentional and expected per plan dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ICallRegistry/IProfileRegistry missing public state variable view functions**
- **Found during:** Task 1 (forge build)
- **Issue:** `ICallRegistry(CALL_REGISTRY).settlementManager()` fails -- `settlementManager` is a public state variable on CallRegistry.sol but not declared in ICallRegistry.sol interface. Same for `IProfileRegistry.authorizedRepWriters()`.
- **Fix:** Added concrete `CallRegistry` and `ProfileRegistry` imports to DeployPhase4.s.sol; used concrete contract types for the post-deploy assertion reads only. Tx broadcast path unchanged.
- **Files modified:** `packages/contracts/script/DeployPhase4.s.sol`
- **Verification:** forge build exits 0 (Compiler run successful with warnings only)
- **Committed in:** `b1848f1`

---

**Total deviations:** 1 auto-fixed (Rule 1 -- interface missing public state variable view functions)
**Impact on plan:** Additive only. Post-deploy assertions now use concrete contract types for view calls while the deployment path continues to use interfaces.

## Checkpoint Status

**STOPPED at on-chain deploy checkpoint (Task 2 complete; deploy not yet run)**

Both autonomous tasks are complete. The plan has reached the human-action checkpoint: the operator must run `forge script DeployPhase4.s.sol` to deploy FFM v2 + SettlementManager on Arbitrum Sepolia. After deploy, addresses.ts and subgraph.yaml must be updated with the real deployed addresses.

Awaiting:
- New `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` address (FFM v2)
- New `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` address
- Deploy block number (for `subgraph.yaml` startBlock fields)

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = '0x0000...0000'` | `packages/shared/src/constants/addresses.ts` | ~170 | Pre-deploy placeholder. Update to real address after operator runs DeployPhase4.s.sol. |
| `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` stays at old v1 address | `packages/shared/src/constants/addresses.ts` | ~119 | Old address retained until FFM v2 deploy confirms new address. Update post-deploy. |
| `address: "0x0000...0000"` SettlementManager | `packages/subgraph/subgraph.yaml` | ~179 | Pre-deploy placeholder. Update to SM address + startBlock after deploy. |
| `startBlock: 0` SettlementManager | `packages/subgraph/subgraph.yaml` | ~181 | Pre-deploy placeholder. Update to deploy block number. |
| `address: "0x12aafa..."` FollowFadeMarket | `packages/subgraph/subgraph.yaml` | ~108 | Old v1 address. Update to FFM v2 address + new startBlock post-deploy. |

## Threat Surface Scan

All new files are scripts and docs -- no new network endpoints or auth paths introduced.

| Flag | File | Description |
|------|------|-------------|
| threat_flag: deploy-script-eth-transfer | `packages/contracts/script/DeployPhase4.s.sol` | 0.1 ETH transferred to SM at deploy (step 5). Deployer key must have ETH balance >= 0.1 ETH + gas. Mitigated by post-deploy assertion (SM balance >= 0.1 ETH). |

## Self-Check: PASSED

- [x] `packages/contracts/script/DeployPhase4.s.sol` exists
- [x] `packages/subgraph/abis/SettlementManager.json` exists and is valid JSON with CallSettled event
- [x] `docs/runbooks/OPS-15-settlement-stuck.md` exists with forceSettle cooldown and dispute reversal note (SETTLE-35)
- [x] `docs/runbooks/OPS-16-stylus-reactivation.md` exists with 48h cutoff command (upgrade(address,address))
- [x] `grep -c "setSettlementManager" packages/contracts/script/DeployPhase4.s.sol` = 15 (>= 4 calls present)
- [x] `grep "0.1 ether" packages/contracts/script/DeployPhase4.s.sol` -- PASS
- [x] `grep "REQUIRED NEXT STEPS" packages/contracts/script/DeployPhase4.s.sol` -- PASS
- [x] `grep "pragma solidity =0.8.30" packages/contracts/script/DeployPhase4.s.sol` -- PASS
- [x] `grep "0xaf88" packages/contracts/script/DeployPhase4.s.sol` -- 0 (no inline USDC)
- [x] `forge build --root packages/contracts` exits 0 -- PASS (Compiler run successful with warnings only)
- [x] `grep "SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA" packages/shared/src/constants/addresses.ts` -- PASS
- [x] `grep "SETTLEMENT_MANAGER_ADDRESSES" packages/shared/src/constants/addresses.ts` -- PASS
- [x] `pnpm --filter @call-it/shared build` exits 0 -- PASS
- [x] `grep -c "handleCallSettled|handleDisputeRaised|..." packages/subgraph/subgraph.yaml` = 7 -- PASS (7-handler grep gate)
- [x] `grep "SettlementManager" packages/subgraph/subgraph.yaml` -- datasource present -- PASS
- [x] `grep "Settlement\|Dispute\|RepEvent\|CategoryRep\|LeaderboardEntry" packages/subgraph/subgraph.yaml` -- entities list present -- PASS
- [x] `blockHandlers` removed from SettlementManager datasource in subgraph.yaml -- PASS
- [x] Commits `b1848f1` and `69ba257` exist in git log -- PASS
