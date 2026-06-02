// Call It StylusScoreEngine — D-2 worked-example unit tests
//
// This file tests the pure-Rust `compute_rep_delta` function in isolation
// (no Stylus host calls required — plain `cargo test` suffices).
//
// Pattern: RESEARCH.md "Pattern 2: Math Isolation" + 05-PATTERNS.md "test_math.rs" section
// Spec: CALL_IT_SPEC1.md §7.3, §7.4, §12.6
// Requirements: REP-19, REP-20, REP-06, REP-07
//
// RED STATE (Plan 01): All 9 tests MUST fail with "not yet implemented"
// because math.rs contains only a todo!() body.
// GREEN comes in Plan 02 when the full D-2 algorithm is implemented.
//
// D-2 locked worked examples (exact expected int32 values):
//   conviction=90, consensusPct=80, isWinner=true,  base=10 → +68
//   conviction=50, consensusPct=20, isWinner=true,  base=10 → +10
//   conviction=30, consensusPct=50, isWinner=false, base=10 → -6
//   conviction=90, consensusPct=50, isWinner=false, base=10 → -36
//   conviction=50, consensusPct=0,  isWinner=true,  base=10 → +7

use stylus_score_engine::math::compute_rep_delta;

// ─── D-2 worked example: bold correct call ──────────────────────────────────
// conviction=90, consensusPct=80 (contrarian winner), isWinner=true
// Expected +68: high conviction (1.8×) × contrarian bonus × 2× high-conviction gate
#[test]
fn test_d2_example_bold_correct() {
    let delta = compute_rep_delta(100, 90, 80, true, 10);
    assert_eq!(delta, 68, "bold correct: conviction=90, consensusPct=80, winner → +68");
}

// ─── D-2 worked example: obvious correct call ───────────────────────────────
// conviction=50, consensusPct=20 (obvious winner — crowd agreed), isWinner=true
// Expected +10: mid conviction (1.0×) × low contrarian bonus (~0.7×... rounds to 10 base)
#[test]
fn test_d2_example_obvious_correct() {
    let delta = compute_rep_delta(100, 50, 20, true, 10);
    assert_eq!(delta, 10, "obvious correct: conviction=50, consensusPct=20, winner → +10");
}

// ─── D-2 worked example: wrong low-conviction call ──────────────────────────
// conviction=30, consensusPct=50, isWinner=false
// Expected -6: low conviction penalty (0.6×), no contrarian on losses (REP-06)
#[test]
fn test_d2_example_wrong_low_conviction() {
    let delta = compute_rep_delta(100, 30, 50, false, 10);
    assert_eq!(delta, -6, "wrong low-conviction: conviction=30, loser → -6");
}

// ─── D-2 worked example: wrong high-conviction call ─────────────────────────
// conviction=90, consensusPct=50, isWinner=false
// Expected -36: high conviction (1.8×) × 2× high-conviction gate = 3.6× loss
#[test]
fn test_d2_example_wrong_high_conviction() {
    let delta = compute_rep_delta(100, 90, 50, false, 10);
    assert_eq!(delta, -36, "wrong high-conviction: conviction=90, loser → -36");
}

// ─── D-2 worked example: cold-start winner ──────────────────────────────────
// conviction=50, consensusPct=0 (nobody faded → contrarian multiplier at minimum: 0.7)
// Expected +7: mid conviction (1.0×) × contrarian=0.7 (milli-units: 700/1000)
// NOTE: SM applies an additional 25% cold-start scale at settle time;
//       the ENGINE returns +7 and SM scales to +2 (outside engine scope).
#[test]
fn test_d2_example_cold_start_win() {
    let delta = compute_rep_delta(100, 50, 0, true, 10);
    assert_eq!(delta, 7, "cold-start win: conviction=50, consensusPct=0, winner → +7");
}

// ─── Property: no contrarian multiplier applied to losses (REP-06) ───────────
// Losses at consensusPct=10 and consensusPct=90 must be equal.
// The contrarian multiplier is winners-only — losses scale only with conviction.
#[test]
fn test_contrarian_not_applied_to_losses() {
    let delta_low  = compute_rep_delta(100, 50, 10, false, 10);
    let delta_high = compute_rep_delta(100, 50, 90, false, 10);
    assert_eq!(
        delta_low, delta_high,
        "REP-06: losses must not scale with consensusPct (contrarian is winners-only); \
         got low={}, high={}",
        delta_low, delta_high
    );
}

// ─── Property: high-conviction threshold fires 2× asymmetry at conviction=85 ─
// conviction=85 must produce MORE than 2× the output of conviction=84
// (discrete step at the threshold — not a smooth gradient).
// Assertion: delta(85) > delta(84) * 2 - 5  (allows rounding tolerance)
#[test]
fn test_high_conviction_threshold() {
    let below = compute_rep_delta(100, 84, 50, true, 10);
    let above = compute_rep_delta(100, 85, 50, true, 10);
    assert!(
        above > 0 && below > 0,
        "both conviction=84 and conviction=85 must return positive delta for winner; \
         got below={}, above={}",
        below, above
    );
    // 2× asymmetry: above should exceed 2×below (discrete threshold, not smooth curve)
    assert!(
        above > below * 2 - 5,
        "high conviction threshold: delta(85)={} must be > delta(84)*2-5={}; \
         conviction=85 triggers the 2× multiplier gate",
        above, below * 2 - 5
    );
}

// ─── Property: engine returns negative delta for pure losses ─────────────────
// currentRep=0 (floor is handled by ProfileRegistry.applyRepDelta, not engine)
// consensusPct=0 (no fade), isWinner=false
// Engine must return a negative value — no floor in engine (REP-02).
#[test]
fn test_engine_returns_raw_negative_delta() {
    let delta = compute_rep_delta(0, 90, 0, false, 10);
    assert!(
        delta < 0,
        "engine must return raw negative delta for loss outcome; got {}",
        delta
    );
}

// ─── Property: no overflow on extreme inputs ─────────────────────────────────
// u128::MAX for currentRep, conviction=100, consensusPct=100, isWinner=true, base=100.
// Must not panic (checked arithmetic in engine; i32 result must be in valid range).
#[test]
fn test_no_overflow_extremes() {
    let result = std::panic::catch_unwind(|| {
        compute_rep_delta(u128::MAX, 100, 100, true, 100)
    });
    match result {
        Ok(delta) => {
            // If it returns without panicking, the value must be a valid i32 (not overflow)
            assert!(
                delta > i32::MIN && delta < i32::MAX,
                "extreme inputs must produce finite i32 delta; got {}",
                delta
            );
        }
        Err(_) => {
            // If compute_rep_delta panics on overflow, it's still acceptable in RED state
            // (Plan 02 must implement checked arithmetic to make this pass without panic).
            // In RED state (todo!()), this will panic with "not yet implemented" — expected.
            panic!(
                "test_no_overflow_extremes: panic in RED state is expected (todo!() body); \
                 Plan 02 must implement checked arithmetic to make this GREEN."
            );
        }
    }
}
