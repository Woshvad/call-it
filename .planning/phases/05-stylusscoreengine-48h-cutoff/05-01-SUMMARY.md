---
phase: 05-stylusscoreengine-48h-cutoff
plan: 01
subsystem: testing
tags: [rust, stylus, cargo, foundry, solidity, tdd, red-phase, reputation-engine]

# Dependency graph
requires:
  - phase: 04-settlementmanager
    provides: IStylusScoreEngine.sol locked interface + _solidityBaselineRepDelta (SM lines 731-748)
  - phase: 00-foundation
    provides: Cargo.toml stylus-sdk pin + wasm32-unknown-unknown toolchain
provides:
  - packages/contracts/stylus/src/math.rs — compute_rep_delta stub (todo!() RED body)
  - packages/contracts/stylus/tests/test_math.rs — 9 D-2 worked-example unit tests (all FAIL in RED)
  - packages/contracts/test/SolidityScoreEngine.t.sol — 8 Foundry parity tests (compile error RED)
  - .github/workflows/contracts-test.yml — selector CI gate 0xff540eb6 (T-05-01-01)
affects: [phase-05-02, phase-05-03, phase-06-safety-42-drill]

# Tech tracking
tech-stack:
  added: [cargo test (host target via target_arch=wasm32 no_std gate), export-abi feature flag]
  patterns:
    - "Math isolation pattern: pure-Rust compute_rep_delta in math.rs, no Stylus host calls, testable with plain #[test]"
    - "no_std gate: #![cfg_attr(target_arch = \"wasm32\", no_std)] rather than feature-flag (allows cargo test on host)"
    - "D-4 guard: SolidityScoreEngine.t.sol must never assert full-fidelity-engine == Solidity baseline (grep -c Rust == 0)"
    - "Selector CI gate: cast sig assertion in contracts-test.yml blocks 0xfe7606ba (camelCase default)"

key-files:
  created:
    - packages/contracts/stylus/src/math.rs
    - packages/contracts/stylus/tests/test_math.rs
    - packages/contracts/test/SolidityScoreEngine.t.sol
  modified:
    - packages/contracts/stylus/Cargo.toml
    - packages/contracts/stylus/src/lib.rs
    - .github/workflows/contracts-test.yml

key-decisions:
  - "no_std gate: target_arch=wasm32 not feature flag — cfg_attr(not(any(test, feature=export-abi)), no_std) pattern fails on host target for cdylib crates; target_arch gate allows cargo test to run on host"
  - "motsu 0.10.0 incompatible with stylus-sdk 0.10.7/alloy-primitives (arbitrary-1.4.2 derive feature conflict); tests use plain #[test] as planned — motsu not needed for RED phase"
  - "lib.rs retains Phase 0 stub_ping for wasm32 target; Stylus #[storage]/#[public] engine added in Plan 02 (GREEN)"
  - "SolidityScoreEngine.t.sol imports both SolidityScoreEngine and RevertingStylusEngine — both missing, both cause RED compile error (expected)"
  - "CI gate in contracts-test.yml (not contracts.yml which doesn't exist); selector gate added to foundry-test job before forge build step"

patterns-established:
  - "D-2 locked examples: exact int32 expected values hardcoded in test assertions (68, 10, -6, -36, 7)"
  - "REP-06 property test: assert_eq!(delta_low_consensus, delta_high_consensus) for losses"
  - "D-4 parity scope: only SolidityScoreEngine == _solidityBaselineRepDelta, never full-fidelity-engine == Solidity"

requirements-completed: [REP-19, REP-20, REP-24]

# Metrics
duration: 20min
completed: 2026-06-02
---

# Phase 05 Plan 01: StylusScoreEngine RED Scaffold Summary

**9 D-2 Rust unit tests all FAIL with todo!() + 8 Foundry parity tests in compile-error RED + selector CI gate 0xff540eb6 wired — full Wave 1 RED scaffold locked before GREEN implementation**

## Performance

- **Duration:** 20 min
- **Started:** 2026-06-02T05:54:48Z
- **Completed:** 2026-06-02T06:14:48Z
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `packages/contracts/stylus/src/math.rs`: `compute_rep_delta()` stub with `todo!()` body — all 9 D-2 tests FAIL with "not yet implemented" (confirmed RED)
- `packages/contracts/stylus/tests/test_math.rs`: 9 plain `#[test]` functions covering all D-2 worked examples + REP-06 + REP-07 properties + overflow safety check
- `packages/contracts/test/SolidityScoreEngine.t.sol`: 8 Foundry test functions (pragma =0.8.30, 0 "Rust" mentions, D-4 guard enforced) — compilation fails with "File not found" (expected RED)
- `.github/workflows/contracts-test.yml`: selector gate step added to `foundry-test` job; asserts `cast sig "compute_rep_change(...)" == 0xff540eb6` before forge build; blocks silent camelCase selector 0xfe7606ba

