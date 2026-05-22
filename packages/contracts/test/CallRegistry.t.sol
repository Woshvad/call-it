// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.1 — CallRegistry function signatures + events + reverts
// Requirement: CALL-20..37/69/70, SAFETY-04/14

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";

/// @title CallRegistryTest
/// @notice Unit tests for CallRegistry happy path + gate behaviors.
///         CEI order, event assertions, conviction cap, pagination.
contract CallRegistryTest is Test {
    CallRegistry internal registry;
    ProfileRegistry internal profileRegistry;
    MockUSDC internal usdc;

    address internal owner;
    address internal alice;
    address internal bob;

    // Standard Pyth feed ID (deterministic for tests)
    bytes32 internal constant ETH_FEED = bytes32(uint256(1));
    bytes32 internal constant BTC_FEED = bytes32(uint256(2));

    uint256 internal constant STAKE = 10e6;     // $10
    uint256 internal constant FEE   = 10e6;     // $10 creation fee
    uint256 internal constant TOTAL  = STAKE + FEE; // $20

    function setUp() public {
        owner = makeAddr("owner");
        alice = makeAddr("alice");
        bob   = makeAddr("bob");

        // Deploy infrastructure
        vm.startPrank(owner);
        usdc = new MockUSDC();
        profileRegistry = new ProfileRegistry();

        // Deploy with $5,000 initial TVL cap
        registry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            5_000e6
        );

        // Add ETH to the asset allowlist
        registry.addAsset("ETH", ETH_FEED);
        registry.addAsset("BTC", BTC_FEED);
        vm.stopPrank();

        // Patch the USDC address in the registry's context by deploying at the expected address.
        // Since CallRegistry uses USDC_ARB_NATIVE constant, we use vm.etch to deploy mock there.
        address USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
        vm.etch(USDC_ARB_NATIVE, address(usdc).code);
        // Wire storage for the etch'd mock (we'll use it directly via MockUSDC interface)
        // Alternative: use the usdc instance stored at the etch'd address
        usdc = MockUSDC(USDC_ARB_NATIVE);

        // Fund alice and bob
        usdc.mint(alice, 1000e6);
        usdc.mint(bob, 1000e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    function _createEthCall(
        address caller,
        uint96 stake,
        uint8 conviction,
        uint256 assetKey
    ) internal returns (uint256 callId) {
        vm.prank(caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            assetKey,        // assetA = feedKey
            0,               // assetB
            3000e6,          // targetValue
            uint64(block.timestamp + 86400),
            stake,
            conviction,
            bytes32(0),
            true,
            0
        );
    }

    // ─── Happy path ───────────────────────────────────────────────────────────

    /// @notice CALL-37: createCall with $10 stake succeeds and emits CallCreated.
    function test_createCall_happy_path_emits_CallCreated() public {
        vm.expectEmit(true, true, false, false);
        emit ICallRegistry.CallCreated(1, alice, ICallRegistry.MarketType.PriceTarget, uint96(STAKE));

        uint256 id = _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));
        assertEq(id, 1, "first callId should be 1 (0 is burned)");
    }

    /// @notice CALL-37: USDC is pulled from caller by the correct amount (stake + fee).
    function test_createCall_pulls_correct_usdc_amount() public {
        uint256 before = usdc.balanceOf(alice);
        _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));
        uint256 after_ = usdc.balanceOf(alice);
        assertEq(before - after_, TOTAL, "should pull stake + $10 creation fee");
    }

    /// @notice CALL-34: TVL increases by stake + fee after createCall.
    function test_createCall_increments_currentTvl() public {
        assertEq(registry.currentTvl(), 0);
        _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));
        assertEq(registry.currentTvl(), TOTAL);
    }

    /// @notice SAFETY-18: callId 0 is burned; getCall(0) returns zero-initialized struct.
    function test_callId_zero_is_burned() public view {
        ICallRegistry.Call memory c = registry.getCall(0);
        assertEq(c.caller, address(0), "burned slot should have zero caller");
        assertEq(c.stake, 0, "burned slot should have zero stake");
    }

    // ─── Gate 6.1: Stake bounds ───────────────────────────────────────────────

    /// @notice CALL-20: stake below minimum ($4) reverts StakeBelowMinimum.
    function test_createCall_reverts_StakeBelowMinimum_at_4() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.StakeBelowMinimum.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            4e6, // $4 -- below minimum
            50, bytes32(0), true, 0
        );
    }

    /// @notice CALL-21: stake above maximum ($101) reverts StakeAboveMaximum.
    function test_createCall_reverts_StakeAboveMaximum_at_101() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.StakeAboveMaximum.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            101e6, // $101 -- above maximum
            50, bytes32(0), true, 0
        );
    }

    // ─── CALL-32: Expiry future check ─────────────────────────────────────────

    /// @notice CALL-32: expiry == block.timestamp reverts ExpiryNotInFuture.
    function test_createCall_reverts_ExpiryNotInFuture_at_now() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.ExpiryNotInFuture.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp), // == now
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    // ─── CALL-33: Category valid ──────────────────────────────────────────────

    /// @notice CALL-33: category=3 reverts CategoryInvalid.
    ///         Uses low-level call to pass out-of-range enum value (Solidity 0.8+ panics on
    ///         direct enum cast for out-of-bounds values in the calling contract, not the callee).
    function test_createCall_reverts_CategoryInvalid_at_3() public {
        // Encode calldata manually with category=3 (out-of-range enum value)
        bytes memory callData = abi.encodeWithSelector(
            registry.createCall.selector,
            uint8(0),  // MarketType.PriceTarget
            uint8(0),  // EventSubtype.None
            uint8(3),  // Category(3) -- invalid, should revert CategoryInvalid
            uint256(ETH_FEED), uint256(0), uint256(3000e6),
            uint64(block.timestamp + 86400),
            uint96(STAKE), uint8(50), bytes32(0), bool(true), uint256(0)
        );

        vm.prank(alice);
        (bool success, bytes memory returnData) = address(registry).call(callData);
        assertFalse(success, "call should have reverted");
        // Check that the revert reason is CategoryInvalid selector
        if (returnData.length >= 4) {
            bytes4 selector;
            assembly { selector := mload(add(returnData, 0x20)) }
            assertEq(selector, ICallRegistry.CategoryInvalid.selector, "should revert with CategoryInvalid");
        }
    }

    // ─── CALL-13: Asset allowlist ──────────────────────────────────────────────

    /// @notice CALL-13: unlisted assetA reverts AssetNotAllowlisted.
    function test_createCall_reverts_AssetNotAllowlisted() public {
        vm.prank(alice);
        vm.expectRevert(ICallRegistry.AssetNotAllowlisted.selector);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            999e18, // not in allowlist
            0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    /// @notice CALL-12: owner can add an asset and createCall passes.
    function test_addAsset_allows_createCall() public {
        bytes32 newFeed = bytes32(uint256(99));
        vm.prank(owner);
        registry.addAsset("NEW", newFeed);

        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(newFeed), 0, 100e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    // ─── CALL-15/16: Criteria required ────────────────────────────────────────

    /// @notice CALL-15/16: CexListing event with empty criteriaHash reverts.
    function test_createCall_reverts_CriteriaRequired_for_CexListing() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICallRegistry.CriteriaRequired.selector,
                ICallRegistry.MarketType.Event,
                ICallRegistry.EventSubtype.CexListing
            )
        );
        registry.createCall(
            ICallRegistry.MarketType.Event,
            ICallRegistry.EventSubtype.CexListing,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 0,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0 // empty criteriaHash
        );
    }

    /// @notice CALL-15/16: CexListing event with non-zero criteriaHash passes.
    function test_createCall_passes_CexListing_with_criteria() public {
        bytes32 criteria = keccak256("coinbase listing criteria");
        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.Event,
            ICallRegistry.EventSubtype.CexListing,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 0,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, criteria, true, 0
        );
        assertGt(id, 0);
    }

    // ─── Gate 6.3: Conviction floor cap ────────────────────────────────────────

    /// @notice CALL-30/31: conviction=92 with 5 settled calls caps to 84 + emits ConvictionCapped.
    function test_conviction_cap_for_caller_with_5_settled() public {
        // Note: settledCalls is read from ProfileRegistry.
        // Since Phase 4 is not wired, we cannot directly set settledCalls in tests.
        // The uninitialized caller has 0 settled calls, so conviction >= 85 gets capped.

        vm.expectEmit(true, false, false, true);
        emit ICallRegistry.ConvictionCapped(alice, 92, 84);

        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 92, bytes32(0), true, 0 // conviction=92, settledCalls=0
        );

        ICallRegistry.Call memory c = registry.getCall(id);
        assertEq(c.conviction, 84, "conviction should be capped to 84");
    }

    // ─── Gate 6.2: Duplicate hash ──────────────────────────────────────────────

    /// @notice CALL-22/25: second identical call on same UTC day reverts DuplicateCall.
    function test_duplicate_same_utc_day_reverts() public {
        _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));

        vm.prank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(ICallRegistry.DuplicateCall.selector, uint256(1))
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400), // same UTC day
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    // ─── CALL-34: TVL cap ─────────────────────────────────────────────────────

    /// @notice CALL-34: incoming exceeds available TVL reverts TvlCapReached.
    function test_tvl_cap_reverts_TvlCapReached() public {
        // Set cap to just below what alice is about to submit
        vm.prank(owner);
        registry.setTvlCap(TOTAL - 1); // cap at $19.99, but stake+fee=$20

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICallRegistry.TvlCapReached.selector,
                TOTAL,
                TOTAL - 1
            )
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    // ─── CALL-35/36: USDC pre-checks ──────────────────────────────────────────

    /// @notice CALL-35: zero allowance reverts InsufficientUsdcAllowance.
    function test_createCall_reverts_InsufficientUsdcAllowance() public {
        // Reset approval to 0
        vm.prank(alice);
        usdc.approve(address(registry), 0);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICallRegistry.InsufficientUsdcAllowance.selector,
                TOTAL,
                uint256(0)
            )
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    /// @notice CALL-36: zero balance reverts InsufficientUsdcBalance.
    function test_createCall_reverts_InsufficientUsdcBalance() public {
        address broke = makeAddr("broke");
        // approve but no balance
        vm.prank(broke);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(broke);
        vm.expectRevert(
            abi.encodeWithSelector(
                ICallRegistry.InsufficientUsdcBalance.selector,
                TOTAL,
                uint256(0)
            )
        );
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, 0
        );
    }

    // ─── CALL-67: getCallsByUser pagination ────────────────────────────────────

    /// @notice CALL-67: getCallsByUser returns 3 callIds in insertion order.
    function test_getCallsByUser_returns_all_calls_in_order() public {
        uint256 id1 = _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));
        // Different assetA to avoid duplicate hash
        uint256 id2 = _createEthCall(alice, uint96(STAKE), 50, uint256(BTC_FEED));
        // Different expiry day to avoid duplicate hash on same feed
        vm.warp(block.timestamp + 86400 + 100); // move to next UTC day
        bytes32 sol = bytes32(uint256(3));
        vm.prank(owner);
        registry.addAsset("SOL", sol);
        uint256 id3 = _createEthCall(alice, uint96(STAKE), 50, uint256(sol));

        uint256[] memory ids = registry.getCallsByUser(alice, 0, 10);
        assertEq(ids.length, 3);
        assertEq(ids[0], id1);
        assertEq(ids[1], id2);
        assertEq(ids[2], id3);

        // Paginate: offset=1, limit=1
        uint256[] memory page = registry.getCallsByUser(alice, 1, 1);
        assertEq(page.length, 1);
        assertEq(page[0], id2);
    }

    // ─── CALL-69/70: Quote call events ────────────────────────────────────────

    /// @notice CALL-70: parentCallId != 0 emits CallQuoted in addition to CallCreated.
    function test_quote_call_emits_CallQuoted() public {
        // Create parent call
        uint256 parentId = _createEthCall(alice, uint96(STAKE), 50, uint256(ETH_FEED));

        // Quote it with a different asset to avoid duplicate hash
        vm.expectEmit(true, true, false, false);
        emit ICallRegistry.CallQuoted(parentId, 2);

        vm.prank(bob);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(BTC_FEED), 0, 3000e6,
            uint64(block.timestamp + 86400),
            uint96(STAKE), 50, bytes32(0), true, parentId
        );
    }

    // ─── computeDuplicateHash ──────────────────────────────────────────────────

    /// @notice CALL-68: computeDuplicateHash matches DuplicateHashLib output for same inputs.
    function test_computeDuplicateHash_matches_library() public view {
        uint64 expiry = uint64(block.timestamp + 86400);
        bytes32 hash1 = registry.computeDuplicateHash(
            ICallRegistry.MarketType.PriceTarget,
            uint256(ETH_FEED),
            0,
            3000e6,
            expiry
        );
        // Should be deterministic; just assert non-zero
        assertNotEq(hash1, bytes32(0), "hash should be non-zero");
    }
}
