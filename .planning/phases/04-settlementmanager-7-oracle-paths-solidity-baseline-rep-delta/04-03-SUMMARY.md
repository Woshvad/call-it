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
    authorizes SM as rep writer, funds ETH Pyth budget, post-deploy assertions + console REQUIRED NEXT STEPS
  - SettlementManager.json: full ABI (7 events, all functions, all errors) from forge inspect
  - addresses.ts: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA=0xAc37a0e4A3e575EF21684c28a5b820dB44654595,
    FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA=0x185e43526c0acd88AC236197e3Ee7629ebd601CA (v2), AddressRecord
  - subgraph.yaml: SettlementManager + FFM v2 datasources with real addresses + startBlocks; all 7 eventHandlers
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
duration: 9min + deploy + post-deploy wiring
completed: 2026-06-01
---

# Phase 4 Plan 03: Deploy Script + addresses.ts + subgraph.yaml + OPS Runbooks Summary

**DeployPhase4.s.sol deployed on Arbitrum Sepolia (FFM v2 0x185e…CA + SettlementManager 0xAc37…95, 12/12 on-chain assertions passed, 0.05 ETH Pyth budget); addresses.ts + subgraph.yaml wired to real deployed addresses; OPS-15/OPS-16 runbooks written. COMPLETE.**

## Performance

- **Duration:** 9 min (autonomous tasks) + operator deploy + post-deploy wiring
- **Started:** 2026-06-01T21:10:12Z
- **Completed:** 2026-06-01 (deploy + wiring complete)
- **Tasks:** 2 of 2 autonomous tasks complete + deploy checkpoint resolved
- **Files modified:** 6 (4 created, 2 modified) + 2 post-deploy updates (addresses.ts, subgraph.yaml)

## Accomplishments

- `DeployPhase4.s.sol`: deploys FFM v2 (same constructor as Phase 2 + new CR/PR args) + SettlementManager (7-param constructor), wires 4x `setSettlementManager` on CR/FFM/CE/PR, calls `setAuthorizedRepWriter(sm, true)`, sends 0.1 ETH to SM for Pyth VAA fees, post-deploy assertions (12 checks), DEPLOYMENT SUMMARY + REQUIRED NEXT STEPS console output. Compile: `forge build` exits 0.
- `packages/subgraph/abis/SettlementManager.json`: full ABI from `forge inspect SettlementManager abi --json` (constructor, receive, all public functions, all 7 events, all errors)
- `docs/runbooks/OPS-15-settlement-stuck.md`: ETH balance check + top-up command, Pyth confidence-wide flow, SettlementDelayed event check, relayer restart + re-enqueue via POST /api/settle/:callId, forceSettle 7-day cooldown gate (FORCE_SETTLE_COOLDOWN), dispute reversal SETTLE-35 note, incident log template
- `docs/runbooks/OPS-16-stylus-reactivation.md`: Phase 3 note (OPS-16 applies only after Phase 5 deploys Stylus), cargo stylus activate + cast send alternatives, 48h cutoff `cast send $STYLUS_PROXY_ADMIN "upgrade(address,address)" ...` command, T-30/15/7/1d calendar alert schedule, post-reactivation verification
- `packages/shared/src/constants/addresses.ts`: added `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` (now wired to `0xAc37a0e4A3e575EF21684c28a5b820dB44654595`), `SETTLEMENT_MANAGER_ARBITRUM_ONE`, updated `SETTLEMENT_MANAGER_ADDRESSES` AddressRecord to use named constants (removed `EMPTY_ADDRESSES`); `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` updated to v2 `0x185e43526c0acd88AC236197e3Ee7629ebd601CA`. `pnpm --filter @call-it/shared build` exits 0.
- `packages/subgraph/subgraph.yaml`: replaced Phase-0 `blockHandlers: [handleBlock]` stub with 7 `eventHandlers` for SettlementManager datasource; SettlementManager address=`0xAc37…95` startBlock=272912513; FFM datasource updated to v2 address=`0x185e…CA` startBlock=272912507. Grep gate: `grep -c "handle..." = 7` passes.

## Task Commits

Each task was committed atomically:

1. **Task 1: DeployPhase4.s.sol + SettlementManager.json ABI + OPS runbooks** - `b1848f1` (feat)
2. **Task 2: addresses.ts + subgraph.yaml placeholders** - `69ba257` (feat)
3. **Deploy: PYTH_ETH_BUDGET 0.1→0.05 deviation fix in DeployPhase4.s.sol** - `296a5ef` (fix, by orchestrator)
4. **Post-deploy wiring: FFM v2 + SM real addresses in addresses.ts + subgraph.yaml** - `48fd19c` (feat)

## Files Created/Modified

