// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §8.1, §8.2, §11.2 — AMM k-invariant + penalty injection
// Requirement: SOCIAL-11, Pitfall 9, Pitfall 22, Pitfall 10
//
// Wave 0 invariant fuzz test scaffold for FollowFadeMarket.
// RED GATE: This file will fail to compile until Plan 02 creates
//   packages/contracts/src/FollowFadeMarket.sol
//   packages/contracts/src/interfaces/IFollowFadeMarket.sol
// That compile failure is the expected Wave 0 RED gate.
//
// Run with FOUNDRY_PROFILE=ci for 1000 fuzz iterations:
//   forge test --profile ci --match-contract FollowFadeMarketGates -v

import { Test, StdInvariant } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { FfmTestHelper } from "./helpers/FfmTestHelper.sol";

/// @title FollowFadeMarketGates
/// @notice Invariant fuzz tests for the FollowFadeMarket AMM:
///           - k-invariant: followReserve * fadeReserve can only grow or stay flat
///           - balance=reserves: USDC.balanceOf(ffm) == sum of real reserves
///           - no over-claim: no user's share value > their contributed USDC
///           - penalty injection grows k, no phantom shares (SOCIAL-11)
///           - expiry gate strict < (Pitfall 10)
///
///         Foundry invariant test: [profile.ci] fuzz.runs = 1000 in foundry.toml
contract FollowFadeMarketGates is FfmTestHelper, StdInvariant {
    // ─── State for invariant tracking ────────────────────────────────────────

    uint256 internal maxCallId;

    // Tracks the k value after each state change
    mapping(uint256 => uint256) internal lastK;

    // Tracks all active callIds for iteration in invariants
    uint256[] internal callIds;

    function setUp() public override {
        super.setUp();

        // Seed 3 calls with different stakes to populate pool state
        uint256 id1 = _seedPool(alice, 20e6);
        uint256 id2 = _seedPoolWithFeed(alice, 30e6, BTC_FEED, uint64(block.timestamp + 14 days));
        uint256 id3 = _seedPoolWithFeed(bob, 15e6, SOL_FEED, uint64(block.timestamp + 3 days));

        maxCallId = id3;
        callIds.push(id1);
        callIds.push(id2);
        callIds.push(id3);

        // Record initial k values
        for (uint256 i = 0; i < callIds.length; i++) {
            uint256 cid = callIds[i];
            lastK[cid] = ffm.followReserve(cid) * ffm.fadeReserve(cid);
        }

        // Register this contract as the target for invariant testing
        targetContract(address(ffm));
    }

    // ─── Invariant: k can only grow ────────────────────────────────────────────

    /// @notice invariant_kNeverShrinks: for every seeded callId with shares > 0,
    ///         followReserve * fadeReserve must be >= initial k.
    ///         This covers SOCIAL-11 (penalty injection grows k) and Pitfall 9
    ///         (multi-call interference must not shrink k).
    function invariant_kNeverShrinks() public view {
        for (uint256 i = 0; i < callIds.length; i++) {
            uint256 cid = callIds[i];
            uint256 follow = ffm.followReserve(cid);
            uint256 fade   = ffm.fadeReserve(cid);
            // k can only stay equal or grow (penalty injection and new deposits grow it)
            assertGe(follow * fade, lastK[cid], "k decreased: invariant_kNeverShrinks violated");
        }
    }

    // ─── Invariant: USDC balance == sum of real reserves ─────────────────────

    /// @notice invariant_usdcBalanceMatchesReserves: USDC.balanceOf(ffm) must equal
    ///         the sum of all followReserves + (fadeReserve - fadeSeedVirtual).
    ///         The virtual fade seed is accounting-only; it was never transferred.
    function invariant_usdcBalanceMatchesReserves() public view {
        uint256 sumRealReserves = 0;
        for (uint256 i = 0; i < callIds.length; i++) {
            uint256 cid = callIds[i];
            sumRealReserves += ffm.followReserve(cid);
            // fadeReserve contains real + virtual; subtract virtual seed
            uint256 realFade = ffm.fadeReserve(cid) - ffm.fadeSeedVirtual(cid);
            sumRealReserves += realFade;
        }
        assertEq(
            IERC20(USDC_ARB_NATIVE).balanceOf(address(ffm)),
            sumRealReserves,
            "invariant_usdcBalanceMatchesReserves violated: balance != sum of real reserves"
        );
    }

    // ─── Invariant: no user over-claim ────────────────────────────────────────

    /// @notice invariant_noOverClaim: no user's follow or fade position value can
    ///         exceed their total contributed USDC (followPosition + fadePosition).
    ///         Covers the case where share rounding could produce phantom value.
    function invariant_noOverClaim() public view {
        address[2] memory users = [alice, bob];
        for (uint256 u = 0; u < users.length; u++) {
            address user = users[u];
            for (uint256 i = 0; i < callIds.length; i++) {
                uint256 cid = callIds[i];
                uint256 followContrib = ffm.followPosition(cid, user);
                uint256 fadeContrib   = ffm.fadePosition(cid, user);
                uint256 totalContrib  = followContrib + fadeContrib;

                if (totalContrib == 0) continue;

                // Compute current share value for follow side
                uint256 fShares = ffm.followShares(cid, user);
                uint256 fTotal  = ffm.followTotalShares(cid);
                uint256 fReserve = ffm.followReserve(cid);
                uint256 followValue = fTotal > 0 ? (fShares * fReserve) / fTotal : 0;

                // Compute current share value for fade side
                uint256 dShares = ffm.fadeShares(cid, user);
                uint256 dTotal  = ffm.fadeTotalShares(cid);
                uint256 dReserve = ffm.fadeReserve(cid);
                uint256 fadeValue = dTotal > 0 ? (dShares * dReserve) / dTotal : 0;

                // Total claimable value must never exceed total contributed (accounting for penalty)
                // Note: 10% penalty means max reclaim = 90% of contributed, so this is a loose upper bound
                assertLe(
                    followValue + fadeValue,
                    totalContrib,
                    "invariant_noOverClaim violated: user can claim more than contributed"
                );
            }
        }
    }

    // ─── Unit: penalty injection grows k ──────────────────────────────────────

    /// @notice test_penaltyInjectionGrowsK: after exitPosition, the product
    ///         followReserve * fadeReserve must strictly exceed k_before.
    ///         This verifies SOCIAL-11: penalty injection grows k without phantom shares.
    function test_penaltyInjectionGrowsK() public {
        uint256 callId = callIds[0]; // Alice's first call

        // Bob follows
        vm.prank(bob);
        ffm.follow(callId, 10e6, 0);
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        uint256 kBefore = ffm.followReserve(callId) * ffm.fadeReserve(callId);

        // Bob exits: 10% slashed → injected into pools
        vm.prank(bob);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        uint256 kAfter = ffm.followReserve(callId) * ffm.fadeReserve(callId);
        assertGt(kAfter, kBefore, "k must increase after penalty injection");
    }

    // ─── Unit: no phantom shares on penalty injection ─────────────────────────

    /// @notice test_noPhantomSharesOnPenalty: totalShares must not increase
    ///         after exitPosition (penalty injects USDC into reserve, not shares).
    function test_noPhantomSharesOnPenalty() public {
        uint256 callId = callIds[0];

        vm.prank(bob);
        ffm.follow(callId, 10e6, 0);
        vm.warp(block.timestamp + POSITION_EXIT_COOLDOWN + 1);

        uint256 followTotalBefore = ffm.followTotalShares(callId);
        uint256 fadeTotalBefore   = ffm.fadeTotalShares(callId);

        vm.prank(bob);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        // Follow total shares decreased (bob's shares burned on exit)
        assertLt(ffm.followTotalShares(callId), followTotalBefore, "follow total shares must decrease on exit");
        // Fade total shares unchanged (penalty injects reserve, no new shares)
        assertEq(ffm.fadeTotalShares(callId), fadeTotalBefore, "fade total shares must NOT increase on penalty injection");
    }

    // ─── Unit: expiry gate strict < (Pitfall 10) ──────────────────────────────

    /// @notice test_expiryGateStrictLessThan: at exact expiry timestamp, follow reverts.
    ///         At expiry-1, follow succeeds. Verifies strict < not <=.
    function test_expiryGateStrictLessThan() public {
        uint64 expiry = uint64(block.timestamp + 2 days);
        uint256 callId = _seedPool(alice, 20e6, expiry);

        // At expiry - 1: succeed
        vm.warp(expiry - 1);
        vm.prank(bob);
        ffm.follow(callId, 1e6, 0); // should not revert

        // At exact expiry: revert CallPastExpiry
        vm.warp(expiry);
        vm.prank(bob);
        vm.expectRevert(IFollowFadeMarket.CallPastExpiry.selector);
        ffm.follow(callId, 1e6, 0);
    }
}
