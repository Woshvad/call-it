---
phase: 05-stylusscoreengine-48h-cutoff
plan: 04
subsystem: contracts-deploy
tags: [forge-script, transparent-proxy, proxy-admin, solidity-score-engine, cutoff-fallback, addresses]

# Dependency graph

requires:
  - phase: 05-stylusscoreengine-48h-cutoff
    plan: 02
    provides: SolidityScoreEngine.sol contract
  - phase: 05-stylusscoreengine-48h-cutoff
    plan: 03
    provides: RevertingStylusEngine.sol contract
  - phase: 04-settlementmanager
    provides: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = 0xAc37a0e4A3e575EF21684c28a5b820dB44654595

provides:
  - packages/contracts/script/DeployPhase5Stylus.s.sol — operator deploy script (4 contracts + SM wiring + NEXT STEPS)
  - packages/contracts/script/CutoffFallback.s.sol — OPS-16 upgrade script (one command cutoff)
  - packages/shared/src/constants/addresses.ts Phase 5 stub entries (4 constants, FILL AFTER DEPLOY)

affects: [phase-05-plan-06-operator-deploy, phase-06-multisig]

# Tech tracking

tech-stack:
  added:
    - TransparentUpgradeableProxy (OZ 5.6.1) -- deploy pattern for StylusScoreEngine proxy
    - ProxyAdmin (OZ 5.6.1) -- owner-controlled upgrade authority
    - EIP-1967 slot read (vm.load) -- post-upgrade verification replacing removed OZ v5 getProxyImplementation()
  patterns:
    - "Deploy script: vm.envUint(DEPLOYER_PRIVATE_KEY) + vm.envAddress(STYLUS_IMPL_ADDRESS); never hardcode"
    - "Post-deploy assertions after vm.stopBroadcast() -- view calls, cost no gas"
    - "OZ v5 ProxyAdmin: upgradeAndCall(ITransparentUpgradeableProxy, address, bytes) is onlyOwner payable"
    - "EIP-1967 slot 0x360894...382bbc = keccak256('eip1967.proxy.implementation') - 1 for impl verification"
    - "SettlementManager has payable receive() -- must cast via payable() for Solidity type conversion"

key-files:
  created:
    - packages/contracts/script/DeployPhase5Stylus.s.sol
    - packages/contracts/script/CutoffFallback.s.sol
  modified:
    - packages/shared/src/constants/addresses.ts

key-decisions:
  - "setStylusScoreEngine not in ISettlementManager interface -- imported concrete SettlementManager and cast with payable() (SM has payable receive())"
  - "OZ v5 removed ProxyAdmin.getProxyImplementation() -- CutoffFallback uses vm.load(IMPL_SLOT) to read EIP-1967 slot directly for post-upgrade assertion"
  - "DeployPhase5Stylus imports concrete SettlementManager (not interface) to call setStylusScoreEngine + read stylusScoreEngine() view -- plan pattern used ISettlementManager but that interface does not expose these functions"

requirements-completed: [REP-21, REP-24]

# Metrics

duration: 4min
completed: 2026-06-02
---

# Phase 5 Plan 04: Deploy Scripts + Address Stubs Summary

**Two forge deploy scripts (DeployPhase5Stylus.s.sol + CutoffFallback.s.sol) and 4 Phase 5 address stub constants, all compiling under forge build (0 errors), enabling Plan 06 operator to broadcast with one command**

## Accomplishments

### Task 1: DeployPhase5Stylus.s.sol + CutoffFallback.s.sol

