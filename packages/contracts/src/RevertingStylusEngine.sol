// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Requirement: SAFETY-42 (Phase 6 drill fixture)
//
// Phase 5 test fixture: intentionally reverts on compute_rep_change.
// Pre-deployed to Sepolia so Phase 6 SAFETY-42 drill is mechanical.
// Verifies SettlementManager try/catch fires RepCalculatedFallback.

import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";

/// @title RevertingStylusEngine
/// @notice Intentionally reverts on compute_rep_change.
///         Used in Phase 6 SAFETY-42 drill to verify SettlementManager try/catch.
///         When set as the active stylusScoreEngine, every settle() call will hit
///         the catch branch and emit RepCalculatedFallback, falling back to
///         _solidityBaselineRepDelta. This is how we verify the fallback rail works.
contract RevertingStylusEngine is IStylusScoreEngine {
    function compute_rep_change(
        uint128, uint8, uint8, bool, uint256
    ) external view override returns (int32) {
        revert("RevertingStylusEngine: intentional revert for Phase 6 drill");
    }
}
