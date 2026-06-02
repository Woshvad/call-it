---
phase: 05-stylusscoreengine-48h-cutoff
plan: 02
subsystem: contracts-rust
tags: [stylus, rust, reputation-math, D-2, tdd, wasm32, cargo]
type: tdd

# Dependency graph
requires:
  - phase: 05-stylusscoreengine-48h-cutoff
    plan: 01
    provides: RED test scaffold — 9 failing unit tests in tests/test_math.rs + stub math.rs

provides:
  - Full D-2 reputation delta math (compute_rep_delta) in packages/contracts/stylus/src/math.rs
  - Stylus engine scaffold in packages/contracts/stylus/src/lib.rs (#[storage] + #[public] + #[selector])
  - selector 0xff540eb6 enforced via #[selector(name = "compute_rep_change")]
  - cargo test: 9 passed; 0 failed

affects:
  - packages/contracts/stylus/src/math.rs
  - packages/contracts/stylus/src/lib.rs

# Tech tracking
tech-stack:
  added:
    - "stylus_sdk::prelude::* (#[storage], #[public], #[selector]) in engine module"
    - "stylus_sdk::alloy_primitives::{U128, U256} for ABI type mapping"
    - "D-2 integer arithmetic (confScaled, contrarianMilli, magnitude, hi-conv 2x)"
  patterns:
    - "#[cfg(any(target_arch = wasm32, feature = export-abi))] guards Stylus engine struct — cargo test on native x86_64 cannot link Stylus host functions"
    - "extern crate alloc + use alloc::vec::Vec in engine module — stylus_sdk macros reference alloc::vec::Vec directly"
    - "pub mod math + wasm32-cfg guard on engine module: math.rs is always compiled; StylusScoreEngine only for WASM/export-abi"
    - "checked_mul / checked_div throughout D-2 — overflow impossible (max magnitude ~80) but required per security policy"

key-files:
  modified:
    - packages/contracts/stylus/src/math.rs
    - packages/contracts/stylus/src/lib.rs

key-decisions:
  - "D-2 math isolated in math.rs (pure Rust) with no Stylus host calls — passes cargo test without WASM runtime"
  - "Stylus engine struct (#[storage] + #[public]) gated to cfg(any(target_arch = wasm32, feature = export-abi)) — Stylus SDK imports host functions (block_number etc.) that do not exist on native x86_64 linker"
  - "cargo stylus export-abi not verified locally — tool requires a bin target; cargo build --features export-abi passes instead; WASM check via cargo check --target wasm32-unknown-unknown"
  - "#[selector(name = compute_rep_change)] present in lib.rs engine impl — enforces selector 0xff540eb6 over default camelCase 0xfe7606ba"

# Metrics
duration: 9min
completed: 2026-06-02T06:31:00Z
tasks: 2
files: 2
---

# Phase 5 Plan 02: D-2 Math GREEN + Stylus Engine Scaffold Summary

**Full D-2 integer arithmetic implemented in math.rs (9 tests GREEN) + Stylus #[storage]+#[public]+#[selector] scaffold in lib.rs with selector 0xff540eb6 enforced**

## Accomplishments

### Task 1: D-2 Math Implementation — GREEN (commit 97f57a8)

Implemented the full 5-step D-2 formula in `packages/contracts/stylus/src/math.rs`:

**Step 1 — confScaled:** `max(1, (base_value * conviction * 2) / 100)`
**Step 2 — contrarianMilli (winners only):** `700 + (min(consensus_pct, 85) * 1300) / 85`; losers fixed at 1000
**Step 3 — magnitude:** winners: `(confScaled * contrarianMilli) / 1000`; losers: `confScaled`
**Step 4 — hi-conv 2x:** `if conviction >= 85 { magnitude *= 2 }` (both winners and losers)
**Step 5 — signed delta:** `+magnitude` for winners, `-magnitude` for losers

Worked examples verified (exact values match D-2 spec):
- `(90, 80, true)` = +68
- `(50, 20, true)` = +10
- `(30, 50, false)` = -6
- `(90, 50, false)` = -36
- `(50, 0, true)` = +7

All 9 tests GREEN: `test result: ok. 9 passed; 0 failed; 0 ignored`

No float arithmetic, no floor-at-0 in engine. Checked arithmetic throughout.

### Task 2: Stylus Engine Scaffold (commit fadfd5c)

Replaced Phase-0 `#[no_mangle] extern "C" fn stub_ping` with full Stylus SDK 0.10.7 skeleton:

- `#[storage] pub struct StylusScoreEngine;` — stateless, no storage fields
- `#[public] impl StylusScoreEngine` with `#[selector(name = "compute_rep_change")]`
- `&self` (not `&mut self`) — view state mutability for STATICCALL compatibility
- `pub mod math;` — exposes crate::math::compute_rep_delta to test files
- Calls `crate::math::compute_rep_delta` with alloy type conversion (U128→u128, U256→u64)

Engine struct gated to `#[cfg(any(target_arch = "wasm32", feature = "export-abi"))]` so `cargo test` continues to work on native x86_64 (Stylus SDK links host functions that only exist in ArbOS).

## TDD Gate Compliance

- **RED gate:** commit `ae34140` (test(05-01): RED scaffold — 9 failing tests)
- **GREEN gate:** commit `97f57a8` (feat(05-02): implement full D-2 math — 9 passing tests)
- **REFACTOR:** Not required — implementation was clean on first pass

TDD gate sequence: RED → GREEN. REFACTOR omitted (no cleanup needed). Compliant.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | D-2 math GREEN (math.rs) | 97f57a8 | packages/contracts/stylus/src/math.rs |
| 2 | Stylus engine scaffold (lib.rs) | fadfd5c | packages/contracts/stylus/src/lib.rs |

## Verification Results

```
cargo test: test result: ok. 9 passed; 0 failed; 0 ignored
cargo check --target wasm32-unknown-unknown: Finished (warnings only, no errors)
cargo build --features export-abi: Finished (warnings only, no errors)

grep -c 'selector.*compute_rep_change' lib.rs → 5 (includes #[selector] line)
grep '#[selector' lib.rs → #[selector(name = "compute_rep_change")]  ✓
grep -c 'pub mod math' lib.rs → 1 ✓
grep -c 'stub_ping' lib.rs → 1 (comment only, no code) ✓
grep -n '&mut self' lib.rs → comment lines only ✓
grep -c 'f32|f64' math.rs → 0 (no floats) ✓
grep -c 'max(0' math.rs → 0 (no floor-at-0 in engine) ✓
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stylus engine struct gated to wasm32/export-abi cfg**

- **Found during:** Task 2 — `cargo test` failed with linker errors after adding `#[storage]` + `#[public]`
- **Issue:** Stylus SDK macros (`#[storage]`, `#[public]`) reference host functions (`block_number`, `msg_sender`, etc.) that only exist in the ArbOS WASM runtime. Attempting to link them on native x86_64 produces `LNK2019: unresolved external symbol block_number` linker errors.
- **Fix:** Wrapped the entire `StylusScoreEngine` struct and impl in `#[cfg(any(target_arch = "wasm32", feature = "export-abi"))] mod engine { ... }`. The math tests call `crate::math::compute_rep_delta` directly and never need the engine struct — this is by design (Pattern 2: Math Isolation).
- **Files modified:** `packages/contracts/stylus/src/lib.rs`
- **Commits:** fadfd5c

**2. [Rule 1 - Bug] explicit Vec/vec imports required for stylus_sdk macros**

- **Found during:** Task 2 — `cargo check --target wasm32-unknown-unknown` failed with "cannot find type Vec in this scope"
- **Issue:** `#[storage]` and `#[public]` macro expansions reference `Vec` without a full path. With `no_std` + `extern crate alloc`, `Vec` is not in scope automatically — must be imported explicitly.
- **Fix:** Added `use alloc::vec;` and `use alloc::vec::Vec;` inside the `engine` module alongside `extern crate alloc`.
- **Files modified:** `packages/contracts/stylus/src/lib.rs`
- **Commits:** fadfd5c

**3. [Rule 3 - Tooling] cargo stylus export-abi not verified — no bin target**

- **Found during:** Task 2 verification step
- **Issue:** `cargo stylus export-abi` internally runs `cargo run --features export-abi`. This requires a binary target (`main()` function). Stylus cdylib crates without a bin target cannot run this command — it exits with "no bin target found".
- **Alternative verified:** `cargo build --features export-abi` (compiles the export-abi feature path successfully) and `cargo check --target wasm32-unknown-unknown` (confirms WASM ABI boundary compiles). The `#[selector(name = "compute_rep_change")]` attribute is verified in source code — it is the sole mechanism for selector override and its presence guarantees 0xff540eb6.
- **Not a blocker:** The Sepolia deploy step (Plan 05-04/05) will verify the ABI via `cast call $PROXY_ADDR "compute_rep_change(uint128,uint8,uint8,bool,uint256)" 100 50 50 true 10`.
- **Files modified:** None (verification gap documented)

## Known Stubs

None. The math implementation is complete with exact D-2 constants locked by 9 unit tests.
The lib.rs scaffold is complete with correct types and selector override.

## Threat Surface Scan

No new network endpoints or trust boundaries introduced by this plan.

| D-1 | T-05-02-01 | Selector mismatch mitigated: `#[selector(name = "compute_rep_change")]` present in lib.rs. Enforces 0xff540eb6. |
| D-2 | T-05-02-02 | State mutability: `&self` (not `&mut self`) on all compute_rep_change signatures. |
| D-3 | T-05-02-03 | Overflow: `checked_mul`/`checked_div` throughout compute_rep_delta. test_no_overflow_extremes covers u128::MAX input. |
| D-4 | T-05-02-04 | Wrong constants: 9 locked unit tests with exact expected values. Any constant change breaks test_d2_example_* immediately. |

All 4 threat mitigations from plan's threat register: APPLIED.

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-02T06:21:48Z
- **Completed:** 2026-06-02T06:31:00Z
- **Tasks:** 2
- **Files modified:** 2

## Self-Check: PASSED
