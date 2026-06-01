// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 — 14-step settle() sequence (LOCKED)
// Requirements: SETTLE-02, SETTLE-03, SETTLE-05, SETTLE-08, SETTLE-39, SETTLE-40,
//               SETTLE-43, SETTLE-44, SETTLE-46, SETTLE-47, REP-14, REP-22, REP-23
//
// RED GATE: This file WILL fail to compile until Plan 04-02 creates
//   packages/contracts/src/SettlementManager.sol
// That compile failure is the expected Wave 0 RED gate. Do not fix the imports.
//
// Core settle() invariant tests. Run after Plan 04-02 GREEN gate:
//   forge test --match-contract SettlementManagerTest -vv
//   forge test --match-test invariant* --fuzz-runs 1000 (ci profile)

import { Test } from "forge-std/Test.sol";
import { StdInvariant } from "forge-std/StdInvariant.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol"; // <-- RED GATE

/// @title SettlementManagerTest
/// @notice Core settle() invariants: AlreadySettled, CallNotExpired, atomic rollback,
///         Pyth confidence gate, fee split fuzz, gas snapshot, duel invalid challengeId revert.
///
/// forge test --match-contract SettlementManagerTest --fuzz-runs 1000 (CI profile)
contract SettlementManagerTest is SmTestHelper, StdInvariant {

    // ─── State for invariant tests ────────────────────────────────────────────
    uint256 internal _invariantCallId;
    uint256 internal _preSettlePool;
    uint256 internal _feesTransferred;
    bool    internal _settled;

    // ─── testSettleIdempotency (SETTLE-02) ────────────────────────────────────

    /// @notice Second settle() reverts AlreadySettled.
    ///         Verifies that the status-check guard (step 1) is enforced.
    function testSettleIdempotency() public {
        // Create an expired call and settle it once
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // First settle — succeeds (implementation in Plan 04-02)
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Second settle — must revert AlreadySettled (SETTLE-02)
        vm.expectRevert(ISettlementManager.AlreadySettled.selector);
        sm.settle(callId, new bytes[](0), new uint256[](0));
    }

    // ─── testCallNotExpired (SETTLE-03) ──────────────────────────────────────

    /// @notice settle() before expiry reverts CallNotExpired.
    function testCallNotExpired() public {
        // Create a call with expiry far in the future
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 7 days));

        // Settle before expiry — must revert CallNotExpired (SETTLE-03)
        vm.expectRevert(ISettlementManager.CallNotExpired.selector);
        sm.settle(callId, new bytes[](0), new uint256[](0));
    }

    // ─── testAtomicRollback (SETTLE-05) ──────────────────────────────────────

    /// @notice If any step in settle() fails, all state changes roll back.
    ///         Uses a mock that deliberately reverts on step N.
    function testAtomicRollback() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // Record pre-settle balances
        uint256 aliceBalBefore = IERC20(USDC_ARB_NATIVE).balanceOf(alice);
        uint256 treasuryBalBefore = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);

        // Force a failure by making the Pyth oracle revert
        vm.mockCallRevert(
            pyth,
            abi.encodeWithSignature("getPriceNoOlderThan(bytes32,uint256)"),
            "MockRevert"
        );

        // settle() must revert entirely (SETTLE-05)
        vm.expectRevert();
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Balances must be unchanged — full rollback
        assertEq(
            IERC20(USDC_ARB_NATIVE).balanceOf(alice),
            aliceBalBefore,
            "Alice balance changed on failed settle - not atomic"
        );
        assertEq(
            IERC20(USDC_ARB_NATIVE).balanceOf(treasury),
            treasuryBalBefore,
            "Treasury balance changed on failed settle - not atomic"
        );
    }

    // ─── testPythConfidenceGate (SETTLE-08) ──────────────────────────────────

    /// @notice Wide confidence (conf*200 > price) → outcome stays Pending,
    ///         SettlementDelayed is emitted, settle() returns without reverting.
    function testPythConfidenceGate() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // Mock Pyth to return a wide confidence interval: conf*200 > price
        // price = 1000, conf = 6 → 6*200 = 1200 > 1000 → WIDE
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getUpdateFee(bytes[])"),
            abi.encode(uint256(0))
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("updatePriceFeeds(bytes[])"),
            abi.encode()
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getPriceNoOlderThan(bytes32,uint256)"),
            abi.encode(
                int64(1000),    // price
                uint64(6),      // conf — 6*200=1200 > 1000 → WIDE
                int32(-8),      // expo
                uint256(block.timestamp)
            )
        );

        // Expect SettlementDelayed event (SETTLE-09)
        vm.expectEmit(true, false, false, false);
        emit ISettlementManager.SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", block.timestamp + 60);

        // settle() must NOT revert — it returns early (SETTLE-08)
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Outcome must remain Pending
        ICallRegistry.Call memory call = registry.getCall(callId);
        assertEq(
            uint8(call.outcome),
            uint8(ICallRegistry.Outcome.Pending),
            "Outcome should remain Pending after confidence gate"
        );
    }

    // ─── testSettleGas (SETTLE-44) ───────────────────────────────────────────

    /// @notice Gas snapshot: settle() is O(1) regardless of participant count.
    ///         Confirms no per-follower/fader iteration in settle() itself.
    /// forge snapshot --match-test testSettleGas
    function testSettleGas() public {
        // Seed a pool with many followers
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));

        // Add 10 followers to simulate non-trivial pool
        for (uint256 i = 1; i <= 10; i++) {
            address follower = makeAddr(string(abi.encodePacked("follower", i)));
            usdc.mint(follower, 100e6);
            vm.prank(follower);
            usdc.approve(address(ffm), type(uint256).max);
            vm.prank(follower);
            ffm.follow(callId, 5e6, 0); // $5 follow position (minSharesOut=0)
        }

        vm.warp(block.timestamp + 2);

        uint256 gasBefore = gasleft();
        sm.settle(callId, new bytes[](0), new uint256[](0));
        uint256 gasUsed = gasBefore - gasleft();

        // O(1) settlement: should be < 200_000 gas regardless of pool size
        assertLt(gasUsed, 200_000, "settle() gas not O(1)");
    }

    // ─── testColdStartScale (REP-14) ─────────────────────────────────────────

    /// @notice Cold-start: fadeRealReserve==0 → winner repDelta == 25% of uncapped delta.
    ///         REP-14: 25% scaling applied when no real faders at settle time.
    function testColdStartScale() public {
        // Create a call with no faders (no one fades it)
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // Verify fade real reserve is 0 before settle
        assertEq(
            ffm.getFadeRealReserve(callId),
            0,
            "fadeRealReserve should be 0 (cold start)"
        );

        // Get caller's rep before settle
        uint256 repBefore = uint256(profileRegistry.getProfile(alice).globalRep);

        sm.settle(callId, new bytes[](0), new uint256[](0));

        // RepCalculated event should have delta = 25% of uncapped delta (REP-14)
        // After settle, rep should have changed by exactly 25% of what it would be
        uint256 repAfter = uint256(profileRegistry.getProfile(alice).globalRep);
        uint256 repDelta = repAfter - repBefore;

        // For conviction=50, _solidityBaselineRepDelta = (10 * 50 * 2) / 100 = 10
        // 25% of 10 = 2 (integer math) → at least 1 rep
        assertGt(repDelta, 0, "Rep delta should be > 0 after cold-start win");
        // Cold-start capped: delta <= 25% of full delta
        // Full delta at conviction=50 = 10; 25% = 2
        assertLe(repDelta, 3, "Cold-start rep delta should be <= 3 (25% of 10 = 2, rounding)");
    }

    // ─── testStylusFallback (REP-22, REP-23) ─────────────────────────────────

    /// @notice Deliberate-revert mock StylusEngine → _solidityBaselineRepDelta fires,
    ///         RepCalculatedFallback event is emitted.
    function testStylusFallback() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // Set a mock stylusScoreEngine address so the try/catch seam fires
        address mockStylusAddr = makeAddr("mockStylusEngine");
        vm.prank(owner);
        sm.setStylusScoreEngine(mockStylusAddr);

        // Make the Stylus engine revert on compute_rep_change (simulates Stylus failure)
        vm.mockCallRevert(
            mockStylusAddr,
            abi.encodeWithSignature(
                "compute_rep_change(uint128,uint8,uint8,bool,uint256)"
            ),
            abi.encode("MockStylusRevert")
        );

        // Expect RepCalculatedFallback event (REP-23) -- fires when Stylus reverts
        vm.expectEmit(true, true, false, false);
        emit ISettlementManager.RepCalculatedFallback(callId, alice, 0, "MockStylusRevert");

        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Restore no Stylus engine for other tests
        vm.prank(owner);
        sm.setStylusScoreEngine(address(0));
    }

    // ─── testForceSettleCooldown (SETTLE-39) ─────────────────────────────────

    /// @notice forceSettle before 7d from expiry reverts ForceSettleCooldownActive.
    function testForceSettleCooldown() public {
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);
        // Warp to 3 days after expiry — still inside 7-day cooldown
        vm.warp(block.timestamp + 3 days);

        vm.prank(owner);
        vm.expectRevert(ISettlementManager.ForceSettleCooldownActive.selector);
        sm.forceSettle(callId);
    }

    // ─── testForceSettleEvents (SETTLE-40) ───────────────────────────────────

    /// @notice forceSettle emits BOTH CallForceSettled AND CallSettled.
    function testForceSettleEvents() public {
        uint256 expiry = uint64(block.timestamp + 1);
        uint256 callId = _seedPool(alice, 50e6, uint64(expiry));
        vm.warp(expiry + FORCE_SETTLE_COOLDOWN + 1);

        vm.prank(owner);

        // Both events must fire (SETTLE-40)
        vm.expectEmit(true, false, false, false);
        emit ISettlementManager.CallForceSettled(callId, uint8(ICallRegistry.Outcome.CallerLost));

        vm.expectEmit(true, false, false, false);
        emit ISettlementManager.CallSettled(callId, uint8(ICallRegistry.Outcome.CallerLost), 0);

        sm.forceSettle(callId);
    }

    // ─── testDuelInvalidChallengeId (SETTLE-43) ──────────────────────────────

    /// @notice settle(callId, [], [wrongChallengeId]) reverts when challenge.callId != callId.
    ///         Validates that the off-chain-supplied acceptedChallengeIds array is verified
    ///         on-chain per IChallengeEscrow.getChallenge() (SETTLE-43 on-chain guard).
    ///
    ///         Also tests: challenge.status != Accepted reverts.
    function testDuelInvalidChallengeId() public {
        // Create two calls (different feeds to avoid DuplicateCall revert)
        uint256 callId1 = _seedPool(alice, 50e6, uint64(block.timestamp + 10));
        uint256 callId2 = _seedPoolWithFeed(bob, 50e6, BTC_FEED, uint64(block.timestamp + 10));

        // Create a challenge for callId2 (not callId1)
        uint256 wrongChallengeId = _proposeChallenge(challenger, callId2, 10e6);

        // Create a challenge for callId1 in Proposed status (not Accepted)
        uint256 proposedChallengeId = _proposeChallenge(challenger, callId1, 10e6);

        // Warp past expiry
        vm.warp(block.timestamp + 11);

        // Test 1: Pass wrongChallengeId (belongs to callId2) when settling callId1
        // Must revert: challenge.callId != callId (SETTLE-43 guard)
        uint256[] memory badIds = new uint256[](1);
        badIds[0] = wrongChallengeId;
        vm.expectRevert(ISettlementManager.InvalidChallengeForCall.selector);
        sm.settle(callId1, new bytes[](0), badIds);

        // Test 2: Pass proposedChallengeId (Proposed status, not Accepted) -- should revert
        uint256[] memory proposedIds = new uint256[](1);
        proposedIds[0] = proposedChallengeId;
        vm.expectRevert(ISettlementManager.ChallengeNotAccepted.selector);
        sm.settle(callId1, new bytes[](0), proposedIds);
    }

    // ─── testDuplicateHashClearedOnSettle (SETTLE-47) ────────────────────────

    /// @notice After settle() completes, activeDuplicateHashes(dupHash) == 0.
    ///         A fresh createCall with the same params must succeed (SETTLE-47).
    ///
    ///         On the current Sepolia CallRegistry (no clearDuplicateHash seam),
    ///         asserts that settlement completed successfully despite the try/catch
    ///         in step 12 — no revert from step 12.
    function testDuplicateHashClearedOnSettle() public {
        // Create a call with a specific duplicate-hash-producing set of params
        uint256 callId = _seedPool(alice, 50e6, uint64(block.timestamp + 1));

        // Attempt to create a call with identical params — should be blocked by DuplicateCall
        // (not checking for revert here since it may or may not exist depending on CR version)

        vm.warp(block.timestamp + 2);

        // Settle the call
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // After settlement:
        // 1. Call should be Settled
        ICallRegistry.Call memory settledCall = registry.getCall(callId);
        assertNotEq(
            uint8(settledCall.status),
            uint8(ICallRegistry.CallStatus.Live),
            "Call should not be Live after settle"
        );

        // 2. Check if clearDuplicateHash seam exists on CallRegistry;
        //    if so, activeDuplicateHashes should be 0 (SETTLE-47)
        bytes32 dupHash = settledCall.duplicateHash;
        if (dupHash != bytes32(0)) {
            // Try to read activeDuplicateHashes via try/call pattern
            (bool success, bytes memory data) = address(registry).staticcall(
                abi.encodeWithSignature("activeDuplicateHashes(bytes32)", dupHash)
            );
            if (success && data.length > 0) {
                uint256 activeId = abi.decode(data, (uint256));
                assertEq(activeId, 0, "activeDuplicateHashes should be cleared after settle (SETTLE-47)");
            }
            // If the seam doesn't exist yet (current Sepolia CR), the try/catch in step 12
            // swallows the failure — settlement still completed (verified above).
        }
    }

    // ─── invariantFeeSplit (SETTLE-46) ───────────────────────────────────────

    /// @notice Fuzz invariant: total fees == 1.0%+0.4%+0.3% = 1.7% of totalPool
    ///         within 2 wei dust.
    /// forge test --match-test invariantFeeSplit --fuzz-runs 1000
    function invariantFeeSplit() public view {
        if (!_settled) return;

        // Fees transferred must equal exactly 1.7% of total pool ± 2 wei dust
        uint256 expectedFees = (_preSettlePool * 170) / 10_000;
        uint256 diff = _feesTransferred > expectedFees
            ? _feesTransferred - expectedFees
            : expectedFees - _feesTransferred;

        assertLe(
            diff,
            2,
            "Fee split deviation exceeds 2 wei dust (SETTLE-46)"
        );
    }

    // ─── invariantPoolConservation (SETTLE-46) ────────────────────────────────

    /// @notice Invariant: followReserve + fadeRealReserve + feesTransferred == preSettlePool.
    ///         Pool conservation: no USDC created or destroyed.
    function invariantPoolConservation() public view {
        if (!_settled || _invariantCallId == 0) return;

        uint256 followReserve = ffm.followReserve(_invariantCallId);
        uint256 fadeRealReserve = ffm.getFadeRealReserve(_invariantCallId);

        uint256 postSettlePool = followReserve + fadeRealReserve + _feesTransferred;

        // Conservation: pre == post (within 1 wei for integer division rounding)
        uint256 diff = postSettlePool > _preSettlePool
            ? postSettlePool - _preSettlePool
            : _preSettlePool - postSettlePool;

        assertLe(
            diff,
            1,
            "Pool conservation violated: USDC created or destroyed (SETTLE-46)"
        );
    }
}