## Task Commits

1. **Task 1: Rust math.rs stub + test_math.rs with D-2 worked examples (RED)** — `ae34140` (test)
2. **Task 2: SolidityScoreEngine.t.sol parity test scaffold + selector CI gate** — `ad4ae64` (test)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `packages/contracts/stylus/src/math.rs` — `compute_rep_delta(u128, u8, u8, bool, u64) -> i32` with `todo!()` body; `_current_rep` prefixed with `_` to suppress unused warning (Phase 5 D-2: currentRep unused in computation)
- `packages/contracts/stylus/tests/test_math.rs` — 9 `#[test]` functions: 5 D-2 named examples + 4 property tests (contrarian on losses, high-conviction threshold, raw negative delta, overflow safety)
- `packages/contracts/test/SolidityScoreEngine.t.sol` — 8 Foundry tests: 5 REP-24 parity + interface compliance + consensusPct-ignored + reverting fixture
- `packages/contracts/stylus/Cargo.toml` — version bumped 0.0.1→0.1.0; `[features] export-abi` added; motsu commented with explanation
- `packages/contracts/stylus/src/lib.rs` — Phase 0 no_mangle stub retained; `pub mod math` exposed; `no_std` gate changed to `target_arch = "wasm32"`
- `.github/workflows/contracts-test.yml` — selector gate step in `foundry-test` job (T-05-01-01 mitigation)

## Decisions Made

1. **`no_std` gate changed from `cfg(not(any(test, feature="export-abi")))` to `cfg(target_arch = "wasm32")`** — the original Phase 0 cfg_attr pattern fails on the host target when the crate is `cdylib + lib` because `cargo test` builds the `lib` target with no panic handler. Using `target_arch = "wasm32"` correctly applies `no_std` only for the WASM deployment build and allows `cargo test` to work on x86_64 host.

2. **motsu 0.10.0 left commented in Cargo.toml** — `motsu 0.10.0` depends on `alloy-primitives 0.8.20` which pulls in `arbitrary 1.4.2` with a `derive` feature conflict against `stylus-sdk 0.10.7`'s own alloy-primitives dependency. Since all 9 tests use plain `#[test]` (plan-specified: "compute_rep_delta is pure Rust with no Stylus host calls"), motsu is not needed for the RED or GREEN phases. Added to Cargo.toml as a comment with version and explanation for when the ecosystem conflict resolves.

3. **CI file is `contracts-test.yml` not `contracts.yml`** — the plan references `contracts.yml` but the actual file is `.github/workflows/contracts-test.yml`. Selector gate added to the existing `foundry-test` job as a step before `forge build`.

4. **SolidityScoreEngine.t.sol has 8 test functions** — test_parity_conviction50_winner, test_parity_conviction100_winner, test_parity_conviction50_loser, test_parity_conviction1_floor, test_parity_conviction90_winner, test_interface_compliance, test_consensuspct_ignored_by_baseline, test_reverting_engine_reverts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] motsu git URL returns 404; switched to commented crates.io reference**

- **Found during:** Task 1 (Cargo.toml motsu dependency)
- **Issue:** `motsu = { git = "https://github.com/OpenZeppelin/motsu" }` returns 404 (repo moved to `github.com/OpenZeppelin/stylus-test-helpers`). Crates.io `motsu 0.10.0` has an `alloy-primitives` dependency conflict with `stylus-sdk 0.10.7`.
- **Fix:** Motsu left as commented dev-dependency with full explanation. Tests use plain `#[test]` as specified in the plan — motsu is not needed.
- **Files modified:** `packages/contracts/stylus/Cargo.toml`
- **Verification:** `cargo test` exits with 9 FAILED (todo!()) + 1 passed (lib_compiles) — RED state confirmed
- **Committed in:** `ae34140` (Task 1 commit)

**2. [Rule 3 - Blocking] `no_std` gate incompatible with `cargo test` on host target; changed to `target_arch = "wasm32"`**

- **Found during:** Task 1 (lib.rs compilation for `cargo test`)
- **Issue:** `#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]` + `cdylib + lib` crate types causes `cargo test` to fail with "panic_handler not found" / "unwinding panics not supported without std". The `cdylib` compilation doesn't have `test` cfg so no_std applies, requiring panic handler.
- **Fix:** Changed to `#![cfg_attr(target_arch = "wasm32", no_std)]` — applies only to WASM builds. Host target (x86_64) uses std normally, allowing `cargo test` to work. Added `[features] export-abi` to Cargo.toml for `cargo stylus export-abi`.
- **Files modified:** `packages/contracts/stylus/src/lib.rs`, `packages/contracts/stylus/Cargo.toml`
- **Verification:** `cargo test` passes with correct RED state (9 FAILED)
- **Committed in:** `ae34140` (Task 1 commit)

