// Call It StylusScoreEngine — reputation delta math module
//
// This module is the pure-Rust scoring logic, isolated from Stylus host calls
// so it can be unit-tested with plain `cargo test` (no Stylus runtime needed).
//
// Pattern: RESEARCH.md "Pattern 2: Math Isolation"
// Spec: CALL_IT_SPEC1.md §7.3, §7.4, §12.6
// Requirements: REP-19, REP-20
//
// Phase 5 Plan 02 implements the full D-2 math.
// This file (Plan 01) contains only the stub body for the RED test phase.

/// Compute the reputation delta for a settled call outcome.
///
/// # Parameters
/// - `_current_rep`: Caller's current rep score (uint128). Unused in Phase 5;
///   prefixed with `_` to suppress unused-variable warning. Reserved for future
///   category-weighted routing or diminishing-returns logic.
/// - `conviction`: Call conviction 0–100 (as set at createCall time).
/// - `consensus_pct`: 0–100: fade/(follow+fade) real reserves at settle time.
///   Higher = more contrarian (more people disagreed with the caller).
/// - `is_winner`: True if the caller won (CallerWon outcome).
/// - `base_value`: Base rep unit — always 10 in Phase 5 (passed by SettlementManager).
///
/// # Returns
/// Signed reputation delta. Positive = rep gain; negative = rep loss.
/// Range in practice: roughly [-200, +200]; fits in i32.
/// Floor at 0 is applied by ProfileRegistry.applyRepDelta, NOT here (REP-02).
///
/// # Full-fidelity D-2 algorithm (implemented in Plan 02):
/// Winners: base × conviction_multiplier × contrarian_multiplier × (2× if conviction ≥ 85)
/// Losers:  base × conviction_multiplier × (2× if conviction ≥ 85) — no contrarian on losses (REP-06)
pub fn compute_rep_delta(
    _current_rep: u128,
    conviction: u8,
    consensus_pct: u8,
    is_winner: bool,
    base_value: u64,
) -> i32 {
    // RED state: todo!() body — Plan 02 implements the full D-2 math.
    // ALL tests in test_math.rs MUST fail here with "not yet implemented".
    let _ = (conviction, consensus_pct, is_winner, base_value);
    todo!("Phase 5 Plan 02 implements full D-2 math")
}
