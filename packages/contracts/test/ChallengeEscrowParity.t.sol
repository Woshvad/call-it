// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.3 — Foundry-side parity with Vitest challenge-gates.test.ts
// Requirement: SOCIAL-29, SOCIAL-31, SOCIAL-32, SOCIAL-34
//
// RED GATE: This file WILL fail to compile until Plan 03-02 creates
//   packages/contracts/src/ChallengeEscrow.sol
// That compile failure is the expected Wave 1 RED gate. Do not fix the import.
//
// These test names mirror challenge-gates.test.ts EXACTLY so diffs between
// Solidity and TypeScript gate logic are immediately visible.

import { Test } from "forge-std/Test.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";    // <-- RED GATE: file does not exist yet
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { CeTestHelper } from "./helpers/CeTestHelper.sol";

/// @title ChallengeEscrowParity
/// @notice Mirrors challenge-gates.test.ts Vitest parity checks.
///         Test names must match the Vitest describe/it strings for cross-reference.
///
///         Run (after Plan 03-02 GREEN gate):
///           forge test --match-contract ChallengeEscrowParity -v
contract ChallengeEscrowParity is CeTestHelper {
    // ─── Internal helper ──────────────────────────────────────────────────────

    /// @notice Create a call with openToChallenges=false.
    function _seedPoolClosed(address caller, uint96 stake) internal returns (uint256 callId) {
        usdc.mint(caller, stake + 10e6);
        vm.prank(caller);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),
            0,
            3000e6,
            uint64(block.timestamp + 7 days),
            stake,
            50,
            bytes32(0),
            false, // openToChallenges = false
            0
        );
    }
    // ─── Stake bounds (mirrors Vitest: "stake bounds" describe block) ─────────

    /// @notice stakeBelowMinimum: 4_999_999 micros (< $5) is rejected. SOCIAL-03.
    function test_stakeBelowMinimum() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.StakeBelowMinimum.selector);
        ce.proposeChallenge(callId, 4_999_999);
    }

    /// @notice stakeAtMinimum: exactly $5 USDC (5_000_000 micros) is accepted.
    function test_stakeAtMinimum() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);

        // Should succeed — no revert expected
        vm.prank(challenger);
        ce.proposeChallenge(callId, 5_000_000);

        IChallengeEscrow.Challenge memory c = ce.getChallenge(1);
        assertEq(c.challengerStake, 5_000_000, "challengerStake at minimum");
    }

    /// @notice stakeAboveMaximum: 100_000_001 micros (> $100) is rejected. SOCIAL-04.
    function test_stakeAboveMaximum() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);
        usdc.mint(challenger, MAX_STAKE + 2);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.StakeAboveMaximum.selector);
        ce.proposeChallenge(callId, 100_000_001);
    }

    /// @notice stakeAtMaximum: exactly $100 USDC (100_000_000 micros) is accepted.
    function test_stakeAtMaximum() public {
        uint256 callId = _seedPool(alice, MAX_STAKE);

        vm.prank(challenger);
        ce.proposeChallenge(callId, 100_000_000);

        IChallengeEscrow.Challenge memory c = ce.getChallenge(1);
        assertEq(c.challengerStake, 100_000_000, "challengerStake at maximum");
    }

    // ─── Self-challenge (mirrors Vitest: "selfChallengeDetected") ───────────

    /// @notice selfChallengeDetected: caller == challenger address reverts SelfChallenge. SOCIAL-32.
    function test_selfChallengeDetected() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);

        vm.prank(alice); // alice is the call creator — proposing self-challenge
        vm.expectRevert(IChallengeEscrow.SelfChallenge.selector);
        ce.proposeChallenge(callId, MIN_STAKE);
    }

    // ─── openToChallenges flag (mirrors Vitest: "openToChallengesFlag") ─────

    /// @notice openToChallengesFlag: false flag → CallerNotOpenToChallenges. SOCIAL-29.
    function test_openToChallengesFlag_false() public {
        // Create a call with openToChallenges=false — challenger cannot propose
        uint256 callId = _seedPoolClosed(alice, MIN_STAKE);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.CallerNotOpenToChallenges.selector);
        ce.proposeChallenge(callId, MIN_STAKE);
    }

    // ─── Acceptance window (mirrors Vitest: "windowExpired" / "windowValid") ─

    /// @notice windowExpired: proposedAt > 24h ago → AcceptanceWindowExpired. SOCIAL-34.
    function test_windowExpired() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);
        _proposeChallenge(challenger, callId, MIN_STAKE);

        // Advance past the 24h window
        vm.warp(block.timestamp + CHALLENGE_ACCEPTANCE_WINDOW + 1);

        vm.prank(alice);
        vm.expectRevert(IChallengeEscrow.AcceptanceWindowExpired.selector);
        ce.acceptChallenge(1);
    }

    /// @notice windowValid: proposedAt within 24h → acceptChallenge succeeds.
    function test_windowValid() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);
        _proposeChallenge(challenger, callId, MIN_STAKE);

        // Still within the 24h window (no warp)
        vm.prank(alice);
        ce.acceptChallenge(1); // must not revert

        IChallengeEscrow.Challenge memory c = ce.getChallenge(1);
        assertEq(uint8(c.status), uint8(IChallengeEscrow.ChallengeStatus.Accepted));
    }
}
