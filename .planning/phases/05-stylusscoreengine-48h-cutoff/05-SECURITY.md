---
phase: 05
slug: stylusscoreengine-48h-cutoff
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-02
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Scope: the Rust/Stylus reputation engine (`compute_rep_change`), its Solidity baseline + reverting fixtures, the TransparentUpgradeableProxy/ProxyAdmin upgrade path, the Phase 5 deploy scripts, and the relayer demo-cutoff watcher — all live on Arbitrum Sepolia (2026-06-02).

**Blast-radius note:** the reputation engine handles **no funds**. It is a pure view that returns an `int` rep delta consumed by `SettlementManager`. The only privileged surface introduced in Phase 5 is the **proxy upgrade authority** (who may swap the engine implementation). In Phase 5 that authority is a single deployer EOA; Phase 6 promotes it to multisig (SAFETY-20). A hostile upgrade could distort reputation scoring but cannot move USDC.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| SettlementManager → StylusScoreEngine proxy | `settle()` step 8 calls `compute_rep_change` through the proxy via a STATICCALL-compatible `&self` view; selector forced to `0xff540eb6`; a revert routes to `RepCalculatedFallback` (Solidity baseline) instead of `RepCalculated` | Rep inputs (currentRep, conviction, consensusPct, isWinner, baseValue) — non-sensitive integers |
| Proxy → implementation (WASM / Solidity) | `TransparentUpgradeableProxy` delegatecalls the active implementation; impl address held in the EIP-1967 slot | delegatecall execution context (no state in engine) |
| ProxyAdmin → proxy implementation slot | `upgradeAndCall` swaps the implementation; **single deployer key** in Phase 5, multisig in Phase 6 | Implementation address (privileged) |
| Deployer key → Sepolia RPC | `forge script` / `cargo stylus deploy` broadcast deploy, activation, and `setStylusScoreEngine`; env-only key | `DEPLOYER_PRIVATE_KEY` (highly sensitive — env-only, never committed/echoed) |
| Relayer watcher → Redis | `SET NX` with 86400s TTL; distinct key prefix per alert type prevents cross-alert collision | Alert-fired dedup keys |
| Relayer watcher → Telegram Bot API | `sendAlert()` emits demo-cutoff + reactivation alerts to the operator channel | Operational alert payloads |
| CI selector gate → build pipeline | `cast sig "compute_rep_change(...)"` must equal `0xff540eb6` before any build proceeds; blocks the camelCase fallback selector `0xfe7606ba` | ABI selector assertion |
| Rust unit tests → math.rs | host-target tests call pure-Rust `compute_rep_delta`; no EVM boundary | Trusted (test-only) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01-01 | Spoofing | `compute_rep_change` ABI selector | mitigate | CI selector gate asserts `cast sig == 0xff540eb6` before build; blocks silent `0xfe7606ba`. Verified live on-chain. | closed |
| T-05-01-02 | Tampering | D-2 worked-example test expectations | mitigate | Exact integers (68, 10, -6, -36, 7) hardcoded in locked tests; any math change forces a deliberate test edit. | closed |
| T-05-01-03 | Tampering | D-4 parity scope violation | mitigate | No Rust-vs-Solidity parity assertion in test file; `grep -c "Rust" == 0` enforced in acceptance criteria. | closed |
| T-05-02-01 | Spoofing | `#[public]` camelCase default selector | mitigate | `#[selector(name = "compute_rep_change")]` in lib.rs; grep verified; resolves to `0xff540eb6` on-chain. | closed |
| T-05-02-02 | Tampering | `&mut self` state mutability | mitigate | `&self` enforced (`grep -c '&mut self' == 0`); STATICCALL from SM try/catch would revert on nonpayable. | closed |
| T-05-02-03 | Tampering | Integer overflow in rep math | mitigate | `checked_mul`/`checked_div` throughout; `test_no_overflow_extremes` covers `u128::MAX`. | closed |
| T-05-02-04 | Tampering | Wrong D-2 math constants | mitigate | 9 locked unit tests with exact expected values; break on any constant change. | closed |
| T-05-03-01 | Tampering | SolidityScoreEngine math divergence from `_solidityBaselineRepDelta` | mitigate | 8 parity forge tests assert exact equality (REP-24); all pass. | closed |
| T-05-03-02 | Tampering | Floating pragma (`^0.8.x`) | mitigate | `pragma solidity =0.8.30` grep == 1 in both files; CI grep guard. | closed |
| T-05-03-03 | Tampering | RevertingStylusEngine accidentally succeeds | mitigate | Body is `revert()` only; `grep "scaled\|conviction\|delta" == 0`; `test_reverting_engine_reverts` passes; reverts live on-chain. | closed |
| T-05-03-04 | Elevation of Privilege | 48h-cutoff proxy upgrade to wrong contract | accept | Operator verifies target address (recorded in addresses.ts) before upgrade; Phase 6 → multisig (SAFETY-20). See AR-05-01. | closed |
| T-05-04-01 | Elevation of Privilege | `setStylusScoreEngine` owner-only gate | mitigate | `onlyOwner` in SettlementManager.sol:641; run under `vm.startBroadcast(deployerKey)`; post-deploy `require()` gate. | closed |
| T-05-04-02 | Spoofing | Wrong `SETTLEMENT_MANAGER` address in deploy script | mitigate | Address hardcoded from Phase 4 STATE.md; post-deploy `require(SM.stylusScoreEngine() == proxy)` reverts on mismatch. | closed |
| T-05-04-03 | Tampering | `CutoffFallback` `upgradeAndCall` to wrong address | mitigate | FILL-AFTER-DEPLOY constants + EIP-1967 impl-slot read assertion verify the upgrade target. | closed |
| T-05-04-04 | Denial of Service | Missing NEXT STEPS in deploy output | mitigate | `console.log "REQUIRED NEXT STEPS:"` block in `run()` (grep verified) surfaces relayer env var + calendar repoint. | closed |
| T-05-05-01 | Denial of Service | `demoCutoffTimestamp` not set after deploy | mitigate | OPS-16 NEXT STEPS instructs operator to set `DEMO_CUTOFF_TIMESTAMP`; watcher is a no-op if null. | closed |
| T-05-05-02 | Denial of Service | Redis key collision (reactivation vs demo-cutoff) | mitigate | Distinct prefixes: `stylus:alert-fired:T-${N}d:` vs `stylus:demo-cutoff:T-${h}h:`. | closed |
| T-05-05-03 | Spoofing | Demo alert fires with wrong threshold | mitigate | vitest Test 5 asserts exact `threshold=24` for 12h remaining; descending `[72,48,24]` break-on-first-match. | closed |
| T-05-06-01 | Spoofing | Selector mismatch discovered during live deploy | mitigate | Step 1 selector gate (`cast sig == 0xff540eb6`) runs before `cargo stylus deploy`. Confirmed live. | closed |
| T-05-06-02 | Elevation of Privilege | `DEPLOYER_PRIVATE_KEY` exposure | mitigate | Key env-only (`vm.envUint`), never committed/echoed, redacted from all output; OPS-15 mandates hardware wallet for mainnet (Phase 7.5). | closed |
| T-05-06-03 | Tampering | Wrong `SETTLEMENT_MANAGER` constant in deploy script | mitigate | Post-deploy `require(SM.stylusScoreEngine() == proxy)` + independent `cast call` verification. | closed |
| T-05-06-04 | Denial of Service | proxy→WASM delegatecall fails on Sepolia (MEDIUM-confidence per RESEARCH.md) | accept | If it fails, `RepCalculatedFallback` fires and the deployed SolidityScoreEngine serves. **Verified WORKING on-chain** — risk did not materialize. See AR-05-02. | closed |
| T-05-06-05 | Denial of Service | Stylus activation skipped before SM wiring | mitigate | Operator checklist sequences activation before `setStylusScoreEngine`; if skipped, catch branch fires (degraded, not broken). | closed |
| T-05-07-01 | Tampering | Upgrade replay / downgrade to old impl | mitigate | `Upgraded` event on every `upgradeAndCall` (loud audit trail); Phase 6 multisig blocks unilateral upgrades (SAFETY-20). | closed |
| T-05-07-02 | Tampering | Cutoff round-trip fails with wrong address | mitigate | `CutoffFallback.s.sol` `require()` asserts EIP-1967 impl slot == `SOLIDITY_BASELINE_ADDR` post-upgrade; reverts on mismatch. | closed |
| T-05-07-03 | Denial of Service | `RepCalculatedFallback` after cutoff reversal to WASM | accept | Solidity baseline stays active as safe fallback until root cause diagnosed; Phase 6 destruction drill exercises this. See AR-05-03. | closed |
| T-05-07-04 | Denial of Service | Live Telegram demo-cutoff alert not received | accept | Option B acknowledge-defer (vitest Test 5 proves logic); live wiring confirmed in Phase 6 48h soak. See AR-05-04. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-03-04 | 48h-cutoff upgrade could target the wrong contract. Mitigated operationally: target addresses are pinned in `packages/shared/src/constants/addresses.ts` and verified by `CutoffFallback.s.sol` `require()` before completion. Residual single-key risk is accepted for Phase 5 and removed in Phase 6 via multisig ProxyAdmin (SAFETY-20). | deployer (woshvad) | 2026-06-02 |
| AR-05-02 | T-05-06-04 | proxy→WASM delegatecall was MEDIUM-confidence pre-deploy. Accepted because failure degrades gracefully to the Solidity baseline (`RepCalculatedFallback`). **Outcome:** verified working on-chain — `compute_rep_change` returns exact D-2 values (7/68/-36) through the proxy; risk did not materialize. | deployer (woshvad) | 2026-06-02 |
| AR-05-03 | T-05-07-03 | If a post-cutoff reversal back to WASM fails, `RepCalculatedFallback` fires. Accepted because the Solidity baseline remains a correct (lower-fidelity) fallback until diagnosis; the Phase 6 destruction drill exercises this exact path. | deployer (woshvad) | 2026-06-02 |
| AR-05-04 | T-05-07-04 | Live Telegram demo-cutoff alert is deferred (Option B). Accepted because alert logic is proven by vitest Test 5 and `STYLUS_SCORE_ENGINE_ADDRESS` is staged as a fly secret on `call-it-relayer-sepolia` (pending-deploy); live firing is verified in the Phase 6 48h Sepolia soak. | deployer (woshvad) | 2026-06-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-02 | 27 | 27 | 0 | /gsd-secure-phase (Claude) — register authored at plan-time across all 7 PLANs; `threats_open:0 ∧ register_authored_at_plan_time:true` short-circuit; mitigations cross-referenced against 7 SUMMARY threat-surface scans, 05-VERIFICATION.md (status: passed), and on-chain evidence from the live Sepolia deploy. |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-02

---

## Carried Into Phase 6

The two structural residuals below are **accepted for Phase 5** and have explicit Phase 6 remediations — they are not open Phase 5 threats but are surfaced here so they are not lost:

1. **Single-key ProxyAdmin** (T-05-03-04, T-05-07-01) → promote to multisig (SAFETY-20).
2. **Reverting-engine destruction drill** (T-05-07-03) → Phase 6 SAFETY-42 uses the already-deployed `RevertingStylusEngine` (`0x8492faD7eF45a213E498daaA88986f97Fb22b6e1`) to prove the fallback path live.