**DeployPhase5Stylus.s.sol:**
- Deploys SolidityScoreEngine (48h cutoff fallback), RevertingStylusEngine (Phase 6 drill fixture), ProxyAdmin (initialOwner=deployer), and TransparentUpgradeableProxy (impl=STYLUS_IMPL_ADDRESS from env)
- Wires: `SettlementManager(payable(SETTLEMENT_MANAGER)).setStylusScoreEngine(address(proxy))`
- Post-deploy assertions after `vm.stopBroadcast()`: SM.stylusScoreEngine() == proxy, ProxyAdmin.owner() == deployer
- REQUIRED NEXT STEPS block: addresses.ts update, `fly secrets set STYLUS_SCORE_ENGINE_ADDRESS`, `repoint-calendar.ts`, CutoffFallback rehearsal
- OPERATOR VERIFICATION block: 3 cast commands
- Phase 4 address constants from STATE.md: SETTLEMENT_MANAGER = 0xAc37a0e4A3e575EF21684c28a5b820dB44654595

**CutoffFallback.s.sol:**
- OPS-16 runbook: `ProxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(payable(PROXY_ADDR)), SOLIDITY_BASELINE_ADDR, "")`
- Post-upgrade verification via EIP-1967 implementation slot read (`vm.load(PROXY_ADDR, IMPL_SLOT)`)
- 3 FILL AFTER DEPLOY address constants (PROXY_ADMIN_ADDR, PROXY_ADDR, SOLIDITY_BASELINE_ADDR)
- Includes cast one-liner equivalent in header comment for ops who prefer CLI
- Both scripts: pragma =0.8.30, SPDX MIT, forge build 0 errors

### Task 2: addresses.ts Phase 5 stub entries

Added 4 new exported constants (additions only, no existing entries modified):
- `STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA` — main entry point for SM
- `PROXY_ADMIN_ARBITRUM_SEPOLIA` — upgrade authority (Phase 6 promotes to multisig)
- `SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA` — 48h cutoff fallback contract
- `REVERTING_STYLUS_ENGINE_ARBITRUM_SEPOLIA` — Phase 6 SAFETY-42 drill fixture

Each constant: `'0x0000000000000000000000000000000000000000' as const; // FILL AFTER DEPLOY (Phase 5 Plan 06)` with JSDoc covering architecture, post-deploy verification cast commands, and threat reference. TypeScript build exits 0.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | DeployPhase5Stylus.s.sol + CutoffFallback.s.sol | 082acf9 | packages/contracts/script/DeployPhase5Stylus.s.sol, packages/contracts/script/CutoffFallback.s.sol |
| 2 | addresses.ts Phase 5 stub entries | ca919d4 | packages/shared/src/constants/addresses.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] setStylusScoreEngine not exposed by ISettlementManager interface**

- **Found during:** Task 1 (creating DeployPhase5Stylus.s.sol)
- **Issue:** The plan specified `import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol"` and `ISettlementManager(SETTLEMENT_MANAGER).setStylusScoreEngine(...)`. However, `setStylusScoreEngine` and `stylusScoreEngine()` are on the concrete `SettlementManager` only — not in the locked `ISettlementManager` interface (confirmed by grep). Using the interface would fail compilation.
- **Fix:** Imported concrete `SettlementManager` instead. Also required `payable()` cast since `SettlementManager` has a `receive()` payable fallback function. The plan's PATTERNS.md uses the correct function name and call pattern.
- **Files modified:** `packages/contracts/script/DeployPhase5Stylus.s.sol`
- **Commit:** 082acf9

**2. [Rule 1 - Bug] OZ v5 ProxyAdmin removed getProxyImplementation() — environment note**

