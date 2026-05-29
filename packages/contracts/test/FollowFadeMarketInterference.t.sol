// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.2 — per-callId sub-state isolation
// Requirement: Pitfall 9 (multi-call interference), SOCIAL-09 (TVL aggregation)
//
// Wave 0 multi-call interference test scaffold.
// RED GATE: This file will fail to compile until Plan 02 creates
//   packages/contracts/src/FollowFadeMarket.sol
//   packages/contracts/src/interfaces/IFollowFadeMarket.sol
// That compile failure is the expected Wave 0 RED gate.

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { FfmTestHelper } from "./helpers/FfmTestHelper.sol";

/// @title FollowFadeMarketInterference
/// @notice Multi-call interference tests: verifies that operations on callId N
///         never affect the reserves, shares, or k-invariant of callId M.
///         Covers Pitfall 9 (§11.2 per-callId sub-state isolation).
///
///         Run with FOUNDRY_PROFILE=ci for 1000 fuzz iterations:
///           forge test --profile ci --match-contract FollowFadeMarketInterference -v
contract FollowFadeMarketInterference is FfmTestHelper {
    uint256 internal callId1;
    uint256 internal callId2;

    function setUp() public override {
        super.setUp();

        // Seed two independent calls
        callId1 = _seedPool(alice, 20e6);
        callId2 = _seedPoolWithFeed(alice, 30e6, BTC_FEED, uint64(block.timestamp + 7 days));

        // Add positions from bob on both sides
        vm.prank(bob);
        ffm.follow(callId1, 5e6, 0);
        vm.prank(bob);
        ffm.fade(callId2, 8e6, 0);
    }

    // ─── Test: follow on callId1 does not affect callId2 reserves ─────────────

    /// @notice test_multiCallIndependentK: follow on callId1 must not move
    ///         followReserve or fadeReserve of callId2.
    function test_multiCallIndependentK() public {
        uint256 follow2Before = ffm.followReserve(callId2);
        uint256 fade2Before   = ffm.fadeReserve(callId2);

        // Follow on callId1
        vm.prank(bob);
        ffm.follow(callId1, 5e6, 0);

        // callId2 reserves must be unchanged
        assertEq(ffm.followReserve(callId2), follow2Before, "follow on callId1 must not change callId2 followReserve");
        assertEq(ffm.fadeReserve(callId2), fade2Before, "follow on callId1 must not change callId2 fadeReserve");
    }

    // ─── Test: getTvl aggregates across all pools ──────────────────────────────

    /// @notice test_multiCallTvlAggregates: getTvl() must equal the sum of all
    ///         individual call pool balances (real USDC only, no virtual seed).
    function test_multiCallTvlAggregates() public {
        // getTvl() uses USDC.balanceOf(address(this)) which covers all real USDC
        uint256 totalTvl = ffm.getTvl();

        // Sum of real reserves across callId1 + callId2
        uint256 f1 = ffm.followReserve(callId1);
        uint256 fd1 = ffm.fadeReserve(callId1) - ffm.fadeSeedVirtual(callId1);
        uint256 f2 = ffm.followReserve(callId2);
        uint256 fd2 = ffm.fadeReserve(callId2) - ffm.fadeSeedVirtual(callId2);

        assertEq(totalTvl, f1 + fd1 + f2 + fd2, "getTvl must equal sum of all real pool reserves");
    }

    // ─── Test: exit on callId1 does not move callId2 shares ───────────────────

    /// @notice test_crossCallExitNoLeakage: exiting a position on callId1 must not
    ///         change bob's shares on callId2. Covers the cross-call leakage variant
    ///         of Pitfall 9.
    function test_crossCallExitNoLeakage() public {
        // Bob's fade shares on callId2 before any callId1 exit
        uint256 bobFadeShares2Before = ffm.fadeShares(callId2, bob);
        assertGt(bobFadeShares2Before, 0, "bob should have fade shares on callId2 before test");

        // Fast-forward past cooldown for callId1
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        // Bob exits follow position on callId1
        vm.prank(bob);
        ffm.exitPosition(callId1, IFollowFadeMarket.Side.Follow);

        // Bob's fade shares on callId2 must be unchanged
        assertEq(
            ffm.fadeShares(callId2, bob),
            bobFadeShares2Before,
            "exitPosition on callId1 must not change bob's shares on callId2"
        );
    }

    // ─── Test: penalty injection on callId1 does not affect callId2 k ────────

    /// @notice test_penaltyInjectionIsolated: penalty from exitPosition on callId1
    ///         must not change reserves on callId2. Penalty routing must be callId-scoped.
    function test_penaltyInjectionIsolated() public {
        uint256 follow2Before = ffm.followReserve(callId2);
        uint256 fade2Before   = ffm.fadeReserve(callId2);

        // Fast-forward past cooldown
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        // Bob exits follow position on callId1 (triggers penalty injection into callId1 pools)
        vm.prank(bob);
        ffm.exitPosition(callId1, IFollowFadeMarket.Side.Follow);

        // callId2 reserves must be completely unaffected
        assertEq(ffm.followReserve(callId2), follow2Before, "penalty injection on callId1 must not affect callId2 followReserve");
        assertEq(ffm.fadeReserve(callId2), fade2Before, "penalty injection on callId1 must not affect callId2 fadeReserve");
    }

    // ─── Test: TVL cap combines CR + FFM across multiple calls ────────────────

    /// @notice test_tvlCapCombinesAllCalls: the combined TVL cap check reads
    ///         callRegistry.currentTvl + ffm.getTvl() for the $5K cap enforcement.
    function test_tvlCapCombinesAllCalls() public {
        // Both calls are seeded; combined TVL is CR.currentTvl + FFM.getTvl()
        // CR.currentTvl tracks stakes forwarded; FFM.getTvl() tracks actual USDC balance
        uint256 crTvl  = registry.currentTvl();
        uint256 ffmTvl = ffm.getTvl();
        uint256 combined = crTvl + ffmTvl;

        // Combined must be <= $5000
        assertLe(combined, 5_000e6, "combined TVL must be <= initial TVL cap");
    }
}