**3. [Rule 3 - Blocking] Em dash in Solidity string literal causes parse error; changed to `--`**

- **Found during:** Task 2 (forge test compilation)
- **Issue:** `"REP-24: floor test — conviction=1..."` contains Unicode em dash which Solidity 0.8.30 rejects with "Invalid character in string".
- **Fix:** Changed em dash to `--` in the string literal.
- **Files modified:** `packages/contracts/test/SolidityScoreEngine.t.sol`
- **Verification:** `forge test --match-contract SolidityScoreEngineTest` now fails with correct "File not found" error (RED state) not parse error
- **Committed in:** `ad4ae64` (Task 2 commit)

**4. [Rule 3 - Blocking] CI file is contracts-test.yml not contracts.yml**

- **Found during:** Task 2 (CI gate wiring)
- **Issue:** Plan references `.github/workflows/contracts.yml` but the actual file is `.github/workflows/contracts-test.yml` (created in Phase 0).
- **Fix:** Added selector gate step to `.github/workflows/contracts-test.yml` in the `foundry-test` job.
- **Files modified:** `.github/workflows/contracts-test.yml`
- **Verification:** `grep -c "0xff540eb6" .github/workflows/contracts-test.yml` returns 5 (≥1 required)
- **Committed in:** `ad4ae64` (Task 2 commit)

---

**Total deviations:** 4 auto-fixed (all Rule 3 — blocking issues)
**Impact on plan:** All fixes necessary to unblock `cargo test` and `forge` compilation verification. No scope creep. RED state confirmed for both Rust (9 FAILED tests) and Solidity (compile error on missing SolidityScoreEngine.sol).

## Known Stubs

| Stub | File | Description |
|------|------|-------------|
| `todo!("Phase 5 Plan 02 implements full D-2 math")` | `packages/contracts/stylus/src/math.rs:43` | Intentional — RED state stub. Plan 02 implements the full D-2 algorithm. |

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. All files are test scaffolding and CI configuration only.

The selector CI gate (T-05-01-01) is the primary security artifact — it enforces ABI compatibility at every push, preventing silent fallback via wrong selector 0xfe7606ba.

## Issues Encountered

**Phase-level note:** `cargo test` (without flags) would have failed in Phase 0 too for the same `no_std + cdylib` reason — this is a pre-existing toolchain issue, not introduced by Plan 01. The fix (`target_arch = "wasm32"` gate) is the correct long-term pattern for Stylus crates that need host-target unit tests.

## Next Phase Readiness

Ready for Plan 02 (GREEN — implement full D-2 math in `compute_rep_delta`):
- All test expectations are locked (exact int32 values: 68, 10, -6, -36, 7)
- The `todo!()` body in `math.rs` is the only file that needs modification
- `cargo test` infrastructure confirmed working
- The `#[selector(name = "compute_rep_change")]` MUST be applied when Plan 02 adds the Stylus engine struct to `lib.rs`

Ready for Plan 03 (SolidityScoreEngine.sol + RevertingStylusEngine.sol deployment):
- All 8 parity tests in `SolidityScoreEngine.t.sol` will go GREEN once the contracts are created
- The D-4 guard is enforced (0 "Rust" mentions)
- The `_baseline()` helper inline math is locked and must match `_solidityBaselineRepDelta` exactly

---
*Phase: 05-stylusscoreengine-48h-cutoff*
*Completed: 2026-06-02*

## Self-Check: PASSED

- [x] `packages/contracts/stylus/src/math.rs` exists on disk
- [x] `packages/contracts/stylus/tests/test_math.rs` exists on disk
- [x] `packages/contracts/test/SolidityScoreEngine.t.sol` exists on disk
- [x] Commit `ae34140` exists (Task 1)
- [x] Commit `ad4ae64` exists (Task 2)
- [x] `cargo test` output shows "test result: FAILED. 0 passed; 9 failed" (RED confirmed)
- [x] `grep "pragma solidity =0.8.30" packages/contracts/test/SolidityScoreEngine.t.sol | wc -l` = 1
- [x] `grep -c "function test_" packages/contracts/test/SolidityScoreEngine.t.sol` = 8
- [x] `grep -c "Rust" packages/contracts/test/SolidityScoreEngine.t.sol` = 0 (D-4 guard)
- [x] `grep -c "0xff540eb6" .github/workflows/contracts-test.yml` >= 1 (selector gate)
- [x] `forge test --match-contract SolidityScoreEngineTest` fails with "File not found" (RED)
- [x] `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` = 0xff540eb6
