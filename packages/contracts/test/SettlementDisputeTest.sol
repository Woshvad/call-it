// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §13.7–13.8 — Dispute window ($5 bond, 24h, max 3 counter-claims)
// Requirements: SETTLE-25, SETTLE-26, SETTLE-27, SETTLE-28, SETTLE-29, SETTLE-30,
//               SETTLE-34, SETTLE-39
//
// RED GATE: This file WILL fail to compile until Plan 04-02 creates
//   packages/contracts/src/SettlementManager.sol
// That compile failure is the expected Wave 0 RED gate. Do not fix the imports.
//
// Dispute system tests. Run after Plan 04-02 GREEN gate:
//   forge test --match-contract SettlementDisputeTest -vv

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol"; // <-- RED GATE

/// @title SettlementDisputeTest
/// @notice Tests for the full dispute system: bond taken, window closed revert,
///         max counter-claims, USDC reversal on owner resolve, forceSettle cooldown.
///
/// forge test --match-contract SettlementDisputeTest -vv
contract SettlementDisputeTest is SmTestHelper {

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /// @notice Set up a settled call ready for dispute.
    ///         Returns (callId) with outcome recorded.
    function _setupSettledCall() internal returns (uint256 callId) {
        callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));

        // Add bob as a fader so there's a non-trivial pool
        vm.prank(bob);
        ffm.fade(callId, 20e6);

        vm.warp(block.timestamp + 2);
        sm.settle(callId, new bytes[](0));
    }

    // ─── testDisputeBondTaken (SETTLE-25, SETTLE-26) ─────────────────────────

    /// @notice raiseDispute transfers exactly $5 USDC bond from disputer to SettlementManager.
    function testDisputeBondTaken() public {
        uint256 callId = _setupSettledCall();

        // Fund a disputer with USDC for the bond
        address disputer = makeAddr("disputer");
        usdc.mint(disputer, 100e6);
        vm.prank(disputer);
        usdc.approve(address(sm), type(uint256).max);

        uint256 smBalBefore       = IERC20(USDC_ARB_NATIVE).balanceOf(address(sm));
        uint256 disputerBalBefore = IERC20(USDC_ARB_NATIVE).balanceOf(disputer);

        // raiseDispute takes $5 USDC bond (SETTLE-25)
        vm.prank(disputer);
        sm.raiseDispute(callId, "ipfs://evidence-hash");

        uint256 smBalAfter       = IERC20(USDC_ARB_NATIVE).balanceOf(address(sm));
        uint256 disputerBalAfter = IERC20(USDC_ARB_NATIVE).balanceOf(disputer);

        // Exactly $5 USDC transferred (SETTLE-26: bond amount)
        assertEq(
            smBalAfter - smBalBefore,
            DISPUTE_BOND,
            "SettlementManager should hold $5 USDC bond"
        );
        assertEq(
            disputerBalBefore - disputerBalAfter,
            DISPUTE_BOND,
            "Disputer should pay exactly $5 USDC bond"
        );
    }

    // ─── testDisputeWindowClosed (SETTLE-29) ─────────────────────────────────

    /// @notice raiseDispute after 24h window reverts DisputeWindowClosed.
    function testDisputeWindowClosed() public {
        uint256 callId = _setupSettledCall();

        // Warp past the 24h dispute window
        vm.warp(block.timestamp + DISPUTE_WINDOW + 1);

        address disputer = makeAddr("disputer");
        usdc.mint(disputer, 100e6);
        vm.prank(disputer);
        usdc.approve(address(sm), type(uint256).max);

        // Must revert: dispute window is closed (SETTLE-29)
        vm.prank(disputer);
        vm.expectRevert(ISettlementManager.DisputeWindowClosed.selector);
        sm.raiseDispute(callId, "ipfs://late-evidence");
    }

    // ─── testMaxCounterClaims (SETTLE-30) ────────────────────────────────────

    /// @notice 4th counter-claim reverts MaxCounterClaimsReached.
    ///         MAX_COUNTER_CLAIMS=3 (spec §13.7).
    function testMaxCounterClaims() public {
        uint256 callId = _setupSettledCall();

        // Raise initial dispute
        address disputer = makeAddr("disputer");
        usdc.mint(disputer, 1000e6);
        vm.prank(disputer);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(disputer);
        sm.raiseDispute(callId, "ipfs://evidence-0");

        // Counter-claim 1
        address counter1 = makeAddr("counter1");
        usdc.mint(counter1, 100e6);
        vm.prank(counter1);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(counter1);
        sm.counterClaim(callId, "ipfs://counter-1");

        // Counter-claim 2
        address counter2 = makeAddr("counter2");
        usdc.mint(counter2, 100e6);
        vm.prank(counter2);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(counter2);
        sm.counterClaim(callId, "ipfs://counter-2");

        // Counter-claim 3
        address counter3 = makeAddr("counter3");
        usdc.mint(counter3, 100e6);
        vm.prank(counter3);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(counter3);
        sm.counterClaim(callId, "ipfs://counter-3");

        // Counter-claim 4 — must revert MaxCounterClaimsReached (SETTLE-30)
        address counter4 = makeAddr("counter4");
        usdc.mint(counter4, 100e6);
        vm.prank(counter4);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(counter4);
        vm.expectRevert(ISettlementManager.MaxCounterClaimsReached.selector);
        sm.counterClaim(callId, "ipfs://counter-4");
    }

    // ─── testDisputeReversal (SETTLE-34) ─────────────────────────────────────

    /// @notice resolveDispute(callId, oppOutcome) re-distributes USDC from
    ///         old-winner → new-winner and reverses rep.
    ///         SETTLE-34: pool redistribution on owner-resolved reversal.
    function testDisputeReversal() public {
        uint256 callId = _setupSettledCall();

        // Record who won initially
        ICallRegistry.Call memory call = registry.getCall(callId);
        ICallRegistry.Outcome initialOutcome = call.outcome;
        ICallRegistry.Outcome reversedOutcome = initialOutcome == ICallRegistry.Outcome.CallerWon
            ? ICallRegistry.Outcome.CallerLost
            : ICallRegistry.Outcome.CallerWon;

        // Raise a dispute
        address disputer = makeAddr("disputer");
        usdc.mint(disputer, 100e6);
        vm.prank(disputer);
        usdc.approve(address(sm), type(uint256).max);
        vm.prank(disputer);
        sm.raiseDispute(callId, "ipfs://dispute-evidence");

        // Record balances before reversal
        // old-winner (alice if CallerWon, bob if CallerLost)
        address oldWinner = initialOutcome == ICallRegistry.Outcome.CallerWon ? alice : bob;
        address newWinner = initialOutcome == ICallRegistry.Outcome.CallerWon ? bob : alice;
        uint256 newWinnerRepBefore = profileRegistry.getProfile(newWinner).repScore;

        // Owner resolves dispute with reversed outcome (SETTLE-34)
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit ISettlementManager.DisputeResolved(callId, reversedOutcome, owner);
        sm.resolveDispute(callId, reversedOutcome);

        // Post-resolution assertions
        call = registry.getCall(callId);
        assertEq(
            uint8(call.outcome),
            uint8(reversedOutcome),
            "Outcome should be reversed after resolveDispute"
        );

        // New winner's rep should have increased (reversal applied)
        uint256 newWinnerRepAfter = profileRegistry.getProfile(newWinner).repScore;
        assertGe(
            newWinnerRepAfter,
            newWinnerRepBefore,
            "New winner rep should be >= before on reversal"
        );
    }

    // ─── testForceSettleAfterDispute (SETTLE-39) ──────────────────────────────

    /// @notice forceSettle is callable only after FORCE_SETTLE_COOLDOWN=7 days.
    ///         Even after a dispute is raised, forceSettle respects the cooldown.
    function testForceSettleAfterDispute() public {
        // Create a call that hasn't been settled yet (forceSettle scenario)
        uint256 expiry = block.timestamp + 1;
        uint256 callId = _seedPool(alice, 50e6, uint64(expiry));

        vm.warp(expiry + 1);

        // Attempt forceSettle at 3 days — still inside cooldown
        vm.warp(expiry + 3 days);
        vm.prank(owner);
        vm.expectRevert(ISettlementManager.ForceSettleCooldownActive.selector);
        sm.forceSettle(callId);

        // Warp to exactly FORCE_SETTLE_COOLDOWN+1 — now allowed
        vm.warp(expiry + FORCE_SETTLE_COOLDOWN + 1);
        vm.prank(owner);
        sm.forceSettle(callId); // Should not revert

        // Call should now be settled
        ICallRegistry.Call memory call = registry.getCall(callId);
        assertNotEq(
            uint8(call.status),
            uint8(ICallRegistry.CallStatus.Live),
            "Call should be settled after forceSettle"
        );
    }
}
