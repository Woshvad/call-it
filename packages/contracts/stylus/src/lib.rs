// Call It StylusScoreEngine — Phase 5 Plan 02 (GREEN engine scaffold)
//
// Replaces the Phase-0 stub (#[no_mangle] extern "C" fn stub_ping) with the
// full Stylus SDK 0.10.7 skeleton. This file is the ABI boundary layer:
// - #[storage] struct (stateless — no fields needed)
// - #[public] impl with #[selector(name = "compute_rep_change")] override
// - Delegates all scoring logic to crate::math::compute_rep_delta (pure Rust)
//
// CRITICAL (D-1): #[selector(name = "compute_rep_change")] is MANDATORY.
// Without it, #[public] camelCases to computeRepChange → selector 0xfe7606ba (WRONG).
// Required selector: 0xff540eb6
// Verified: cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)" → 0xff540eb6
//           cast sig "computeRepChange(uint128,uint8,uint8,bool,uint256)"   → 0xfe7606ba
//
// State mutability: &self (NOT &mut self) → ABI-encodes as view.
// SettlementManager issues STATICCALL for view functions. Mismatching mutability reverts.
//
// Pattern: RESEARCH.md "Full Engine Skeleton" + "Pattern 1: Selector Override"
// Interface: packages/contracts/src/interfaces/IStylusScoreEngine.sol (LOCKED)
// Requirements: REP-19, REP-20

// Apply no_std only for wasm32 target builds (Stylus deployment).
// cargo test runs on the host target (x86_64) and uses std — no no_std needed.
// This is the same pattern used in Phase 01 (proven to compile).
#![cfg_attr(target_arch = "wasm32", no_std)]
#![cfg_attr(target_arch = "wasm32", no_main)]

// Pure-Rust scoring math module. No Stylus host calls — no alloc needed.
// Uses only primitive types: u128, u8, bool, u64, i32.
// Fully unit-testable with plain `cargo test` on the native host target.
pub mod math;

// The #[storage] + #[public] Stylus engine struct is compiled ONLY for the wasm32
// target or when generating the ABI export. The Stylus SDK macros reference host
// functions (block_number, msg_sender, etc.) that do not exist in the native test
// environment. Building them only for wasm32/export-abi keeps `cargo test` working.
//
// Unit tests in tests/test_math.rs call math::compute_rep_delta directly and do NOT
// need the Stylus engine struct — they run with plain `cargo test` on the host target.
#[cfg(any(target_arch = "wasm32", feature = "export-abi"))]
pub use engine::StylusScoreEngine;

#[cfg(any(target_arch = "wasm32", feature = "export-abi"))]
mod engine {
    extern crate alloc;
    // Vec is required by #[storage] and #[public] macro expansions.
    use alloc::vec;
    use alloc::vec::Vec;

    use stylus_sdk::prelude::*;
    use stylus_sdk::alloy_primitives::{U128, U256};

    /// StylusScoreEngine: stateless reputation scoring engine.
    ///
    /// The engine holds no storage — all reputation state lives in ProfileRegistry.
    /// This makes proxy upgrades safe: no storage layout to preserve or migrate.
    ///
    /// The SettlementManager calls this engine via:
    ///   try IStylusScoreEngine(stylusAddr).compute_rep_change(...) returns (int32 delta)
    /// On success: RepCalculated event. On revert: falls back to _solidityBaselineRepDelta.
    ///
    /// #[entrypoint] is MANDATORY: it marks this as the contract's main struct so the
    /// Stylus SDK emits the `user_entrypoint` export. Without it, `cargo stylus check`
    /// fails with "missing an entrypoint" and the optimizer strips the contract to ~86B
    /// (undeployable). The macro also wires the global allocator + panic handler for the
    /// no_std wasm32 target.
    #[entrypoint]
    #[storage]
    pub struct StylusScoreEngine;

    #[public]
    impl StylusScoreEngine {
        /// Compute the reputation delta for a settled call outcome.
        ///
        /// LOCKED INTERFACE: matches IStylusScoreEngine.compute_rep_change exactly.
        /// selector 0xff540eb6 = keccak256("compute_rep_change(uint128,uint8,uint8,bool,uint256)")[0:4]
        ///
        /// #[selector(name = "compute_rep_change")] is MANDATORY (D-1).
        /// Without it, the SDK converts to computeRepChange (0xfe7606ba) — wrong selector.
        /// Every SettlementManager call would silently hit the catch branch.
        ///
        /// &self (not &mut self): view state mutability required for STATICCALL compatibility.
        /// The SettlementManager try/catch issues STATICCALL for view functions.
        #[selector(name = "compute_rep_change")]
        pub fn compute_rep_change(
            &self,             // &self = view (not &mut self which would be nonpayable)
            current_rep: U128, // uint128 in Solidity
            conviction: u8,    // uint8
            consensus_pct: u8, // uint8
            is_winner: bool,   // bool
            base_value: U256,  // uint256 (always 10 from SM)
        ) -> i32 {             // int32 in Solidity (alloy Int<32> roundtrips as i32)
            crate::math::compute_rep_delta(
                current_rep.to::<u128>(),
                conviction,
                consensus_pct,
                is_winner,
                base_value.to::<u64>(),
            )
        }
    }
}
