// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.6 -- SolidityScoreEngine parity with SM baseline (REP-24)
// Requirement: REP-24
//
// PARITY TEST (D-4 SCOPE):
// Asserts SolidityScoreEngine.compute_rep_change == _solidityBaselineRepDelta (inline).
// The Solidity engine is the 48h-cutoff fallback — it MUST produce exactly the same
// output as SettlementManager._solidityBaselineRepDelta.
//
// D-4 CRITICAL: This file does NOT assert the full-fidelity engine output == Solidity baseline.
// The full-fidelity engine INTENTIONALLY differs from the Solidity baseline
// (e.g. at conviction=50, consensusPct=0: full engine returns +7, baseline returns +10).
// The ONLY parity obligation here: SolidityScoreEngine == _solidityBaselineRepDelta.
//
// RED STATE (Plan 01): forge compilation FAILS because SolidityScoreEngine.sol
// does not yet exist. GREEN comes in Plan 03 when the contract is created.
//
// Acceptance criteria verified per 05-01-PLAN.md:
//   - 1 pragma pin, 8 test functions, 0 full-fidelity-engine mentions (D-4 guard)

import { Test } from "forge-std/Test.sol";
import { SolidityScoreEngine } from "../src/SolidityScoreEngine.sol";
import { IStylusScoreEngine } from "../src/interfaces/IStylusScoreEngine.sol";
import { RevertingStylusEngine } from "../src/RevertingStylusEngine.sol";

/// @title SolidityScoreEngineTest
/// @notice Parity tests asserting SolidityScoreEngine output == inline baseline math.
///         Also tests interface compliance (IStylusScoreEngine) and reverting fixture.
contract SolidityScoreEngineTest is Test {
    SolidityScoreEngine internal engine;

    function setUp() public {
        engine = new SolidityScoreEngine();
    }

    /// @notice Inline of SettlementManager._solidityBaselineRepDelta math.
    /// Private in SM → inlined here to avoid test-harness constructor complexity (Option 2).
    /// MATH MUST MATCH _solidityBaselineRepDelta EXACTLY (REP-24).
    function _baseline(uint8 conviction, bool isWinner) internal pure returns (int32) {
        uint256 scaled = (uint256(10) * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1;
        return isWinner ? int32(int256(scaled)) : -int32(int256(scaled));
    }

    // ─── REP-24 parity: SolidityScoreEngine output == _solidityBaselineRepDelta ─

    /// @notice conviction=50, winner: (10*50*2)/100=10 → int32(10)
    function test_parity_conviction50_winner() public view {
        assertEq(
            engine.compute_rep_change(0, 50, 0, true, 10),
            _baseline(50, true),
            "REP-24: conviction=50 winner parity"
        );
    }

    /// @notice conviction=100, winner: (10*100*2)/100=20 → int32(20)
    function test_parity_conviction100_winner() public view {
        assertEq(
            engine.compute_rep_change(0, 100, 0, true, 10),
            _baseline(100, true),
            "REP-24: conviction=100 winner parity"
        );
    }

    /// @notice conviction=50, loser: -(10*50*2)/100=-10 → int32(-10)
    function test_parity_conviction50_loser() public view {
        assertEq(
            engine.compute_rep_change(0, 50, 0, false, 10),
            _baseline(50, false),
            "REP-24: conviction=50 loser parity"
        );
    }

    /// @notice conviction=1, floor: (10*1*2)/100=0 → floor to 1
    function test_parity_conviction1_floor() public view {
        assertEq(
            engine.compute_rep_change(0, 1, 0, true, 10),
            int32(1),
            "REP-24: floor test -- conviction=1 winner must return +1 not 0"
        );
    }

    /// @notice conviction=90, winner: (10*90*2)/100=18 → int32(18)
    function test_parity_conviction90_winner() public view {
        assertEq(
            engine.compute_rep_change(0, 90, 0, true, 10),
            _baseline(90, true),
            "REP-24: conviction=90 winner parity"
        );
    }

    // ─── Interface compliance: callable via IStylusScoreEngine ─────────────────

    /// @notice compute_rep_change is callable via the IStylusScoreEngine interface.
    ///         The selector 0xff540eb6 must match for the SettlementManager try/catch seam.
    function test_interface_compliance() public view {
        IStylusScoreEngine iface = IStylusScoreEngine(address(engine));
        int32 delta = iface.compute_rep_change(100, 50, 50, true, 10);
        assertTrue(delta > 0, "IStylusScoreEngine view call must return positive delta for winner");
    }

    // ─── D-3: baseline ignores consensusPct ────────────────────────────────────

    /// @notice SolidityScoreEngine ignores consensusPct (baseline fidelity: contrarian=1.0 fixed).
    ///         compute_rep_change(0, 50, 0, true, 10) == compute_rep_change(0, 50, 100, true, 10).
    function test_consensuspct_ignored_by_baseline() public view {
        int32 deltaLow  = engine.compute_rep_change(0, 50,   0, true, 10);
        int32 deltaHigh = engine.compute_rep_change(0, 50, 100, true, 10);
        assertEq(
            deltaLow, deltaHigh,
            "D-3: SolidityScoreEngine baseline must ignore consensusPct (contrarian=1.0 fixed)"
        );
    }

    // ─── RevertingStylusEngine: SAFETY-42 pre-check ────────────────────────────

    /// @notice RevertingStylusEngine intentionally reverts on compute_rep_change.
    ///         Verifies the SAFETY-42 Phase 6 drill fixture is correctly wired.
    ///         vm.expectRevert() pattern from ChallengeEscrowGates.t.sol.
    function test_reverting_engine_reverts() public {
        RevertingStylusEngine revertingEngine = new RevertingStylusEngine();
        vm.expectRevert();
        IStylusScoreEngine(address(revertingEngine)).compute_rep_change(0, 50, 50, true, 10);
    }
}