- `packages/contracts/script/DeployPhase4.s.sol` -- deploy script: FFM v2 + SM + 4x wire + auth + ETH + assertions (DEPLOYED)
- `packages/subgraph/abis/SettlementManager.json` -- full ABI from forge inspect (all events/functions/errors)
- `docs/runbooks/OPS-15-settlement-stuck.md` -- OPS-15: ETH balance, Pyth retry, forceSettle 7d cooldown, SETTLE-35
- `docs/runbooks/OPS-16-stylus-reactivation.md` -- OPS-16: cargo stylus activate, 48h cutoff command
- `packages/shared/src/constants/addresses.ts` -- FFM v2 + SM real deployed addresses; AddressRecord updated
- `packages/subgraph/subgraph.yaml` -- SettlementManager 7 eventHandlers; FFM v2 + SM real addresses + startBlocks

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

**2. [Operator deploy deviation] PYTH_ETH_BUDGET lowered 0.1 ETH → 0.05 ETH**
- **Found during:** On-chain deploy (operator broadcast)
- **Issue:** Deployer balance was 0.0887 ETH — insufficient to cover 0.1 ETH PYTH_ETH_BUDGET + gas in a single tx. Script would revert.
- **Fix:** Orchestrator lowered `PYTH_ETH_BUDGET` constant in `DeployPhase4.s.sol` from 0.1 ETH to 0.05 ETH. Deploy succeeded. SM funded with 0.05 ETH confirmed on-chain.
- **Files modified:** `packages/contracts/script/DeployPhase4.s.sol`
- **Committed in:** `296a5ef` (by orchestrator prior to this continuation)
- **Impact:** SM Pyth fee runway is halved for Sepolia staging. Top up via OPS-15 runbook if needed before extended settlement testing. The plan's threat model threat `T-04-03-02` (DoS via ETH balance low) covered by OPS-15 top-up procedure.

---

**Total deviations:** 2 (1 auto-fixed Rule 1; 1 operator-driven deploy deviation)
**Impact on plan:** Both deviations are additive/corrective only. Plan objectives achieved: contracts deployed, wired, verified 12/12 on-chain assertions.

## Checkpoint Status

**RESOLVED — deploy complete, addresses wired. Plan 04-03 COMPLETE.**

On-chain deploy broadcast succeeded (forge exit 0). All 12 post-deploy assertions passed. Post-deploy continuation agent wired real addresses into addresses.ts and subgraph.yaml.

Resolved with:
- `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` = `0x185e43526c0acd88AC236197e3Ee7629ebd601CA` (block 272912507)
- `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` = `0xAc37a0e4A3e575EF21684c28a5b820dB44654595` (block 272912513)
- SM funded: 0.05 ETH (PYTH_ETH_BUDGET deviation from planned 0.1 ETH — see Deviations #2)

## Known Stubs

None — all deploy-dependent placeholders resolved. The five stubs tracked at checkpoint (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA zero address, FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA v1 address, subgraph.yaml SM placeholder address/startBlock, FFM old v1 address) are all replaced with real deployed values.

Remaining `0x0000...0000` entries in addresses.ts are `ARBITRUM_ONE` mainnet constants correctly awaiting Phase 7.5 mainnet deploy — these are not stubs for this plan.

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
- [x] `grep "REQUIRED NEXT STEPS" packages/contracts/script/DeployPhase4.s.sol` -- PASS
- [x] `grep "pragma solidity =0.8.30" packages/contracts/script/DeployPhase4.s.sol` -- PASS
- [x] `grep "0xaf88" packages/contracts/script/DeployPhase4.s.sol` -- 0 (no inline USDC)
- [x] `forge build --root packages/contracts` exits 0 -- PASS (Compiler run successful with warnings only)
- [x] `grep "SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA" packages/shared/src/constants/addresses.ts` = `0xAc37a0e4A3e575EF21684c28a5b820dB44654595` -- PASS
- [x] `grep "FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA" packages/shared/src/constants/addresses.ts` = `0x185e43526c0acd88AC236197e3Ee7629ebd601CA` -- PASS
- [x] `grep "SETTLEMENT_MANAGER_ADDRESSES" packages/shared/src/constants/addresses.ts` -- PASS
- [x] `pnpm --filter @call-it/shared build` exits 0 -- PASS
- [x] No `0x0000...` remaining in addresses.ts for SM/FFM Sepolia constants -- PASS
- [x] `grep -c "handleCallSettled|handleDisputeRaised|..." packages/subgraph/subgraph.yaml` = 7 -- PASS (7-handler grep gate)
- [x] `grep "SettlementManager" packages/subgraph/subgraph.yaml` address = `0xAc37a0e4A3e575EF21684c28a5b820dB44654595`, startBlock = 272912513 -- PASS
- [x] FollowFadeMarket subgraph.yaml address = `0x185e43526c0acd88AC236197e3Ee7629ebd601CA`, startBlock = 272912507 -- PASS
- [x] No `0x0000...` or `startBlock: 0` remaining in subgraph.yaml -- PASS
- [x] `blockHandlers` removed from SettlementManager datasource in subgraph.yaml -- PASS
- [x] Commits `b1848f1`, `69ba257`, `296a5ef`, `48fd19c` exist in git log -- PASS
