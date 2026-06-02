// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.6 -- 48h cutoff fallback baseline
// Requirement: REP-22, REP-24, OPS-16
//
// MATH MUST MATCH SettlementManager._solidityBaselineRepDelta EXACTLY (REP-24).
// Any divergence means the proxy-upgrade fallback produces different rep deltas
// than the runtime try/catch fallback. Parity is verified in test/SolidityScoreEngine.t.sol.
//
// D-3: SolidityScoreEngine is LOW FIDELITY by design (linear conviction scaling only).
// consensusPct is ignored (fixed 1.0 multiplier). No hi-conv 2x.
// This INTENTIONALLY differs from the Rust/Stylus full-fidelity engine.
// The parity test checks SolidityScoreEngine == _solidityBaselineRepDelta,
// NOT SolidityScoreEngine == Rust engine.
//
// OPS-16 / 48h cutoff: if cargo stylus check fails 48h before demo,
// upgrade the proxy to this contract via CutoffFallback.s.sol.

import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";

/// @title SolidityScoreEngine
/// @notice 48h-cutoff fallback: standalone contract implementing IStylusScoreEngine
///         with the same math as SettlementManager._solidityBaselineRepDelta.
///         No storage -- stateless, view-only. Deployable behind TransparentUpgradeableProxy.
///
///         PARITY OBLIGATION (REP-24):
///         compute_rep_change(cv, cPct, winner, base) must equal _solidityBaselineRepDelta
///         for all inputs. Both use: scaled = (base * conviction * 2) / 100 with floor(scaled, 1).
///         consensusPct is unused in the baseline (fixed 1.0 multiplier, D-3 scope).
contract SolidityScoreEngine is IStylusScoreEngine {
    /// @inheritdoc IStylusScoreEngine
    function compute_rep_change(
        uint128 /*currentRep*/,
        uint8   conviction,
        uint8   /*consensusPct*/,
        bool    isWinner,
        uint256 baseValue
    ) external view override returns (int32 delta) {
        // MUST be identical to SettlementManager._solidityBaselineRepDelta:
        // Linear conviction scale: at conviction=50 -> 1.0x; at 100 -> 2.0x
        // multiply first to avoid integer truncation: (baseValue * conviction * 2) / 100
        // Note: baseValue replaces the local BASE=10 constant in SM (REP-24 parity test
        // always passes baseValue=10, so outputs match identically).
        uint256 scaled = (baseValue * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1; // floor: any action earns at least 1 rep
        if (isWinner) {
            delta = int32(int256(scaled));
        } else {
            delta = -int32(int256(scaled));
        }
        // REP-02: floor at 0 is applied by ProfileRegistry.applyRepDelta, not here.
    }
}
