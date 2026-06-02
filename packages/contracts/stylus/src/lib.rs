// Call It StylusScoreEngine — Phase 5 Plan 01 (RED test scaffold)
//
// This file exposes the `math` module for unit testing via `cargo test`.
// The full Stylus engine struct with #[storage]/#[public] attributes
// will be added in Plan 02 (GREEN) after tests pass.
//
// no_std is applied only when building for wasm32 targets (not for cargo test
// on the host target). This is the correct pattern for Stylus crates that need
// to run plain #[test] unit tests without a Stylus mock host.
//
// CRITICAL (for Plan 02): The `#[selector(name = "compute_rep_change")]` attribute
// is MANDATORY when adding the Stylus engine. Without it, the Stylus SDK converts
// `compute_rep_change` → `computeRepChange` → selector 0xfe7606ba (wrong).
// Required selector: 0xff540eb6
// Verified: cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)" → 0xff540eb6
//
// Pattern: RESEARCH.md "Pattern 2: Math Isolation"
// Requirements: REP-19, REP-20
// Interface: packages/contracts/src/interfaces/IStylusScoreEngine.sol (LOCKED)

// Apply no_std only for wasm32 target builds (Stylus deployment).
// cargo test runs on the host target (x86_64) and uses std — no no_std needed.
#![cfg_attr(target_arch = "wasm32", no_std)]

/// Pure-Rust scoring math module. No Stylus host calls — no alloc needed.
/// Uses only primitive types: u128, u8, bool, u64, i32.
/// Fully unit-testable with plain `cargo test` on the host target.
pub mod math;

// Phase 0 stub retained for WASM target compilation verification.
// Plan 02 replaces this with the full #[storage]/#[public] Stylus engine struct.
#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn stub_ping() -> u32 {
    0
}

#[cfg(test)]
mod tests {
    #[test]
    fn lib_compiles() {
        // Confirm lib.rs builds in test mode with pure-Rust math module.
        // All D-2 substantive tests are in tests/test_math.rs.
        assert!(true);
    }
}
