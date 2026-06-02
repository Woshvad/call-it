---
phase: 5
slug: stylusscoreengine-48h-cutoff
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` → "## Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Rust)** | Motsu (OZ Stylus test framework, git `github.com/OpenZeppelin/motsu`) + plain `cargo test` for pure-math module |
| **Framework (Solidity)** | Foundry `forge` (existing project suite) |
| **Framework (cross-VM)** | Sepolia integration via `cast` (arbos-foundry optional) |
| **Config file** | `packages/contracts/stylus/Cargo.toml` (dev-dep: motsu) · `packages/contracts/foundry.toml` |
| **Quick run command** | `cd packages/contracts/stylus && cargo test` |
| **Full suite command** | `cd packages/contracts && forge test -vv && cd stylus && cargo test` |
| **Selector gate** | `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` → must equal `0xff540eb6` |
| **Estimated runtime** | ~30–90 seconds (unit + parity); Sepolia integration out-of-band |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/contracts/stylus && cargo test` (Rust unit) + `forge test --match-contract SolidityScoreEngineTest` (parity)
- **After every plan wave:** Run full suite + selector gate (`cargo stylus export-abi | grep compute_rep_change`)
- **Before `/gsd-verify-work`:** Full suite green AND all Sepolia integration checks green (proxy wiring, RepCalculated fires, fallback round-trip)
- **Max feedback latency:** ~90 seconds (local); Sepolia integration is gated, not per-commit

---

## Per-Task Verification Map

> Task IDs assigned by the planner; rows below are the requirement→test contract the planner must satisfy. `W0` = Wave-0 test scaffold must create the file.

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| REP-19 | `compute_rep_change(uint128,uint8,uint8,bool,uint256) → i32` callable cross-VM from SettlementManager | Sepolia integration | `cast call $PROXY_ADDR "compute_rep_change(uint128,uint8,uint8,bool,uint256)" 100 50 50 true 10` | ❌ W0 | ⬜ pending |
| REP-19 | 4-byte selector matches `0xff540eb6` (NOT default camelCase `0xfe7606ba`) | CI selector gate | `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` | ❌ W0 | ⬜ pending |
| REP-19 | Exported ABI matches `IStylusScoreEngine` (`#[selector(name=...)]` applied) | cargo check | `cargo stylus export-abi \| grep "compute_rep_change"` | ❌ W0 | ⬜ pending |
| REP-20 | confidence multiplier: 1.0× @ conviction 50, 2.0× @ 100, floor 1 | Rust unit | `cargo test test_confidence_multiplier` | ❌ W0 | ⬜ pending |
| REP-20 | contrarian multiplier winners-only (0.7×→2.0× over consensusPct 0→85); no contrarian on losses | Rust unit | `cargo test test_contrarian_not_applied_to_losses` | ❌ W0 | ⬜ pending |
| REP-20 | high-conviction 2× at conviction ≥ 85 (gains AND losses) | Rust unit | `cargo test test_high_conviction_threshold` | ❌ W0 | ⬜ pending |
| REP-20 | floor-at-0 NOT in engine (raw delta returned; `applyRepDelta` clamps) | Rust unit | `cargo test test_engine_returns_raw_negative_delta` | ❌ W0 | ⬜ pending |
| REP-20 | checked integer arithmetic (no overflow in multiplier chain) | Rust unit | `cargo test test_no_overflow_extremes` | ❌ W0 | ⬜ pending |
| REP-21 | proxy + impl deployed; admin = deployer key | Sepolia integration | `cast call $PROXY_ADMIN "owner()(address)"` returns deployer | ❌ W0 | ⬜ pending |
| REP-21 | upgrade path (pause → upgrade → unpause) changes implementation | Sepolia integration | upgrade round-trip → `implementation()` reflects new addr | ❌ W0 | ⬜ pending |
| REP-24 | `SolidityScoreEngine.compute_rep_change` == `_solidityBaselineRepDelta` (byte-for-byte) | Solidity unit | `forge test --match-test test_solidity_baseline_parity -vv` | ❌ W0 | ⬜ pending |
| REP-24 | 48h cutoff `upgrade(...)` to `$SOLIDITY_BASELINE_ADDR` succeeds on Sepolia | Sepolia integration | `cast send $PROXY_ADMIN "upgrade(address,address)" $PROXY $SOLIDITY_BASELINE` | ❌ W0 | ⬜ pending |
| REP-24 (Pitfall 2 / SAFETY-42 prep) | `RevertingStylusEngine` causes `RepCalculatedFallback` to fire | Sepolia integration | deploy reverting engine to proxy slot → trigger settle → assert event | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/contracts/stylus/src/math.rs` — pure scoring logic module (unit-testable without Stylus host)
- [ ] `packages/contracts/stylus/tests/test_math.rs` — Motsu/`cargo test` unit tests (confidence, contrarian, high-conviction, floor, overflow, parity)
- [ ] `packages/contracts/test/SolidityScoreEngine.t.sol` — Solidity parity tests vs `_solidityBaselineRepDelta`
- [ ] Selector CI gate (`cast sig` + `cargo stylus export-abi`) wired into a CI workflow / Makefile target
- [ ] Sepolia integration checklist (proxy wiring, RepCalculated vs RepCalculatedFallback, cutoff round-trip) captured in the deploy plan

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `cargo stylus deploy`/`activate` to Sepolia + ~0.1 ETH activation | REP-19, REP-21 | Requires live Sepolia RPC + funded deployer key (env-blocked, like Phase 4 live UAT) | Run deploy script; record proxy + impl addrs; confirm `cargo stylus check` passes pre-deploy |
| 48h-cutoff command rehearsal under "demo pressure" | REP-24 | Operational rehearsal, not a unit test | Execute upgrade → verify `implementation()` → upgrade back; time the round-trip |
| Telegram cutoff alerts (72h/48h/24h) + reactivation alerts (T-30/15/7/1d) fire | Pitfall 17 | Depends on live relayer + Redis + Telegram bot + wired deploy date | Set `DEMO_CUTOFF_TIMESTAMP` / deploy date; observe synthetic alert |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s (local unit + parity)
- [ ] `nyquist_compliant: true` set in frontmatter (set by planner/auditor once map is complete)

**Approval:** pending
