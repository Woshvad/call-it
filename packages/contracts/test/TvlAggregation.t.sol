// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.2, §10.1 — TVL cap aggregation + boundary enforcement
// Requirement: SOCIAL-09, Pitfall 3, D-03
//              SAFETY-31, SAFETY-32, SAFETY-33
//
// Wave 0 TVL boundary test scaffold.
// RED GATE: This file will fail to compile until Plan 02 creates
//   packages/contracts/src/FollowFadeMarket.sol
//   packages/contracts/src/interfaces/IFollowFadeMarket.sol
// That compile failure is the expected Wave 0 RED gate.

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";
import { FfmTestHelper } from "./helpers/FfmTestHelper.sol";

/// @title TvlAggregation
/// @notice TVL cap boundary tests (Pitfall 3, D-03, SOCIAL-09).
///
///         Tests the $5,000 TVL cap enforcement across CallRegistry.currentTvl
///         + FollowFadeMarket.getTvl(). The cap is checked on every follow/fade
///         deposit: (CR.currentTvl + FFM.getTvl() + amountIn) > cap → TvlCapReached.
///
///         Phase 6 extensions (SAFETY-31/32/33):
///           SAFETY-31: ChallengeEscrow USDC balance must count toward the TVL cap.
///                      $5,000 split across CR+FFM+CE reverts next deposit TvlCapReached.
///           SAFETY-32: createCall stake boundary — $100 max succeeds, $101 reverts.
///           SAFETY-33: follow/fade position size boundary — $1 min succeeds, $0.99 reverts.
///
///         Boundary cases:
///           $4,999 total: OK
///           $5,000 total: at cap, next deposit reverts
///           $5,001 total: should never happen (capped earlier)
///
///         Run with:
///           forge test --match-contract TvlAggregation -v
contract TvlAggregation is FfmTestHelper {
    // TVL cap used in setUp() = $5,000 USDC
    uint256 internal constant TVL_CAP = 5_000e6;

    // ChallengeEscrow — wired in setUp for SAFETY-31 tests
    ChallengeEscrow internal ce;

    function setUp() public override {
        super.setUp();
        // Ensure TVL cap is exactly $5,000 (FfmTestHelper sets $5,000 on CallRegistry)

        // Deploy ChallengeEscrow for SAFETY-31 3-way TVL tests
        vm.startPrank(owner);
        ce = new ChallengeEscrow(
            address(registry),
            address(ffm),
            USDC_ARB_NATIVE,
            treasury,
            TVL_CAP
        );
        vm.stopPrank();

        // Approve ChallengeEscrow for alice and bob
        vm.prank(alice);
        usdc.approve(address(ce), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(ce), type(uint256).max);
    }

    // ─── Test: $4,999 combined TVL succeeds ───────────────────────────────────

    /// @notice test_tvlBoundary4999Succeeds: total CR + FFM TVL < $5000 allows deposit.
    ///         Seeds multiple calls, then follows up to just below $5K combined.
    function test_tvlBoundary4999Succeeds() public {
        // Seed a call that occupies most of the cap
        // CR.currentTvl tracks stake; starting with $98 (max stake) + $10 fee = $108 TVL in CR
        // Seed as many calls as needed to get to ~$4999
        // For simplicity: seed one call with max stake ($100) + fee = $110 total in CR
        // Then add $4889 in follow deposits to FFM

        uint256 callId = _seedPool(alice, 100e6); // $100 stake → CR.currentTvl += $100

        // Add bob as a follower for up to just below the cap
        // CR.currentTvl = $100 (stake only; creation fee goes to treasury)
        // FFM.getTvl() = $100 (the stake forwarded from createCall)
        // combined = $200 — well below $5K
        // We want to push combined to just below $5K:
        //   target combined = $4999
        //   current combined = $200 (CR $100 + FFM $100)
        //   still available = $4799
        // Add $4,799 in follow deposits (requires minting enough USDC for bob)
        uint256 stillAvailable = TVL_CAP - 1 - (registry.currentTvl() + ffm.getTvl());
        // Clamp to MAX_POSITION per follow/fade call ($100 max)
        // Make multiple follow calls to reach the boundary

        // Note: each follow call is limited to $100 by PositionAboveMaximum per user
        // We use multiple users to exceed $100 cumulative
        address charlie = makeAddr("charlie");
        usdc.mint(charlie, stillAvailable + 10e6);
        vm.prank(charlie);
        usdc.approve(address(ffm), type(uint256).max);

        // Follow up to the boundary in $100 increments
        uint256 remaining = stillAvailable;
        uint256 iter = 0;
        while (remaining > 0 && iter < 50) {
            address follower = makeAddr(string(abi.encodePacked("follower", iter)));
            uint256 amt = remaining > 100e6 ? 100e6 : remaining;
            usdc.mint(follower, amt);
            vm.prank(follower);
            usdc.approve(address(ffm), type(uint256).max);
            vm.prank(follower);
            ffm.follow(callId, amt, 0);
            remaining -= amt;
            iter++;
        }

        // At this point combined TVL should be $4999 — verify it's below the cap
        uint256 combined = registry.currentTvl() + ffm.getTvl();
        assertLe(combined, TVL_CAP, "combined TVL must be <= cap after boundary seeding");
    }

    // ─── Test: deposit that pushes combined TVL to $5001 reverts TvlCapReached ─

    /// @notice test_tvlBoundary5001Reverts: any deposit that would push combined TVL
    ///         above the $5K cap must revert TvlCapReached.
    function test_tvlBoundary5001Reverts() public {
        // Seed a call consuming most of the TVL cap
        uint256 callId = _seedPool(alice, 100e6);

        // Set TVL cap very low on the registry to make the boundary easy to hit
        // Registry cap is $5000; lower to just above current TVL so next deposit overflows
        uint256 currentCombined = registry.currentTvl() + ffm.getTvl(); // should be $100

        // Set cap to currentCombined (any new deposit will exceed the cap)
        vm.prank(owner);
        registry.setTvlCap(currentCombined);

        // Now a follow of $1 must revert TvlCapReached
        vm.prank(bob);
        vm.expectRevert(); // TvlCapReached with any (requested, available) params
        ffm.follow(callId, 1e6, 0);
    }

    // ─── Test: combined TVL aggregation math ──────────────────────────────────

    /// @notice test_tvlAggregation: after seeding calls and deposits, combined
    ///         TVL equals CR.currentTvl + FFM.getTvl() exactly.
    function test_tvlAggregation() public {
        // Seed two calls
        uint256 id1 = _seedPool(alice, 20e6);   // CR.currentTvl += $20, FFM += $20
        uint256 id2 = _seedPoolWithFeed(alice, 30e6, BTC_FEED, uint64(block.timestamp + 7 days));

        // Add follow position from bob on id1
        vm.prank(bob);
        ffm.follow(id1, 5e6, 0);  // FFM += $5

        // Add fade position from bob on id2
        vm.prank(bob);
        ffm.fade(id2, 8e6, 0);    // FFM += $8

        // CR.currentTvl tracks stakes only ($20 + $30 = $50)
        uint256 crTvl = registry.currentTvl();
        assertEq(crTvl, 50e6, "CR.currentTvl should be sum of all stakes");

        // FFM.getTvl() = USDC.balanceOf(address(ffm)) = $20 + $30 + $5 + $8 = $63
        uint256 ffmTvl = ffm.getTvl();
        assertEq(ffmTvl, 63e6, "FFM.getTvl() must equal real USDC held");

        // Combined TVL = $50 + $63 = $113 — well within $5K cap
        uint256 combined = crTvl + ffmTvl;
        assertEq(combined, 113e6, "combined TVL must be CR + FFM sum");
    }

    // ─── Test: setTvlCap increases the limit and allows more deposits ──────────

    /// @notice test_tvlCapRaisable: owner can raise TVL cap, enabling deposits
    ///         that were previously blocked.
    function test_tvlCapRaisable() public {
        uint256 callId = _seedPool(alice, 100e6);

        // Lock down the cap to current TVL
        uint256 currentCombined = registry.currentTvl() + ffm.getTvl();
        vm.prank(owner);
        registry.setTvlCap(currentCombined);

        // Follow should revert at current cap
        vm.prank(bob);
        vm.expectRevert(); // TvlCapReached with any (requested, available) params
        ffm.follow(callId, 1e6, 0);

        // Raise the cap by $10
        vm.prank(owner);
        registry.setTvlCap(currentCombined + 10e6);

        // Now follow of $1 should succeed
        vm.prank(bob);
        ffm.follow(callId, 1e6, 0); // should not revert
    }

    // ─── SAFETY-31: ChallengeEscrow balance must count toward TVL cap ──────────

    /// @notice SAFETY-31: ChallengeEscrow._checkTvlCap aggregates CR + FFM + totalEscrow.
    ///         Pitfall 3 note: CE uses callRegistry.tvlCap() as the global cap and sums
    ///         CR.currentTvl + FFM.getTvl + CE.totalEscrow + incoming vs the cap.
    ///
    ///         Test: seed CR+FFM to $100 each ($200 combined), set cap=$201, then propose
    ///         a $5 challenge ($200+$5=$205 > $201) → must revert TvlCapReached.
    ///
    ///         This confirms CE escrow is included in the 3-way aggregate (SAFETY-31 closed).
    function test_tvlBoundary_includesChallengeEscrow() public {
        // Seed a call: CR.currentTvl = $100, FFM.getTvl = $100, combined = $200
        uint256 callId = _seedPool(alice, 100e6);

        uint256 combined = registry.currentTvl() + ffm.getTvl();
        assertEq(combined, 200e6, "SAFETY-31: combined should be $200 after seed");

        // Set the global TVL cap to $204 — allows $4 more, but NOT a $5 CE stake
        vm.prank(owner);
        registry.setTvlCap(204e6);

        // Fund bob and try a $5 challenge (the minimum CE stake)
        // CE._checkTvlCap: $100 + $100 + $0 + $5 = $205 > $204 → TvlCapReached
        usdc.mint(bob, 10e6);
        vm.prank(bob);
        usdc.approve(address(ce), type(uint256).max);

        vm.prank(bob);
        vm.expectRevert(); // TvlCapReached — CR + FFM + CE totalEscrow > cap
        ce.proposeChallenge(callId, 5e6);

        // Now raise the cap to $206 — $5 challenge should succeed
        vm.prank(owner);
        registry.setTvlCap(206e6);

        vm.prank(bob);
        uint256 challengeId = ce.proposeChallenge(callId, 5e6);
        assertGt(challengeId, 0, "SAFETY-31: challenge must succeed with raised cap");

        // CE now holds $5 in escrow
        assertEq(ce.totalEscrow(), 5e6, "SAFETY-31: CE must track $5 in escrow");

        // With $100+$100+$5=$205 in cap=$206, only $1 more allowed.
        // A second $5 challenge from charlie: $205+$5=$210 > $206 → TvlCapReached
        address charlie = makeAddr("charlie_ce_test");
        usdc.mint(charlie, 10e6);
        vm.prank(charlie);
        usdc.approve(address(ce), type(uint256).max);

        vm.prank(charlie);
        vm.expectRevert(); // TvlCapReached — CE escrow counted in aggregate
        ce.proposeChallenge(callId, 5e6);
    }

    // ─── SAFETY-32: createCall stake boundary enforcement ──────────────────────

    /// @notice SAFETY-32: createCall with stake = $100 (max) must succeed.
    function test_maxStake_100_succeeds() public {
        usdc.mint(alice, 100e6 + 10e6); // stake + creation fee
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(alice);
        uint256 callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),
            0,
            3000e6,
            uint64(block.timestamp + 7 days),
            100e6,   // max stake = $100
            50,
            bytes32(0),
            true,
            0
        );
        assertGt(callId, 0, "SAFETY-32: $100 stake must succeed");

        ICallRegistry.Call memory c = registry.getCall(callId);
        assertEq(c.stake, 100e6, "SAFETY-32: stake stored correctly");
    }

    /// @notice SAFETY-32: createCall with stake = $101 must revert StakeAboveMaximum.
    function test_maxStake_101_reverts() public {
        usdc.mint(alice, 101e6 + 10e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(alice);
        vm.expectRevert(); // StakeAboveMaximum
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),
            0,
            3000e6,
            uint64(block.timestamp + 7 days),
            101e6,   // one cent over max
            50,
            bytes32(0),
            true,
            0
        );
    }

    // ─── SAFETY-33: follow/fade minimum position size enforcement ──────────────

    /// @notice SAFETY-33: follow with $1 (minimum position) must succeed.
    function test_minPosition_1_succeeds() public {
        uint256 callId = _seedPool(alice, 10e6);

        vm.prank(bob);
        ffm.follow(callId, 1e6, 0); // $1 = MIN_POSITION

        // Bob has a follow position
        uint256 bobShares = ffm.followShares(callId, bob);
        assertGt(bobShares, 0, "SAFETY-33: $1 follow must create shares");
    }

    /// @notice SAFETY-33: follow with $0.99 (below minimum) must revert PositionBelowMinimum.
    function test_minPosition_99cents_reverts() public {
        uint256 callId = _seedPool(alice, 10e6);

        vm.prank(bob);
        vm.expectRevert(); // PositionBelowMinimum
        ffm.follow(callId, 990_000, 0); // $0.99 = 990,000 micro-USDC
    }
}
