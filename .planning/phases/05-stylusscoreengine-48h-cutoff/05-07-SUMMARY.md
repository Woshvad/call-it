---
phase: 05-stylusscoreengine-48h-cutoff
plan: 07
subsystem: contracts
tags: [stylus, proxy, upgrade, cutoff, arbitrum-sepolia, ops-16, audit, live]

# Dependency graph
requires:
  - phase: 05-stylusscoreengine-48h-cutoff
    provides: live deployed stack + filled CutoffFallback.s.sol (05-06)

provides:
  - Proven 48h-cutoff round-trip on Sepolia (Stylus -> SolidityScoreEngine -> Stylus)
  - On-chain D-4 proof (same inputs: Stylus engine = 7, Solidity baseline = 10)
  - Phase 5 success-criteria audit (SC1-SC4) with live evidence
  - Confirmation OPS-16 cutoff is a single mechanical command (forge script CutoffFallback.s.sol)

affects: [phase-06-safety-drill, ops-procedures, phase-07.5-mainnet]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Proxy upgrade round-trip rehearsal: forge script CutoffFallback.s.sol (Stylus->Solidity) then cast send upgradeAndCall (Solidity->Stylus), each verified via ERC-1967 impl slot read"

key-files:
  created: []
  modified: []

key-decisions:
  - "Cutoff executed via the real CutoffFallback.s.sol deliverable (not ad-hoc cast) to prove the 'one command' OPS-16 claim end-to-end."
  - "Re-upgrade back to Stylus via cast send upgradeAndCall (per plan), restoring the production impl as the end state."
  - "Live Telegram demo-cutoff alert deferred (Option B): logic proven by vitest Test 5 (05-05); relayer app is pending-deploy on Sepolia."

patterns-established:
  - "48h-cutoff is mechanical: one forge-script command upgrades proxy to the Solidity fallback; reversible via upgradeAndCall."

requirements-completed: [REP-24]

# Metrics
duration: live-operator-session
completed: 2026-06-02
---

# Phase 05 Plan 07: 48h Cutoff Round-Trip Rehearsal + Success-Criteria Audit

**The 48h cutoff is proven mechanical on Arbitrum Sepolia: one `forge script CutoffFallback.s.sol --broadcast` upgrades the proxy from the Stylus WASM engine to the SolidityScoreEngine fallback, and a single `upgradeAndCall` reverses it. The D-4 fidelity divergence is confirmed on-chain (Stylus = 7, Solidity baseline = 10 for the same inputs).**

## Cutoff Round-Trip (Arbitrum Sepolia, 2026-06-02)

| Step | Action | Verification | Result |
|---|---|---|---|
| 1 | Pre-cutoff (Stylus live) | `compute_rep_change(0,50,0,true,10)` | **7** ✅ |
| 2 | Cutoff: `forge script CutoffFallback.s.sol --broadcast` | "[OK] Proxy upgraded to SolidityScoreEngine" | success ✅ |
| 3 | impl slot after cutoff | ERC-1967 slot read | == SolidityScoreEngine ✅ |
| 4 | Post-cutoff (Solidity baseline) | `compute_rep_change(0,50,80,true,10)` | **10** (ignores consensusPct) ✅ |
| 4b | D-4 proof | `compute_rep_change(0,50,0,true,10)` | **10** (vs Stylus 7) ✅ |
| 5 | Re-upgrade: `cast send upgradeAndCall(proxy, stylusImpl, 0x)` | status 1, `Upgraded` event | success ✅ |
| 6 | impl slot after re-upgrade | ERC-1967 slot read | == Stylus impl ✅ |
| 7 | Post-re-upgrade (Stylus restored) | `compute_rep_change(0,50,0,true,10)` | **7** ✅ |

End state: proxy points at the Stylus WASM impl (production). `Upgraded` events emitted on every hop (loud audit trail, T-05-07-01).

## Phase 5 Success-Criteria Audit (ROADMAP)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| SC1 | StylusScoreEngine compiles + deploys behind TransparentUpgradeableProxy, admin = deployer | ✅ GREEN | proxy `0xe7e159...`; `ProxyAdmin.owner()` == deployer `0xDa8c...` |
| SC2 | `compute_rep_change` callable from SM seam; RepCalculated path (not fallback) | ✅ GREEN | proxy->WASM delegatecall returns 7/68/-36; `SM.stylusScoreEngine()` == proxy |
| SC3 | RevertingStylusEngine deployed, ready for Phase 6 drill | ✅ GREEN | `0x8492fa...` reverts "RevertingStylusEngine: intentional revert" |
| SC4 | 48h cutoff round-trip tested on Sepolia; calendar reminders | ✅ GREEN (cutoff) / ⚠️ DEFERRED (calendar) | round-trip table above; calendar repoint deferred (see below) |

Requirements REP-19, REP-20, REP-21, REP-24 all exercised: REP-19/20 (full-fidelity engine live, exact D-2 values on-chain), REP-21 (proxy upgrade path proven), REP-24 (Solidity baseline parity == `_solidityBaselineRepDelta`, +10 for conviction=50 winner).

## D-4 Proof (intentional fidelity divergence, confirmed live)

For identical inputs `(currentRep=0, conviction=50, consensusPct=0, isWinner=true, baseValue=10)`:
- **Stylus full-fidelity engine** -> **+7** (contrarian multiplier 700milli at consensusPct=0: 10 x 700 / 1000)
- **SolidityScoreEngine baseline** -> **+10** (linear (10x50x2)/100; ignores consensusPct)

This is the designed difference (D-4): the cutoff trades fidelity for safety, not correctness-equivalence. Verified by toggling the proxy implementation and re-reading the same call.

## Acknowledged Deferrals

1. **Live Telegram demo-cutoff alert** (Option B, per plan) — the alert logic is proven by vitest Test 5 (05-05): `demoCutoffTimestamp` -> `sendAlert('stylus_demo_cutoff', {threshold:24})` with the distinct `stylus:demo-cutoff:` Redis key. Live firing belongs to the Phase 6 Sepolia soak once `call-it-relayer-sepolia` is deployed (currently pending). `STYLUS_SCORE_ENGINE_ADDRESS` is already staged as a fly secret.
2. **Calendar reminder repoint** — requires Google Calendar OAuth + seeded events (not configured). The deactivation watcher is the documented independent second belt. (Detailed in 05-06-SUMMARY.md.)

Both mirror Phase 4's acknowledged-deferred live-UAT pattern.

## Threat Surface Scan

- Every upgrade emits `Upgraded` (audit trail). ProxyAdmin is single-key (deployer) in Phase 5; Phase 6 promotes to multisig (SAFETY-20) to block unilateral upgrades.
- Cutoff verification reads the ERC-1967 impl slot directly (OZ v5 removed `getProxyImplementation`), so the post-upgrade assertion cannot be spoofed by a stale helper.

## Phase Outcome

Phase 5 is functionally complete and **live on Arbitrum Sepolia**: the Stylus reputation engine is deployed, activated, wired into SettlementManager, callable through the production proxy path, and the 48h cutoff is rehearsed and reversible. Remaining items are operational soak (live alert + calendar), deferred with documented coverage.

---
*Phase: 05-stylusscoreengine-48h-cutoff*
*Completed: 2026-06-02*
