// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.3 — ChallengeEscrow gate/revert test matrix
// Requirement: SOCIAL-29..39, D-04
//
// RED GATE: This file WILL fail to compile until Plan 03-02 creates
//   packages/contracts/src/ChallengeEscrow.sol
// That compile failure is the expected Wave 1 RED gate. Do not fix the import.

import { Test } from "forge-std/Test.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";    // <-- RED GATE: file does not exist yet
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { CeTestHelper } from "./helpers/CeTestHelper.sol";

/// @title ChallengeEscrowGates
/// @notice Revert / gate tests for every SOCIAL-29..39 condition.
///
///         Run (after Plan 03-02 GREEN gate):
///           forge test --match-contract ChallengeEscrowGates -v
contract ChallengeEscrowGates is CeTestHelper {
    // ─── Internal helper ──────────────────────────────────────────────────────

    /// @notice Create a call with openToChallenges=false (closed to challenges).
    ///         Uses createCall directly since _seedPool hardcodes openToChallenges=true.
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

    // ─── SOCIAL-29: CallerNotOpenToChallenges ─────────────────────────────────

    /// @notice testProposeRevertsNotOpen: proposeChallenge reverts when openToChallenges=false.
    function testProposeRevertsNotOpen() public {
        // Create a call that is NOT open to challenges
        uint256 callId = _seedPoolClosed(alice, 20e6);

        // Challenger tries to propose — must revert CallerNotOpenToChallenges
        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.CallerNotOpenToChallenges.selector);
        ce.proposeChallenge(callId, 20e6);
    }

    // ─── SOCIAL-32: SelfChallenge ────────────────────────────────────────────

    /// @notice testSelfChallengeBanned: proposeChallenge by the call's own creator reverts.
    function testSelfChallengeBanned() public {
        uint256 callId = _seedPool(alice, 20e6);

        // alice is the caller of callId — self-challenge must revert
        vm.prank(alice);
        vm.expectRevert(IChallengeEscrow.SelfChallenge.selector);
        ce.proposeChallenge(callId, 20e6);
    }

    // ─── SOCIAL-33: CallNotChallengeable ─────────────────────────────────────

    /// @notice testChallengeNotLive: proposeChallenge on an expired call reverts.
    function testChallengeNotLive() public {
        // Seed a call expiring in 1 hour
        uint256 callId = _seedPool(alice, 20e6, uint64(block.timestamp + 1 hours));

        // Warp past expiry
        vm.warp(block.timestamp + 2 hours);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.CallNotChallengeable.selector);
        ce.proposeChallenge(callId, 20e6);
    }

    // ─── SOCIAL-34: AcceptanceWindowExpired ──────────────────────────────────

    /// @notice testWindowExpired: acceptChallenge after 24h window reverts.
    function testWindowExpired() public {
        uint256 callId = _seedPool(alice, 20e6);
        _proposeChallenge(challenger, callId, 20e6);
        uint256 challengeId = 1;

        // Warp past the 24h acceptance window
        vm.warp(block.timestamp + CHALLENGE_ACCEPTANCE_WINDOW + 1);

        vm.prank(alice);
        vm.expectRevert(IChallengeEscrow.AcceptanceWindowExpired.selector);
        ce.acceptChallenge(challengeId);
    }

    // ─── D-04: 3-way TVL cap ─────────────────────────────────────────────────

    /// @notice testTvlCap3Way: propose that would push combined 3-way TVL over cap reverts.
    function testTvlCap3Way() public {
        // Set TVL cap extremely low to make the boundary easy to hit
        // CR.currentTvl + FFM.getTvl() + ChallengeEscrow.getTvl() > cap → revert
        uint256 callId = _seedPool(alice, 20e6);

        // Lower the TVL cap to just above current combined TVL
        uint256 currentCombined = registry.currentTvl() + ffm.getTvl() + ce.getTvl();
        vm.prank(owner);
        registry.setTvlCap(currentCombined); // cap = exactly current combined; next propose overflows

        // Any proposeChallenge with stake > 0 must now revert TvlCapReached
        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(IChallengeEscrow.TvlCapReached.selector, MIN_STAKE, uint256(0)));
        ce.proposeChallenge(callId, MIN_STAKE);
    }

    /// @notice testTvlCap3Way_acceptReverts: acceptChallenge that pushes combined TVL over cap reverts.
    function testTvlCap3Way_acceptReverts() public {
        // Seed call and propose at MIN_STAKE; then tighten cap before accept
        uint256 callId = _seedPool(alice, MIN_STAKE);
        _proposeChallenge(challenger, callId, MIN_STAKE);
        uint256 challengeId = 1;

        // Tighten cap to current combined (before accept adds callerStake)
        uint256 currentCombined = registry.currentTvl() + ffm.getTvl() + ce.getTvl();
        vm.prank(owner);
        registry.setTvlCap(currentCombined);

        // Accept now exceeds cap
        vm.prank(alice);
        vm.expectRevert(); // TvlCapReached
        ce.acceptChallenge(challengeId);
    }

    // ─── Stake bound gates ────────────────────────────────────────────────────

    /// @notice testStakeBelowMinimum: stake < $5 USDC reverts StakeBelowMinimum.
    function testStakeBelowMinimum() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.StakeBelowMinimum.selector);
        ce.proposeChallenge(callId, MIN_STAKE - 1);
    }

    /// @notice testStakeAboveMaximum: stake > $100 USDC reverts StakeAboveMaximum.
    function testStakeAboveMaximum() public {
        uint256 callId = _seedPool(alice, MIN_STAKE);

        // Mint extra USDC for challenger so the stake bound, not balance, is the gate
        usdc.mint(challenger, MAX_STAKE + 1);

        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.StakeAboveMaximum.selector);
        ce.proposeChallenge(callId, MAX_STAKE + 1);
    }

    // ─── Claim gates ─────────────────────────────────────────────────────────

    /// @notice testClaimRefundBeforeWindow: claimRefund before 24h window reverts.
    function testClaimRefundBeforeWindow() public {
        uint256 callId = _seedPool(alice, 20e6);
        _proposeChallenge(challenger, callId, 20e6);
        uint256 challengeId = 1;

        // Still within window — claimRefund must revert
        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.ClaimRefundNotAvailable.selector);
        ce.claimRefund(challengeId);
    }

    /// @notice testClaimPayoutBeforeSettle: claimDuelPayout before settleDuel reverts.
    function testClaimPayoutBeforeSettle() public {
        uint256 callId = _seedPool(alice, 20e6);
        _proposeChallenge(challenger, callId, 20e6);
        uint256 challengeId = 1;

        vm.prank(alice);
        ce.acceptChallenge(challengeId);

        // Not yet settled
        vm.prank(challenger);
        vm.expectRevert(IChallengeEscrow.ChallengeNotSettled.selector);
        ce.claimDuelPayout(challengeId);
    }

    /// @notice testSettleDuelUnauthorized: settleDuel by non-manager reverts NotSettlementManager.
    function testSettleDuelUnauthorized() public {
        uint256 callId = _seedPool(alice, 20e6);
        _proposeChallenge(challenger, callId, 20e6);
        uint256 challengeId = 1;

        vm.prank(alice);
        ce.acceptChallenge(challengeId);

        vm.prank(bob); // bob is not the settlement manager
        vm.expectRevert(IChallengeEscrow.NotSettlementManager.selector);
        ce.settleDuel(challengeId, challenger);
    }
}