- **Found during:** Task 1 (creating CutoffFallback.s.sol)
- **Issue:** The plan's CutoffFallback pseudo-code calls `ProxyAdmin(PROXY_ADMIN_ADDR).getProxyImplementation(payable(PROXY_ADDR))` for post-upgrade verification. OZ Contracts 5.6.1 removed this helper. Using it would fail compilation.
- **Fix:** Per the explicit environment note, replaced with EIP-1967 slot read: `bytes32 implSlotValue = vm.load(PROXY_ADDR, IMPL_SLOT); address impl = address(uint160(uint256(implSlotValue)));` where `IMPL_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`.
- **Files modified:** `packages/contracts/script/CutoffFallback.s.sol`
- **Commit:** 082acf9

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| PROXY_ADMIN_ADDR = address(0) | CutoffFallback.s.sol | ~43 | Filled from Plan 06 deployment output after operator broadcast |
| PROXY_ADDR = address(0) | CutoffFallback.s.sol | ~44 | Filled from Plan 06 deployment output after operator broadcast |
| SOLIDITY_BASELINE_ADDR = address(0) | CutoffFallback.s.sol | ~45 | Filled from Plan 06 deployment output after operator broadcast |
| STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA = 0x000... | addresses.ts | ~309 | Filled after Plan 06 operator deploy |
| PROXY_ADMIN_ARBITRUM_SEPOLIA = 0x000... | addresses.ts | ~337 | Filled after Plan 06 operator deploy |
| SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA = 0x000... | addresses.ts | ~353 | Filled after Plan 06 operator deploy |
| REVERTING_STYLUS_ENGINE_ARBITRUM_SEPOLIA = 0x000... | addresses.ts | ~371 | Filled after Plan 06 operator deploy |

These stubs are intentional per plan spec — all 7 carry `FILL AFTER DEPLOY (Phase 5 Plan 06)` comments so the operator cannot miss them.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced in this plan (deploy scripts and address stubs are offline artifacts — no runtime surface). Threat register from plan fully mitigated:

| Threat ID | Mitigation Status |
|-----------|-------------------|
| T-05-04-01 | Mitigated — setStylusScoreEngine under vm.startBroadcast(deployerKey); require() gate on stylusScoreEngine() post-deploy |
| T-05-04-02 | Mitigated — SETTLEMENT_MANAGER hardcoded from STATE.md + post-deploy require() assertion verifies SM.stylusScoreEngine() == proxy |
| T-05-04-03 | Mitigated — 3 FILL AFTER DEPLOY constants clearly named; EIP-1967 slot read verifies upgrade post-completion |
| T-05-04-04 | Mitigated — console.log "REQUIRED NEXT STEPS:" block present in DeployPhase5Stylus.s.sol run() (verified by grep) |

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-02T06:58:13Z
- **Completed:** 2026-06-02T07:02:13Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Self-Check: PASSED

- [x] `packages/contracts/script/DeployPhase5Stylus.s.sol` exists on disk
- [x] `packages/contracts/script/CutoffFallback.s.sol` exists on disk
- [x] `packages/shared/src/constants/addresses.ts` modified (4 new constants)
- [x] Commits `082acf9` and `ca919d4` exist in git log
- [x] `forge build 2>&1 | grep -c "Error"` returns 0
- [x] `grep -c "setStylusScoreEngine" script/DeployPhase5Stylus.s.sol` returns 3 (>= 1)
- [x] `grep -c "REQUIRED NEXT STEPS" script/DeployPhase5Stylus.s.sol` returns 1
- [x] `grep -c "repoint-calendar" script/DeployPhase5Stylus.s.sol` returns 2 (>= 1)
- [x] `grep -c "upgradeAndCall" script/CutoffFallback.s.sol` returns 3 (>= 1)
- [x] `grep -c "FILL AFTER DEPLOY" script/CutoffFallback.s.sol` returns 3
- [x] `grep -c "pragma solidity =0.8.30" script/DeployPhase5Stylus.s.sol` returns 1
- [x] `grep -c "pragma solidity =0.8.30" script/CutoffFallback.s.sol` returns 1
- [x] `grep -c "STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA" packages/shared/src/constants/addresses.ts` returns 1
- [x] `grep -c "as const; // FILL AFTER DEPLOY (Phase 5" packages/shared/src/constants/addresses.ts` returns 4
- [x] `pnpm --filter @call-it/shared build` exits 0
- [x] No deletions from existing Phase 2/3/4 entries in addresses.ts (git diff shows additions only)
