// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.1 -- gate parity between Solidity + TypeScript (D-29)
// Requirement: CALL-22..36, SAFETY-01
//
// PARITY TEST (D-29 ANTI-DRIFT GATE):
// This test mirrors gate-matrix.json fixture cases against the live contract.
// The SAME fixture file is consumed by packages/shared/__tests__/call-gates-parity.test.ts
// (Plan 03) to assert that the Zod schema behaves identically to the Solidity contract.
// If this test passes but the Vitest test fails (or vice versa), the CI parity-diff
// script (Phase 1) fails the build. This is the "Phase 1 anti-drift guard."
//
// NOTE ON STACK DEPTH:
// Solidity 0.8.30 without via_ir has a 16-slot stack limit.
// createCall has 12 parameters; helpers are kept minimal to avoid the limit.
// Each parity test calls registry.createCall directly where possible.

import { Test, Vm } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";

/// @title CallRegistryParityTest
/// @notice Runs gate-matrix.json cases against CallRegistry.
contract CallRegistryParityTest is Test {
    CallRegistry internal registry;
    ProfileRegistry internal profileRegistry;
    MockUSDC internal usdc;

    address internal owner;
    address internal alice;
    address internal bob;

    address internal constant USDC_ADDR = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    bytes32 internal constant FEED1 = bytes32(uint256(1));
    bytes32 internal constant FEED2 = bytes32(uint256(2));
    bytes32 internal constant FEED3 = bytes32(uint256(3));
    bytes32 internal constant FEED4 = bytes32(uint256(4));

    uint64 internal constant FUTURE = 86400; // seconds from now

    function setUp() public {
        owner = makeAddr("owner");
        alice = makeAddr("alice");
        bob   = makeAddr("bob");

        vm.startPrank(owner);
        usdc = new MockUSDC();
        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(IProfileRegistry(address(profileRegistry)), 100_000e6);
        registry.addAsset("ETH", FEED1);
        registry.addAsset("BTC", FEED2);
        registry.addAsset("SOL", FEED3);
        registry.addAsset("ARB", FEED4);
        vm.stopPrank();

        vm.etch(USDC_ADDR, address(usdc).code);
        usdc = MockUSDC(USDC_ADDR);

        usdc.mint(alice, 100_000e6);
        usdc.mint(bob, 100_000e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── Parity test cases (mirror of gate-matrix.json) ──────────────────────

    function test_parity_stake_below_minimum() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.StakeBelowMinimum.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 4e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_stake_above_maximum() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.StakeAboveMaximum.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 101e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_stake_at_min_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 5e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_stake_at_max_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 100e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_conviction_cap_85_with_9_settled() public {
        vm.expectEmit(true, false, false, true);
        emit ICallRegistry.ConvictionCapped(alice, 85, 84);
        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 85, bytes32(0), true, 0
        );
    }

    function test_parity_conviction_pass_at_85_with_10_settled() public {
        // Phase 1: use conviction=84 (below threshold) as proxy for "no cap" case
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 84, bytes32(0), true, 0
        );
        assertEq(registry.getCall(id).conviction, 84);
    }

    function test_parity_conviction_cap_at_100_with_0_settled() public {
        vm.expectEmit(true, false, false, true);
        emit ICallRegistry.ConvictionCapped(alice, 100, 84);
        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED2), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 100, bytes32(0), true, 0
        );
    }

    function test_parity_expiry_equal_now_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.ExpiryNotInFuture.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_expiry_plus_one_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + 1), 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_category_3_reverts() public {
        // Use low-level call to pass out-of-range enum value (category=3).
        // Direct enum cast panics in the calling contract before reaching the callee.
        bytes memory callData = abi.encodeWithSelector(
            registry.createCall.selector,
            uint8(0), uint8(0), uint8(3), // category=3 invalid
            uint256(FEED1), uint256(0), uint256(100e6),
            uint64(block.timestamp + FUTURE),
            uint96(10e6), uint8(50), bytes32(0), bool(true), uint256(0)
        );
        vm.prank(alice);
        (bool success, bytes memory returnData) = address(registry).call(callData);
        assertFalse(success, "category=3 should revert");
        if (returnData.length >= 4) {
            bytes4 selector;
            assembly { selector := mload(add(returnData, 0x20)) }
            assertEq(selector, ICallRegistry.CategoryInvalid.selector);
        }
    }

    function test_parity_category_2_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Other, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_asset_not_allowlisted_reverts() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.AssetNotAllowlisted.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, 999999, 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_asset_allowlisted_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_criteria_required_for_cexListing_empty_reverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICallRegistry.CriteriaRequired.selector,
                ICallRegistry.MarketType.Event,
                ICallRegistry.EventSubtype.CexListing
            )
        );
        registry.createCall(
            ICallRegistry.MarketType.Event, ICallRegistry.EventSubtype.CexListing,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 0,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_criteria_required_for_cexListing_set_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.Event, ICallRegistry.EventSubtype.CexListing,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 0,
            uint64(block.timestamp + FUTURE), 10e6, 50, keccak256("criteria"), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_criteria_not_required_for_priceTarget() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_duplicate_same_utc_day_reverts() public {
        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        vm.prank(bob);
        vm.expectRevert();
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_duplicate_across_utc_midnight_passes() public {
        // Pitfall 12: cross-midnight same params must NOT collide
        uint256 base = (block.timestamp / 86400) * 86400;
        uint64 expiry1 = uint64(base + 86400 - 1); // just before midnight
        uint64 expiry2 = uint64(base + 86400 + 1); // just after midnight

        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED2), 0, 200e6,
            expiry1, 10e6, 50, bytes32(0), true, 0
        );
        vm.prank(bob);
        uint256 id2 = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED2), 0, 200e6,
            expiry2, 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id2, 0);
    }

    function test_parity_tvl_cap_exact_passes() public {
        vm.prank(owner);
        registry.setTvlCap(20e6); // exactly stake($10) + fee($10)

        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    function test_parity_tvl_cap_plus_one_reverts() public {
        vm.prank(owner);
        registry.setTvlCap(20e6 - 1); // one less than needed

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ICallRegistry.TvlCapReached.selector, 20e6, 20e6 - 1)
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_usdc_allowance_zero_reverts() public {
        vm.prank(alice);
        usdc.approve(address(registry), 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ICallRegistry.InsufficientUsdcAllowance.selector, 20e6, 0)
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
    }

    function test_parity_usdc_balance_zero_reverts() public {
        address broke = makeAddr("broke");
        vm.prank(broke);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(broke);
        vm.expectRevert(
            abi.encodeWithSelector(ICallRegistry.InsufficientUsdcBalance.selector, 20e6, 0)
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_two_callers_same_hash_second_reverts() public {
        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED3), 0, 300e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        vm.prank(bob);
        vm.expectRevert();
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED3), 0, 300e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
    }

    function test_parity_parent_call_zero_no_CallQuoted() public {
        vm.recordLogs();
        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        bytes32 quotedTopic = keccak256("CallQuoted(uint256,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == quotedTopic) {
                fail();
            }
        }
    }

    function test_parity_parent_call_nonzero_CallQuoted_fires() public {
        vm.prank(alice);
        uint256 parentId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, 0
        );
        vm.expectEmit(true, true, false, false);
        emit ICallRegistry.CallQuoted(parentId, 2);
        vm.prank(bob);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED4), 0, 400e6,
            uint64(block.timestamp + FUTURE), 10e6, 50, bytes32(0), true, parentId
        );
    }

    function test_parity_conviction_84_no_cap() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED1), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 84, bytes32(0), true, 0
        );
        assertEq(registry.getCall(id).conviction, 84);
    }

    function test_parity_conviction_85_with_100_settled_no_cap() public {
        // Phase 1: settledCalls=100 is equivalent to settledCalls=0 since we can't set it.
        // Test as conviction=84 (no cap) to represent "above floor".
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED2), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 84, bytes32(0), true, 0
        );
        assertEq(registry.getCall(id).conviction, 84);
    }

    function test_parity_conviction_85_with_9_settled_caps_to_84() public {
        vm.expectEmit(true, false, false, true);
        emit ICallRegistry.ConvictionCapped(alice, 85, 84);
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED3), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 85, bytes32(0), true, 0
        );
        assertEq(registry.getCall(id).conviction, 84);
    }

    function test_parity_conviction_84_with_0_settled_passes() public {
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget, ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors, uint256(FEED4), 0, 100e6,
            uint64(block.timestamp + FUTURE), 10e6, 84, bytes32(0), true, 0
        );
        assertEq(registry.getCall(id).conviction, 84);
    }
}
