// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.1 — createCall gate matrix
// Requirement: CALL-20, CALL-21, CALL-29..31, CALL-22..24, CALL-34

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";

/// @title CallRegistryGates
/// @notice Fuzz tests for CallRegistry anti-spam gate matrix.
///         Run with FOUNDRY_PROFILE=ci for 1000 iterations.
///         Covers: stake bounds, conviction floor, duplicate hash, TVL cap.
contract CallRegistryGates is Test {
    CallRegistry internal registry;
    ProfileRegistry internal profileRegistry;
    MockUSDC internal usdc;

    address internal owner;
    address internal caller;

    bytes32 internal constant FEED1 = bytes32(uint256(1));

    function setUp() public {
        vm.chainId(42161); // ADR-0001: pin Arbitrum One so resolveUsdc() in CallRegistry constructor resolves (reverts on default 31337)
        owner  = makeAddr("owner");
        caller = makeAddr("caller");

        vm.startPrank(owner);
        usdc = new MockUSDC();
        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(IProfileRegistry(address(profileRegistry)), 100_000e6);
        registry.addAsset("ETH", FEED1);
        vm.stopPrank();

        // Etch mock USDC at the canonical address
        address USDC_ADDR = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
        vm.etch(USDC_ADDR, address(usdc).code);
        usdc = MockUSDC(USDC_ADDR);

        usdc.mint(caller, 10_000e6);
        vm.prank(caller);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── Fuzz: stake bounds ────────────────────────────────────────────────────

    /// @notice Gate 6.1: fuzz stake from 1..200e6.
    ///         Outside [MIN_STAKE, MAX_STAKE] must revert; inside range must pass (when allowlisted).
    function test_fuzz_stake_bounds(uint96 stake) public {
        stake = uint96(bound(stake, 1, 200e6));

        // Use unique assetKey to avoid hash collision across fuzz runs
        bytes32 uniqueFeed = bytes32(uint256(stake) + 1000);
        vm.prank(owner);
        registry.addAsset(string(abi.encodePacked("S", stake)), uniqueFeed);

        bool tooLow  = stake < registry.MIN_STAKE();
        bool tooHigh = stake > registry.MAX_STAKE();

        if (tooLow) {
            vm.prank(caller);
            vm.expectRevert(ICallRegistry.StakeBelowMinimum.selector);
            registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(uniqueFeed), 0, 1000e6,
                uint64(block.timestamp + 86400),
                stake, 50, bytes32(0), true, 0
            );
        } else if (tooHigh) {
            vm.prank(caller);
            vm.expectRevert(ICallRegistry.StakeAboveMaximum.selector);
            registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(uniqueFeed), 0, 1000e6,
                uint64(block.timestamp + 86400),
                stake, 50, bytes32(0), true, 0
            );
        } else {
            vm.prank(caller);
            uint256 id = registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(uniqueFeed), 0, 1000e6,
                uint64(block.timestamp + 86400),
                stake, 50, bytes32(0), true, 0
            );
            assertGt(id, 0, "valid stake should create a call");
        }
    }

    // ─── Fuzz: conviction floor ────────────────────────────────────────────────

    /// @notice Gate 6.3: fuzz conviction 1..100.
    ///         In Phase 1, caller.settledCalls is always 0 (ProfileRegistry not wired).
    ///         So: conviction >= 85 always caps to 84; conviction < 85 is kept as-is.
    ///         The `settled` param is kept for API compatibility but contract always reads 0.
    function test_fuzz_conviction_floor(uint8 conviction, uint16 /*settled*/) public {
        conviction = uint8(bound(conviction, 1, 100));

        // In Phase 1, settledCalls is always 0 for any caller.
        // So shouldCap = conviction >= HIGH_CONVICTION_THRESHOLD (85).
        bool shouldCap = conviction >= registry.HIGH_CONVICTION_THRESHOLD();
        uint8 expectedConviction = shouldCap ? registry.HIGH_CONVICTION_AUTOCAP() : conviction;

        // Use unique feed to avoid hash collision
        bytes32 feed = bytes32(uint256(conviction) + 2000);
        vm.prank(owner);
        registry.addAsset(string(abi.encodePacked("FC", uint8(conviction))), feed);

        if (shouldCap) {
            vm.expectEmit(true, false, false, true);
            emit ICallRegistry.ConvictionCapped(caller, conviction, expectedConviction);
        }

        vm.prank(caller);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(feed), 0, 1000e6,
            uint64(block.timestamp + 86400),
            uint96(5e6), conviction, bytes32(0), true, 0
        );

        ICallRegistry.Call memory c = registry.getCall(id);
        assertEq(c.conviction, expectedConviction, "stored conviction should match expected");
    }

    // ─── Fuzz: duplicate hash collision ───────────────────────────────────────

    /// @notice Gate 6.2: two calls on different UTC days never collide.
    ///         Same UTC day always collides.
    function test_fuzz_duplicate_hash_collision(uint64 deadline1, uint64 deadline2) public {
        // Bound to a narrow past-now range to keep things in future
        uint64 base = uint64(block.timestamp);
        deadline1 = uint64(bound(deadline1, base + 1, base + 7 days));
        deadline2 = uint64(bound(deadline2, base + 1, base + 14 days));

        // Compute day buckets
        uint64 day1 = (deadline1 / 86400) * 86400;
        uint64 day2 = (deadline2 / 86400) * 86400;

        // Use same asset for potential collision test
        bytes32 feed = FEED1;
        uint256 targetValue = 3000e6;

        // First call always succeeds
        vm.prank(caller);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(feed), 0, targetValue,
            deadline1,
            uint96(5e6),
            50, bytes32(0), true, 0
        );

        bool sameDay = (day1 == day2);
        if (sameDay) {
            vm.prank(caller);
            vm.expectRevert(); // DuplicateCall
            registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(feed), 0, targetValue,
                deadline2,
                uint96(5e6),
                50, bytes32(0), true, 0
            );
        } else {
            // Different UTC days -- should NOT collide
            vm.prank(caller);
            uint256 id2 = registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(feed), 0, targetValue,
                deadline2,
                uint96(5e6),
                50, bytes32(0), true, 0
            );
            assertGt(id2, 0, "different UTC days should produce distinct calls");
        }
    }

    // ─── Fuzz: TVL cap boundary ────────────────────────────────────────────────

    /// @notice CALL-34: stake > tvlCap reverts TvlCapReached; stake <= tvlCap passes.
    ///         Phase 2: currentTvl tracks stake only (not stake+fee); cap check uses stake.
    function test_fuzz_tvl_cap_boundary(uint96 stake, uint256 capBase) public {
        stake = uint96(bound(stake, uint256(registry.MIN_STAKE()), uint256(registry.MAX_STAKE())));
        // Phase 2: shouldRevert based on stake only (not incoming = stake + fee)
        uint256 stakeOnly = uint256(stake);

        // Bound cap to be near stakeOnly (0 to 3x stakeOnly)
        capBase = bound(capBase, 0, stakeOnly * 3);

        vm.prank(owner);
        registry.setTvlCap(capBase);

        bytes32 feed = bytes32(uint256(stake) + uint256(capBase % 10000) + 50000);
        vm.prank(owner);
        registry.addAsset(string(abi.encodePacked("TV", stake)), feed);

        bool shouldRevert = stakeOnly > capBase;

        if (shouldRevert) {
            vm.prank(caller);
            vm.expectRevert(
                abi.encodeWithSelector(ICallRegistry.TvlCapReached.selector, stakeOnly, capBase)
            );
            registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(feed), 0, 1000e6,
                uint64(block.timestamp + 86400),
                stake, 50, bytes32(0), true, 0
            );
        } else {
            vm.prank(caller);
            uint256 id = registry.createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                uint256(feed), 0, 1000e6,
                uint64(block.timestamp + 86400),
                stake, 50, bytes32(0), true, 0
            );
            assertGt(id, 0, "valid call should succeed when TVL not exceeded");
        }
    }
}
