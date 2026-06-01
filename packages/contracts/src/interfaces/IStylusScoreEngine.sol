// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md ss12.6 -- Phase 5 Stylus score engine interface
//
// PHASE-5 INTERFACE LOCK -- RESEARCH.md Assumption A4.
// Phase 5 MUST implement this exact signature. The try/catch seam in SettlementManager
// imports this interface. Any deviation in Phase 5 will cause the seam to silently
// fall back to Solidity baseline forever.
//
// +---------------------------------------------------------------------------+
// |  LOCKED -- DO NOT MODIFY.                                                 |
// |  SettlementManager.settle() step 8 imports this interface for the         |
// |  try/catch seam. Phase 5 deploys a Rust/Stylus contract that implements  |
// |  this exact signature and then calls setStylusScoreEngine(addr).          |
// +---------------------------------------------------------------------------+

/// @title IStylusScoreEngine
/// @notice AUTHORITATIVE Phase-5 interface for the Rust/Stylus reputation scoring engine.
///         Phase 4 ships the Solidity baseline (_solidityBaselineRepDelta) as the runtime
///         fallback. Phase 5 deploys a Stylus contract implementing this interface and
///         sets it via SettlementManager.setStylusScoreEngine(addr).
///
///         The try/catch seam in SettlementManager.settle() step 8:
///           try IStylusScoreEngine(stylusAddr).compute_rep_change(...) returns (int32 d) { ... }
///           catch (bytes memory err) { _solidityBaselineRepDelta(...); emit RepCalculatedFallback; }
///
///         WARNING: The function name uses underscores (compute_rep_change) to match
///         the Rust/Stylus naming convention. Do NOT rename.
interface IStylusScoreEngine {
    /// @notice Compute the reputation change for a settled call outcome.
    ///
    /// @param currentRep    Caller's current reputation score (uint128; floor=0).
    /// @param conviction    Call conviction 0-100 (as set at createCall time).
    /// @param consensusPct  0-100: fade/(follow+fade) real reserves at settle time.
    ///                      Represents how contrarian the call was (higher = more contrarian).
    /// @param isWinner      True if the caller won (CallerWon outcome).
    /// @param baseValue     Base rep unit -- always 10 in Phase 4.
    ///                      Phase 5 Stylus engine may use this as the base multiplier.
    ///
    /// @return delta Signed reputation delta (positive = gain, negative = loss).
    ///         Range: roughly [-200, +200] in practice; int32 is sufficient.
    ///         Phase 5 Stylus implements: full conviction multipliers, high-conviction 2x
    ///         asymmetry at >=85, contrarian bonus scaling, category weighting.
    ///         Phase 4 Solidity baseline (_solidityBaselineRepDelta) is lower fidelity:
    ///         linear conviction scale, contrarian=1.0 fixed, no 2x asymmetry (REP-22).
    function compute_rep_change(
        uint128 currentRep,
        uint8   conviction,
        uint8   consensusPct,
        bool    isWinner,
        uint256 baseValue
    ) external view returns (int32 delta);
}
