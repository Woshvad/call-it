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
/// # Full-fidelity D-2 algorithm (LOCKED — do not alter constants):
///
/// Step 1 — confScaled: max(1, (base_value * conviction * 2) / 100)
///   At conviction=50: max(1, (10*50*2)/100) = 10
///   At conviction=90: max(1, (10*90*2)/100) = 18
///
/// Step 2 — contrarianMilli (winners ONLY, 1000 = 1.0×):
///   contrarianMilli = 700 + (min(consensus_pct, 85) * 1300) / 85
///   At consensus_pct=0:  700 + 0   = 700  (0.7×)
///   At consensus_pct=85: 700 + 1300 = 2000 (2.0×)
///   Losers: fixed at 1000 (no contrarian on losses — REP-06)
///
/// Step 3 — magnitude:
///   winner: (confScaled * contrarianMilli) / 1000
///   loser:  confScaled
///
/// Step 4 — high-conviction asymmetry (conviction >= 85, both winners and losers):
///   magnitude *= 2
///
/// Step 5 — delta:
///   winner: +magnitude as i32
///   loser:  -magnitude as i32
///
/// No floor at 0 in engine (REP-02). Checked arithmetic throughout — overflow
/// impossible in practice (max magnitude ≈ 80) but required per security policy.
pub fn compute_rep_delta(
    _current_rep: u128,
    conviction: u8,
    consensus_pct: u8,
    is_winner: bool,
    base_value: u64,
) -> i32 {
    // Step 1: confScaled = max(1, (base_value * conviction * 2) / 100)
    // All intermediate values fit in u64: base=10, conviction≤100, *2=2000, /100=20 max.
    let conviction_u64 = conviction as u64;
    let conf_scaled: u64 = {
        let raw = base_value
            .checked_mul(conviction_u64)
            .and_then(|v| v.checked_mul(2))
            .and_then(|v| v.checked_div(100))
            .unwrap_or(i32::MAX as u64);
        if raw < 1 { 1 } else { raw }
    };

    // Step 2: contrarianMilli (1000 = 1.0×)
    // Winners: 700 + (min(consensus_pct, 85) * 1300) / 85
    // Losers:  fixed at 1000 (no contrarian on losses — REP-06)
    let contrarian_milli: u64 = if is_winner {
        let capped_pct = (consensus_pct.min(85)) as u64;
        700u64
            .checked_add(
                capped_pct
                    .checked_mul(1300)
                    .and_then(|v| v.checked_div(85))
                    .unwrap_or(1300),
            )
            .unwrap_or(2000)
    } else {
        1000
    };

    // Step 3: magnitude
    // winner: (confScaled * contrarianMilli) / 1000
    // loser:  confScaled (no contrarian)
    let mut magnitude: u64 = if is_winner {
        conf_scaled
            .checked_mul(contrarian_milli)
            .and_then(|v| v.checked_div(1000))
            .unwrap_or(conf_scaled)
    } else {
        conf_scaled
    };

    // Step 4: high-conviction asymmetry — 2× at conviction >= 85 (both winners and losers)
    if conviction >= 85 {
        magnitude = magnitude.checked_mul(2).unwrap_or(magnitude);
    }

    // Step 5: signed delta (no floor — ProfileRegistry.applyRepDelta handles floor at 0)
    if is_winner {
        magnitude as i32
    } else {
        -(magnitude as i32)
    }
}
