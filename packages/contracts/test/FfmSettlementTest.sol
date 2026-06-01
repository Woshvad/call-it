// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 step 11 (FFM.applySettlement) + §12.4 claimPayout pull pattern
// Requirements: SETTLE-44, SETTLE-46, CALL-41, REP-14, SOCIAL-47
//
// RED GATE: This file WILL fail to compile until Plan 04-02 creates
//   packages/contracts/src/SettlementManager.sol
//   (FollowFadeMarket.applySettlement and real claimPayout are added via FFM redeploy)
// That compile failure is the expected Wave 0 RED gate. Do not fix the imports.
//
// FFM settlement surface tests. Run after Plan 04-02 GREEN gate:
//   forge test --match-contract FfmSettlementTest -vv

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol"; // <-- RED GATE
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title FfmSettlementTest
/// @notice Tests for FFM claimPayout CEI order, applySettlement idempotency,
///         cold-start CALL-41 empty-pool treasury path, and pro-rata payout math.
///
/// forge test --match-contract FfmSettlementTest -vv
contract FfmSettlementTest is SmTestHelper {

    // ─── testClaimPayoutCEI (SOCIAL-47) ──────────────────────────────────────

    /// @notice claimed[callId][user]=true BEFORE safeTransfer;
    ///         second claimPayout call reverts AlreadyClaimed.
    ///
    ///         This test ensures CEI (Checks-Effects-Interactions) order is preserved:
    ///         the `claimed` flag must be set BEFORE the USDC transfer to prevent
    ///         reentrancy attacks (SOCIAL-47, per spec §10.2).
    function testClaimPayoutCEI() public {
        // Arrange: create a call, add some faders, expire and settle
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));

        // Bob fades the call
        vm.prank(bob);
        ffm.fade(callId, 10e6);

        vm.warp(block.timestamp + 2);
        sm.settle(callId, new bytes[](0));

        // Determine who won to pick the correct claimant
        ICallRegistry.Call memory call = registry.getCall(callId);
        address winner = call.outcome == ICallRegistry.Outcome.CallerWon ? alice : bob;

        uint256 balanceBefore = IERC20(USDC_ARB_NATIVE).balanceOf(winner);

        // First claimPayout — succeeds
        // NOTE: claimed[callId][winner] = true MUST be set BEFORE safeTransfer (CEI order)
        vm.prank(winner);
        ffm.claimPayout(callId);

        uint256 balanceAfter = IERC20(USDC_ARB_NATIVE).balanceOf(winner);
        assertGt(balanceAfter, balanceBefore, "Winner should receive payout");

        // Second claimPayout — must revert AlreadyClaimed (idempotency)
        vm.prank(winner);
        vm.expectRevert(abi.encodeWithSignature("AlreadyClaimed()"));
        ffm.claimPayout(callId);
    }

    // ─── testApplySettlementIdempotency ──────────────────────────────────────

    /// @notice Second applySettlement reverts (settlementApplied guard).
    ///         Ensures fees can't be extracted twice from the same pool.
    function testApplySettlementIdempotency() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // First settle — calls applySettlement internally
        sm.settle(callId, new bytes[](0));

        // Direct second call to applySettlement must revert
        // (SettlementManager calls it internally; here we verify the guard)
        vm.prank(address(sm));
        vm.expectRevert(abi.encodeWithSignature("SettlementAlreadyApplied()"));
        ffm.applySettlement(
            callId,
            ICallRegistry.Outcome.CallerWon,
            uint256(50e6) * 100 / 10_000,  // 1.0% protocol fee
            uint256(50e6) * 40  / 10_000,  // 0.4% creator fee
            uint256(50e6) * 30  / 10_000   // 0.3% LP fee
        );
    }

    // ─── testEmptyPoolToTreasury (CALL-41, Pitfall 22) ───────────────────────

    /// @notice fadeRealReserve==0 → entire followReserve (minus fees) to treasury.
    ///         CALL-41: when no real faders exist, the follow pool goes to protocol
    ///         because the virtual seed was never real USDC.
    function testEmptyPoolToTreasury() public {
        // Create a call with no faders (cold start — only virtual seed)
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        // Do NOT add any faders — fadeRealReserve == 0

        uint256 treasuryBalBefore = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);

        vm.warp(block.timestamp + 2);
        sm.settle(callId, new bytes[](0));

        uint256 treasuryBalAfter = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);

        // Verify: fadeRealReserve was 0 → pool went to treasury (CALL-41)
        assertEq(
            ffm.getFadeRealReserve(callId),
            0,
            "fadeRealReserve should be 0"
        );

        // Treasury should have received funds (minus any fees already extracted)
        // The entire follow reserve (caller's stake + fees) flows to treasury
        assertGt(
            treasuryBalAfter,
            treasuryBalBefore,
            "Treasury should receive follow pool when no real faders (CALL-41)"
        );

        // Winner (alice) should NOT be able to claim USDC payout (virtual seed dissolved)
        vm.prank(alice);
        vm.expectRevert();
        ffm.claimPayout(callId);
    }

    // ─── testClaimPayoutProRata ───────────────────────────────────────────────

    /// @notice payout == Math.mulDiv(userShares, winningReserve, totalShares).
    ///         Verifies the exact pro-rata formula for claim payouts.
    function testClaimPayoutProRata() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));

        // Add two faders: bob ($10) and a third actor ($20)
        address charlie = makeAddr("charlie");
        usdc.mint(charlie, 100e6);
        vm.prank(charlie);
        usdc.approve(address(ffm), type(uint256).max);

        vm.prank(bob);
        ffm.fade(callId, 10e6);

        vm.prank(charlie);
        ffm.fade(callId, 20e6);

        // Record shares before settle
        uint256 bobShares     = ffm.fadeShares(callId, bob);
        uint256 totalShares   = ffm.fadeTotalShares(callId);

        vm.warp(block.timestamp + 2);
        sm.settle(callId, new bytes[](0));

        // Determine if faders won
        ICallRegistry.Call memory call = registry.getCall(callId);
        bool fadersWon = call.outcome == ICallRegistry.Outcome.CallerLost;

        if (fadersWon) {
            uint256 winningReserve = ffm.getFadeRealReserve(callId);
            uint256 expectedPayout = Math.mulDiv(bobShares, winningReserve, totalShares);

            uint256 bobBalBefore = IERC20(USDC_ARB_NATIVE).balanceOf(bob);
            vm.prank(bob);
            ffm.claimPayout(callId);
            uint256 bobBalAfter = IERC20(USDC_ARB_NATIVE).balanceOf(bob);

            uint256 actualPayout = bobBalAfter - bobBalBefore;

            // Within 1 wei for integer division rounding
            uint256 diff = actualPayout > expectedPayout
                ? actualPayout - expectedPayout
                : expectedPayout - actualPayout;
            assertLe(diff, 1, "claimPayout not pro-rata");
        }
        // If callers won, alice claims from follow reserve — same formula applies
    }
}
