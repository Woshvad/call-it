// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.2, §12.2 — FollowFadeMarket responsibilities
// Requirement: SOCIAL-01..28, D-01..D-06
//
// Wave 0 test helper — abstract base deployed by all FFM test contracts.
// FfmTestHelper.sol compiles independently; FollowFadeMarket.t.sol WILL fail
// to compile until Plan 02 creates FollowFadeMarket.sol (expected RED gate).

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../../src/CallRegistry.sol";
import { ProfileRegistry } from "../../src/ProfileRegistry.sol";
import { ICallRegistry } from "../../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../../src/interfaces/IProfileRegistry.sol";
import { MockUSDC } from "../mocks/MockUSDC.sol";
import { FollowFadeMarket } from "../../src/FollowFadeMarket.sol";
import { IFollowFadeMarket } from "../../src/interfaces/IFollowFadeMarket.sol";

/// @title FfmTestHelper
/// @notice Abstract helper that boots the 3-contract stack (ProfileRegistry v2,
///         CallRegistry v2, FollowFadeMarket), etches MockUSDC at the canonical
///         Arbitrum address, funds alice + bob, and exposes _seedPool().
///
///         All FFM test contracts inherit this. Wave 0: file exists but FFM
///         contracts do not yet — compile failure is the expected RED gate.
abstract contract FfmTestHelper is Test {
    // ─── Constants matching FollowFadeMarket.sol (Plan 02) ────────────────────
    uint256 internal constant MIN_POSITION        = 1e6;      // $1 USDC
    uint256 internal constant MAX_POSITION        = 100e6;    // $100 USDC
    uint256 internal constant POSITION_EXIT_PENALTY_PCT  = 10;        // 10%
    uint256 internal constant POSITION_EXIT_COOLDOWN     = 4 hours;   // 14400 seconds
    uint256 internal constant CALLER_EXIT_LOCK_DURATION  = 24 hours;  // 86400 seconds
    uint256 internal constant CALLER_EXIT_BASE_PCT       = 15;        // 15% floor
    uint256 internal constant CALLER_EXIT_VARIABLE_PCT   = 35;        // 35% variable
    uint256 internal constant INITIAL_SHARE_PRICE        = 1e12;

    // Standard Pyth feed IDs (deterministic for tests)
    bytes32 internal constant ETH_FEED  = bytes32(uint256(1));
    bytes32 internal constant BTC_FEED  = bytes32(uint256(2));
    bytes32 internal constant SOL_FEED  = bytes32(uint256(3));

    // Canonical USDC address on Arbitrum One
    address internal constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    // ─── Deployed contracts ───────────────────────────────────────────────────
    CallRegistry    internal registry;
    ProfileRegistry internal profileRegistry;
    FollowFadeMarket internal ffm;
    MockUSDC        internal usdc;

    // ─── Test actors ─────────────────────────────────────────────────────────
    address internal owner;
    address internal alice;
    address internal bob;
    address internal treasury;

    // ─── NFT collection stub ─────────────────────────────────────────────────
    address internal constant NFT_COLLECTION = address(0xBAD);

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public virtual {
        owner    = makeAddr("owner");
        alice    = makeAddr("alice");
        bob      = makeAddr("bob");
        treasury = makeAddr("treasury");

        // 1. Deploy a fresh MockUSDC to capture its bytecode
        MockUSDC mockImpl = new MockUSDC();

        // 2. Etch at the canonical USDC address (mirrors CallRegistry.sol constant)
        vm.etch(USDC_ARB_NATIVE, address(mockImpl).code);
        usdc = MockUSDC(USDC_ARB_NATIVE);

        // 3. Deploy the 3-contract stack as owner
        vm.startPrank(owner);
        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            5_000e6  // $5,000 initial TVL cap
        );
        ffm = new FollowFadeMarket(
            address(registry),
            address(profileRegistry),
            treasury
        );

        // 4. Wire FollowFadeMarket into CallRegistry (D-02)
        registry.setFollowFadeMarket(address(ffm));

        // 5. Authorize FollowFadeMarket as rep writer (D-04)
        profileRegistry.setAuthorizedRepWriter(address(ffm), true);

        // 6. Register test assets + one NFT collection
        registry.addAsset("ETH", ETH_FEED);
        registry.addAsset("BTC", BTC_FEED);
        registry.addAsset("SOL", SOL_FEED);
        registry.addNFTCollection(NFT_COLLECTION, "BAYC");
        vm.stopPrank();

        // 7. Fund alice + bob with 1000 USDC each
        usdc.mint(alice, 1000e6);
        usdc.mint(bob,   1000e6);

        // 8. Approve FFM + CallRegistry for max transfers
        vm.prank(alice);
        usdc.approve(address(ffm), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(bob);
        usdc.approve(address(ffm), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /// @notice Create a call as `caller` and seed the FollowFadeMarket pool.
    ///         Returns the callId. Uses ETH_FEED by default.
    function _seedPool(
        address caller,
        uint96  stake,
        uint64  expiry
    ) internal returns (uint256 callId) {
        // Mint enough for stake + $10 creation fee
        usdc.mint(caller, stake + 10e6);
        vm.prank(caller);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),  // assetA
            0,                  // assetB
            3000e6,             // targetValue
            expiry,
            stake,
            50,                 // conviction
            bytes32(0),
            true,
            0                   // parentCallId
        );
    }

    /// @notice Convenience overload: expiry = block.timestamp + 7 days.
    function _seedPool(address caller, uint96 stake) internal returns (uint256 callId) {
        return _seedPool(caller, stake, uint64(block.timestamp + 7 days));
    }

    /// @notice Create a call as `caller` with a specific assetFeed.
    function _seedPoolWithFeed(
        address caller,
        uint96  stake,
        bytes32 feed,
        uint64  expiry
    ) internal returns (uint256 callId) {
        usdc.mint(caller, stake + 10e6);
        vm.prank(caller);
        usdc.approve(address(registry), type(uint256).max);

        vm.prank(caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(feed),
            0,
            3000e6,
            expiry,
            stake,
            50,
            bytes32(0),
            true,
            0
        );
    }
}
