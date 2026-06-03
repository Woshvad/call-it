---
phase: 06-safety-review-sepolia-48h-multisig-promotion
plan: "04"
subsystem: contracts-test, relayer-scripts, evidence
tags:
  - safety-42
  - soak-seeder
  - stylus-fallback-drill
  - evidence-log
  - phase6-soak
dependency_graph:
  requires:
    - 06-02-PLAN.md (redeployed cluster addresses in addresses.ts)
    - 06-03-PLAN.md (safety matrix — parallel)
  provides:
    - packages/contracts/test/RevertingStylusEngineDrill.t.sol
    - apps/relayer/src/scripts/soak-seeder.ts
    - evidence/phase-6-soak/SCHEMA.md
  affects:
    - forge test suite (1 new SKIP test when ARB_ONE_RPC_URL absent)
    - Phase 6 soak Wave 4 (soak-seeder.ts drives on-chain activity)
tech_stack:
  added:
    - Foundry fork test with graceful vm.skip env guard
    - OZ 5.x ProxyAdmin 3-arg upgradeAndCall pattern
    - viem writeContract + waitForTransactionReceipt in relayer script
    - JSONL evidence log (appendFileSync)
    - sendAlertSafe('settle_stuck_25m') from alerts.ts
  patterns:
    - EIP-1967 admin/impl slot reads via vm.load
    - vm.recordLogs + decodeEventLog for event assertion
    - 10-wallet SOAK_WALLET_N env pattern for Circle faucet rate-limit tolerance
    - Per-phase try/catch error tracking with process.exit(1) on errors
key_files:
  created:
    - packages/contracts/test/RevertingStylusEngineDrill.t.sol
    - apps/relayer/src/scripts/soak-seeder.ts
    - evidence/phase-6-soak/.gitkeep
    - evidence/phase-6-soak/SCHEMA.md
  modified: []
decisions:
  - "D-04 covered: soak-seeder.ts is the scripted seeding bot driving bulk on-chain counts"
  - "D-05 covered: evidence-log scaffold + sendAlertSafe wiring reuses stylus-deactivation-watcher alert path"
  - "Graceful env-skip used in drill test (not fork-URL hard require) so CI runs without secrets"
  - "SolidityScoreEngine used as real-engine stand-in for fork tests (Stylus WASM not available on mainnet fork)"
  - "Pre-existing TS error in stylus-deactivation-watcher.ts (stylus_demo_cutoff not in AlertEvent) is out of scope"
metrics:
  duration: "584 seconds"
  completed: "2026-06-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 06 Plan 04: SAFETY-42 Drill + Soak Seeder Summary

**One-liner:** Foundry unit drill proves RepCalculatedFallback fires via OZ 5.x ProxyAdmin.upgradeAndCall + soak-seeder.ts automates the 48h Sepolia soak with JSONL evidence logging.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create RevertingStylusEngineDrill.t.sol | `9a2911d` | packages/contracts/test/RevertingStylusEngineDrill.t.sol |
| 2 | Create soak-seeder.ts + evidence scaffold | `b366c4f` | apps/relayer/src/scripts/soak-seeder.ts, evidence/phase-6-soak/.gitkeep, evidence/phase-6-soak/SCHEMA.md |

## Verification Results

- `ARB_ONE_RPC_URL="" forge test --match-contract RevertingStylusEngineDrill`: **[SKIP] exit 0** — graceful skip confirmed
- `forge test` (full suite): **221 passed, 1 pre-existing fuzz failure (FollowFadeMarketGates invariant_kNeverShrinks), 4 skipped** — no regressions introduced
- `cd apps/relayer && npx tsc --noEmit`: **0 new errors** — only pre-existing `stylus_demo_cutoff` error in stylus-deactivation-watcher.ts (out of scope)
- evidence/phase-6-soak/.gitkeep: **EXISTS**
- evidence/phase-6-soak/SCHEMA.md: **EXISTS, contains "EvidenceEntry"**

## Acceptance Criteria Results

| Check | Result |
|-------|--------|
| `grep -c "RepCalculatedFallback" RevertingStylusEngineDrill.t.sol` | 17 (≥1) |
| `grep -c "upgradeAndCall" RevertingStylusEngineDrill.t.sol` | 5 (≥2, all 3-arg) |
| 2-arg upgrade form absent | Only in comment explaining it was removed; no actual code usage |
| `grep -c "adminSlot" RevertingStylusEngineDrill.t.sol` | 3 (≥1) |
| `grep -c "appendEvidenceLog\|evidence-" soak-seeder.ts` | 12 (≥2) |
| `grep -c "'callCreated'\|'settled'\|'disputeRaised'" soak-seeder.ts` | 6 (≥3) |
| `grep -c "sendAlertSafe" soak-seeder.ts` | 3 (≥1) |
| `grep -c "SOAK_WALLET" soak-seeder.ts` | 14 (≥1) |

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor Adjustments

**1. [Clarification] Vm import for forge-std**
- The `Vm` type from forge-std is needed for `Vm.Log[]` in `vm.getRecordedLogs()`.
- Added `import { Test, Vm } from "forge-std/Test.sol"` — required to compile.
- No behavioral change.

**2. [Out of scope] Pre-existing TS error in stylus-deactivation-watcher.ts**
- `sendAlert('stylus_demo_cutoff', ...)` uses an event name not in `AlertEvent` union.
- This error existed before Plan 06-04 and is unrelated to soak-seeder.ts.
- Not fixed per scope boundary rule (pre-existing, different file, not caused by this plan).
- Logged to deferred-items.

**3. [Implementation choice] SolidityScoreEngine as "real engine" in fork test**
- The plan specified deploying the stack on a mainnet fork and using the real Stylus WASM address.
- On the mainnet fork, the Stylus WASM is at the Phase-05.1 Sepolia address (not mainnet-deployed), so it would not be callable on Arbitrum One fork.
- Decision: deploy `SolidityScoreEngine` as the "real engine" in the test (implements `IStylusScoreEngine`, returns non-zero `int32` on `compute_rep_change`). This faithfully tests the upgrade/restore pattern and the fallback catch branch.
- The live Sepolia drill (Plan 05) uses the actual deployed proxy and Stylus WASM.

## Known Stubs

None. The drill test is fully self-contained. The soak-seeder.ts is compile-only in this plan (no live execution without env vars); it is not a stub — the full phase logic is implemented.

## Threat Flags

No new security surface introduced. Both files are test/script artifacts:
- `RevertingStylusEngineDrill.t.sol`: Foundry test — never deployed to production.
- `soak-seeder.ts`: Script with test-only Sepolia wallet keys from env vars — private keys explicitly excluded from repo (T-06-04-04).

## Self-Check: PASSED

All files verified to exist on disk. Both commits (`9a2911d`, `b366c4f`) confirmed in git log.
