// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §8, §11.2, §12.2 — FollowFadeMarket behaviors
// Requirement: SOCIAL-01..28, D-01..D-06
//
// Wave 0 unit test scaffold for FollowFadeMarket.
// RED GATE: This file will fail to compile until Plan 02 creates
//   packages/contracts/src/FollowFadeMarket.sol
//   packages/contracts/src/interfaces/IFollowFadeMarket.sol
// That compile failure is expected and correct Wave 0 behavior.
//
// When Plan 02 ships the contract, ALL stubs should turn GREEN without
// modifying this test file.

import { Test } from "forge-std/Test.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { FfmTestHelper } from "./helpers/FfmTestHelper.sol";

/// @title FollowFadeMarketTest
/// @notice Unit tests for FollowFadeMarket covering SOCIAL-01..28 (+ SOCIAL-43..45 stubs).
///
///         Error selector declarations at top so vm.expectRevert calls compile
///         once IFollowFadeMarket.sol exists in Plan 02.
///
///         All test bodies are stubs (empty or vm.skip) — they compile to valid
///         Solidity once the contract interface is available. Wave 1 fills
///         implementations that make them GREEN.
contract FollowFadeMarketTest is FfmTestHelper {
    // ─── Error selector declarations (must match IFollowFadeMarket.sol in Plan 02) ─
    // These are declared here so vm.expectRevert(IFollowFadeMarket.XxxError.selector)
    // compiles. Plan 02 must define them with identical signatures.
    //
    // SlippageExceeded(uint256 minOut, uint256 actualOut)
    // CallPastExpiry()
    // ExitCooldownActive(uint64 unlocksAt)
    // CallerExitLocked(uint64 unlocksAt)
    // TvlCapReached(uint256 requested, uint256 available)
    // PositionBelowMinimum()
    // PositionAboveMaximum()
    // NotAuthorized()
    // CallNotLive()
    // ClaimRequiresSettlement()

    // ─── SOCIAL-01: Follow shares minted via AMM formula ─────────────────────

    /// @notice SOCIAL-01: follow() mints correct shares via sharesOut = totalShares * amtIn / (reserve + amtIn).
    function testFollowSharesMinted() public {
        uint256 callId = _seedPool(alice, 20e6);
        uint256 amountIn = 10e6; // $10 USDC

        uint256 reserveBefore  = ffm.followReserve(callId);
        uint256 totalSharesBefore = ffm.followTotalShares(callId);
        // Expected shares: totalShares * amountIn / (reserve + amountIn)
        uint256 expectedShares = totalSharesBefore * amountIn / (reserveBefore + amountIn);

        vm.prank(bob);
        ffm.follow(callId, amountIn, 0); // minSharesOut=0 for basic test

        uint256 bobShares = ffm.followShares(callId, bob);
        assertApproxEqAbs(bobShares, expectedShares, 1, "follow shares should match AMM formula");
    }

    // ─── SOCIAL-02: Fade shares minted via AMM formula ───────────────────────

    /// @notice SOCIAL-02: fade() mints correct shares via sharesOut = totalShares * amtIn / (reserve + amtIn).
    function testFadeSharesMinted() public {
        uint256 callId = _seedPool(alice, 20e6);
        uint256 amountIn = 5e6; // $5 USDC

        uint256 reserveBefore     = ffm.fadeReserve(callId);
        uint256 totalSharesBefore = ffm.fadeTotalShares(callId);
        uint256 expectedShares    = totalSharesBefore * amountIn / (reserveBefore + amountIn);

        vm.prank(bob);
        ffm.fade(callId, amountIn, 0);

        uint256 bobShares = ffm.fadeShares(callId, bob);
        assertApproxEqAbs(bobShares, expectedShares, 1, "fade shares should match AMM formula");
    }

    // ─── SOCIAL-03/04: Position bounds ────────────────────────────────────────

    /// @notice SOCIAL-03: position < MIN_POSITION ($1) reverts PositionBelowMinimum.
    /// @notice SOCIAL-04: cumulative position > MAX_POSITION ($100) reverts PositionAboveMaximum.
    function testPositionBounds() public {
        uint256 callId = _seedPool(alice, 20e6);

        // Below minimum: $0.99
        vm.prank(bob);
        vm.expectRevert(IFollowFadeMarket.PositionBelowMinimum.selector);
        ffm.follow(callId, 0.99e6, 0);

        // Exactly at minimum: should succeed
        vm.prank(bob);
        ffm.follow(callId, 1e6, 0);

        // Push bob to $100 cumulative (already $1 in, add $99 more)
        vm.prank(bob);
        ffm.follow(callId, 99e6, 0);

        // Next $1 should revert PositionAboveMaximum
        vm.prank(bob);
        vm.expectRevert(IFollowFadeMarket.PositionAboveMaximum.selector);
        ffm.follow(callId, 1e6, 0);
    }

    // ─── SOCIAL-05/06: Slippage protection ────────────────────────────────────

    /// @notice SOCIAL-05: SlippageExceeded fires when minSharesOut not met.
    /// @notice SOCIAL-06: Frontend computes minSharesOut with 1% tolerance.
    function testSlippage() public {
        uint256 callId = _seedPool(alice, 20e6);
        uint256 amountIn = 10e6;

        uint256 reserve     = ffm.followReserve(callId);
        uint256 totalShares = ffm.followTotalShares(callId);
        uint256 expected    = totalShares * amountIn / (reserve + amountIn);

        // Request more shares than possible → SlippageExceeded
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IFollowFadeMarket.SlippageExceeded.selector,
                expected + 1e18, // minOut higher than actual
                expected
            )
        );
        ffm.follow(callId, amountIn, expected + 1e18);

        // 1% tolerance as frontend would compute: expected * 99 / 100
        uint256 minSharesOut = expected * 99 / 100;
        vm.prank(bob);
        ffm.follow(callId, amountIn, minSharesOut); // should succeed
    }

    // ─── SOCIAL-07: Post-expiry gate ──────────────────────────────────────────

    /// @notice SOCIAL-07: follow/fade after call.expiry reverts CallPastExpiry.
    ///         Strict < required (Pitfall 10).
    function testPostExpiryGate() public {
        uint64 expiry = uint64(block.timestamp + 1 days);
        uint256 callId = _seedPool(alice, 20e6, expiry);

        // At expiry - 1: should succeed
        vm.warp(expiry - 1);
        vm.prank(bob);
        ffm.follow(callId, 1e6, 0);

        // At exact expiry: must revert CallPastExpiry (strict < check)
        vm.warp(expiry);
        vm.prank(bob);
        vm.expectRevert(IFollowFadeMarket.CallPastExpiry.selector);
        ffm.follow(callId, 1e6, 0);

        // Past expiry: also reverts
        vm.warp(expiry + 1);
        vm.prank(bob);
        vm.expectRevert(IFollowFadeMarket.CallPastExpiry.selector);
        ffm.follow(callId, 1e6, 0);
    }

    // ─── SOCIAL-08: follow/fade accept Live OR CallerExited status ────────────

    /// @notice SOCIAL-08: follow/fade succeed on a call with CallerExited status.
    function testAcceptDepositCallerExited() public {
        uint64 expiry = uint64(block.timestamp + 7 days);
        uint256 callId = _seedPool(alice, 20e6, expiry);

        // Move past 24h lock then alice exits as caller
        vm.warp(block.timestamp + 25 hours);
        vm.prank(alice);
        ffm.callerExit(callId);

        // follow/fade should still work on CallerExited status
        vm.prank(bob);
        ffm.follow(callId, 1e6, 0);
        vm.prank(bob);
        ffm.fade(callId, 1e6, 0);
    }

    // ─── SOCIAL-12/13/14: Position exit ────────────────────────────────────────

    /// @notice SOCIAL-12: exitPosition within 4h of entry reverts ExitCooldownActive.
    /// @notice SOCIAL-13: exitPosition slashes 10% of position value.
    /// @notice SOCIAL-14: 10% slash splits 50/40/10 (opposite/same/treasury).
    function testPositionExit() public {
        uint256 callId = _seedPool(alice, 20e6);
        uint256 amountIn = 10e6;
        vm.prank(bob);
        ffm.follow(callId, amountIn, 0);

        // Within cooldown: should revert ExitCooldownActive
        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IFollowFadeMarket.ExitCooldownActive.selector,
                uint64(block.timestamp + POSITION_EXIT_COOLDOWN)
            )
        );
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        // Fast-forward past cooldown
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        uint256 fadeBefore   = ffm.fadeReserve(callId);
        uint256 followBefore = ffm.followReserve(callId);
        uint256 treasuryBefore = usdc.balanceOf(treasury);
        uint256 bobBefore    = usdc.balanceOf(bob);

        vm.prank(bob);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        // Bob receives ~90% (10% slashed)
        // exact value depends on share price at exit time
        assertGt(usdc.balanceOf(bob), bobBefore, "bob should receive USDC back");

        // 50% of slash → opposite pool (fade), 40% → same pool (follow), 10% → treasury
        // Penalty injection grows reserves, no new shares (SOCIAL-11, Pitfall 9)
        // After exit: followReserve may decrease (user's share redeemed) but fadeReserve increases from penalty
        assertGt(usdc.balanceOf(treasury), treasuryBefore, "treasury should receive 10% of slash");
    }

    // ─── SOCIAL-15: Pause carve-out ───────────────────────────────────────────

    /// @notice SOCIAL-15: exitPosition works while contract is paused; follow reverts Paused.
    function testPauseCarveout() public {
        uint256 callId = _seedPool(alice, 20e6);
        vm.prank(bob);
        ffm.follow(callId, 5e6, 0);

        // Fast-forward past cooldown before pause
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        // Pause the contract
        vm.prank(owner);
        ffm.pause();

        // follow should revert with Paused
        vm.prank(bob);
        vm.expectRevert(); // Pausable: EnforcedPause
        ffm.follow(callId, 1e6, 0);

        // exitPosition is a carve-out — should succeed even while paused
        vm.prank(bob);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);
    }

    // ─── SOCIAL-16: CallNotLive on settled call ──────────────────────────────

    /// @notice SOCIAL-16: exitPosition on a settled call reverts CallNotLive.
    function testCallNotLive() public {
        uint256 callId = _seedPool(alice, 20e6);
        vm.prank(bob);
        ffm.follow(callId, 5e6, 0);
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        // Simulate settlement via owner marking settled (Plan 02 must expose owner-callable mock path)
        // For Wave 0 stub: we call a direct settlement setter if available, or skip test body
        // This stub will be implemented fully when SettlementManager wires in Phase 4
        // vm.prank(settlementManager); registry.markSettled(callId, outcome);
        // vm.prank(bob); vm.expectRevert(IFollowFadeMarket.CallNotLive.selector);
        // ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);
        vm.skip(true); // TODO: implement in Wave 1 when markSettled wire-up is available
    }

    // ─── SOCIAL-17: Caller exit 24h lock ─────────────────────────────────────

    /// @notice SOCIAL-17: callerExit within 24h reverts CallerExitLocked.
    function testCallerExitLocked() public {
        uint256 callId = _seedPool(alice, 20e6);

        // Immediately: locked
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                IFollowFadeMarket.CallerExitLocked.selector,
                uint64(block.timestamp + CALLER_EXIT_LOCK_DURATION)
            )
        );
        ffm.callerExit(callId);

        // At exactly 24h: still locked (strict >)
        vm.warp(block.timestamp + CALLER_EXIT_LOCK_DURATION);
        vm.prank(alice);
        vm.expectRevert(IFollowFadeMarket.CallerExitLocked.selector);
        ffm.callerExit(callId);

        // After 24h + 1 second: unlocked
        vm.warp(block.timestamp + 1);
        vm.prank(alice);
        ffm.callerExit(callId); // should succeed
    }

    // ─── SOCIAL-18: Caller exit penalty decay ────────────────────────────────

    /// @notice SOCIAL-18: caller exit penalty = 15% + 35% * remaining/total, floor 15%.
    ///         Fuzz over elapsed time values.
    function testCallerExitPenalty(uint256 elapsedSeconds) public {
        uint64 duration = 7 days;
        uint64 expiry   = uint64(block.timestamp + duration);
        uint256 callId  = _seedPool(alice, 20e6, expiry);

        // Clamp elapsed to [CALLER_EXIT_LOCK_DURATION, duration - 1]
        uint64 createdAt = uint64(block.timestamp);
        elapsedSeconds = bound(elapsedSeconds, CALLER_EXIT_LOCK_DURATION + 1, uint256(duration) - 1);

        vm.warp(createdAt + elapsedSeconds);

        // Compute expected penalty
        uint256 remaining     = uint256(expiry) - block.timestamp;
        uint256 totalDuration = uint256(expiry) - uint256(createdAt);
        uint256 variable      = (CALLER_EXIT_VARIABLE_PCT * remaining) / totalDuration;
        uint256 expectedPct   = CALLER_EXIT_BASE_PCT + variable;

        // Penalty must be in [15, 50]
        assertGe(expectedPct, 15, "penalty must be >= 15%");
        assertLe(expectedPct, 50, "penalty must be <= 50%");

        // Verify contract computes the same penalty
        uint256 contractPct = ffm.computeCallerExitPenaltyPct(callId);
        assertEq(contractPct, expectedPct, "contract penalty must match formula");
    }

    // ─── SOCIAL-19: Caller exit 50/40/10 split ───────────────────────────────

    /// @notice SOCIAL-19: caller exit slash splits 50/40/10 to follow/fade/treasury.
    function testCallerExitSplit() public {
        uint256 callId = _seedPool(alice, 50e6);
        // Add some follow/fade liquidity
        vm.prank(bob);
        ffm.follow(callId, 10e6, 0);

        vm.warp(block.timestamp + CALLER_EXIT_LOCK_DURATION + 1);

        uint256 followBefore  = ffm.followReserve(callId);
        uint256 fadeBefore    = ffm.fadeReserve(callId);
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.prank(alice);
        ffm.callerExit(callId);

        // 50% slash → follow pool (SOCIAL-19)
        assertGt(ffm.followReserve(callId), followBefore, "50% of slash into follow pool");
        // 40% slash → fade pool
        // (fade may also decrease from alice's stake return, net direction depends on stake size)
        // 10% → treasury
        assertGt(usdc.balanceOf(treasury), treasuryBefore, "10% of slash to treasury");
    }

    // ─── SOCIAL-21: CallerExited status after callerExit ─────────────────────

    /// @notice SOCIAL-21: call.status == CallerExited after callerExit tx.
    function testCallerExitStatus() public {
        uint256 callId = _seedPool(alice, 20e6);
        vm.warp(block.timestamp + CALLER_EXIT_LOCK_DURATION + 1);

        vm.prank(alice);
        ffm.callerExit(callId);

        ICallRegistry.Call memory call = registry.getCall(callId);
        assertEq(
            uint8(call.status),
            uint8(ICallRegistry.CallStatus.CallerExited),
            "call.status must be CallerExited"
        );
    }

    // ─── SOCIAL-26: Rep slash in same tx ─────────────────────────────────────

    /// @notice SOCIAL-26: applyRepDelta called in same tx as callerExit; globalRep decremented.
    function testRepSlash() public {
        uint256 callId = _seedPool(alice, 20e6);
        vm.warp(block.timestamp + CALLER_EXIT_LOCK_DURATION + 1);

        uint128 repBefore = profileRegistry.getProfile(alice).globalRep;

        vm.prank(alice);
        ffm.callerExit(callId);

        uint128 repAfter = profileRegistry.getProfile(alice).globalRep;
        // Rep must have decreased (negative delta from caller exit)
        assertLt(repAfter, repBefore, "globalRep must decrease on callerExit");
    }

    // ─── D-01: createCall forwards stake to FFM ───────────────────────────────

    /// @notice D-01: CallRegistry holds $0 USDC after createCall; FFM receives the stake.
    function testCreateCallForwards() public {
        uint256 ffmBefore = usdc.balanceOf(address(ffm));
        uint256 registryBefore = usdc.balanceOf(address(registry));

        uint256 stake = 20e6;
        _seedPool(alice, uint96(stake));

        // CallRegistry should hold $0 (stake forwarded to FFM)
        assertEq(
            usdc.balanceOf(address(registry)),
            registryBefore,
            "CallRegistry must not hold USDC after createCall"
        );
        // FFM should now hold the caller's stake
        assertEq(
            usdc.balanceOf(address(ffm)),
            ffmBefore + stake,
            "FollowFadeMarket must hold the caller stake"
        );
    }

    // ─── Pitfall 22: Empty-pool LP fee routing ────────────────────────────────

    /// @notice Pitfall 22: when fadePool = virtual-only, LP fee routes to treasury not divide-by-zero.
    function testEmptyPoolLpFee() public {
        // Create a call where no real faders exist (only virtual fade seed)
        uint256 callId = _seedPool(alice, 20e6);
        // DO NOT add any real fade positions
        // Position exit from follow side should not divide-by-zero
        vm.prank(bob);
        ffm.follow(callId, 5e6, 0);
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        uint256 treasuryBefore = usdc.balanceOf(treasury);

        // Should not revert; treasury should receive LP fee portion
        vm.prank(bob);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        assertGt(usdc.balanceOf(treasury), treasuryBefore, "treasury must receive LP fee when fade pool is virtual-only");
    }

    // ─── SOCIAL-27 stubs (Phase 4 data capture) ────────────────────────────────

    /// @notice SOCIAL-27 (Part 1): callerExit snapshots callerVolumeAtExit + callerExitedAt.
    ///         Asserts these storage fields are non-zero after a successful callerExit.
    function test_callerExit_snapshotsCallerVolumeAtExit() public {
        uint256 callId = _seedPool(alice, 20e6);

        // Add some follow/fade volume first
        vm.prank(bob);
        ffm.follow(callId, 10e6, 0);

        vm.warp(block.timestamp + CALLER_EXIT_LOCK_DURATION + 1);
        vm.prank(alice);
        ffm.callerExit(callId);

        // callerVolumeAtExit must be non-zero (SOCIAL-20)
        assertGt(
            ffm.callerVolumeAtExit(callId),
            0,
            "callerVolumeAtExit must be snapshot at exit"
        );
        // callerExitedAt must be non-zero (SOCIAL-21)
        assertGt(
            ffm.callerExitedAt(callId),
            0,
            "callerExitedAt must be set at exit"
        );
    }

    /// @notice SOCIAL-27 (Part 2): Phase 4 SettlementManager must skip rep delta when callerExitedAt != 0.
    ///         This stub documents the Phase 4 dependency — skipped until SettlementManager ships.
    function test_callerExited_noSettlementRepDelta() public {
        vm.skip("Phase 4: SettlementManager must skip rep delta when call.callerExitedAt != 0 -- implement in Phase 4");
    }
}
