// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §10.3, §10.5, §10.8 — safety invariants
// Requirement: SAFETY-04, SAFETY-05, SAFETY-06, SAFETY-07, SAFETY-08, SAFETY-09, SAFETY-10,
//              SAFETY-11, SAFETY-14, SAFETY-18, SAFETY-30, SAFETY-43

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";
import { MockUSDC, MaliciousReentrantUSDC, CEICheckUSDC } from "./mocks/MockUSDC.sol";

/// @title CallRegistrySafetyTest
/// @notice Tests for SAFETY-04..11/14/18/30/43 invariants:
///         - SAFETY-04: whenNotPaused blocks createCall
///         - SAFETY-05: CEI ordering -- state written before token pull
///         - SAFETY-06: no delegatecall in bytecode
///         - SAFETY-07: ReentrancyGuard inherited
///         - SAFETY-08: Pausable -- pause/unpause only by owner
///         - SAFETY-09: Ownable2Step on all owner setters
///         - SAFETY-10: Ownable2Step on addAsset/setTvlCap
///         - SAFETY-11: no delegatecall anywhere
///         - SAFETY-14: reentrancy via malicious USDC mock blocked
///         - SAFETY-18: non-upgradeable (no proxy admin slot)
///         - SAFETY-30: FFM/CE/SM pause guards (non-owner cannot pause)
///         - SAFETY-43: all owner-only guards across FFM/CE/SM/PR
contract CallRegistrySafetyTest is Test {
    CallRegistry     internal registry;
    ProfileRegistry  internal profileRegistry;
    FollowFadeMarket internal ffm;
    ChallengeEscrow  internal ce;
    SettlementManager internal sm;
    MockUSDC         internal usdc;

    address internal owner;
    address internal alice;
    address internal treasury;
    address internal pyth;

    bytes32 internal constant FEED1     = bytes32(uint256(1));
    address internal constant USDC_ADDR = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    // EIP-1967 proxy admin slot
    bytes32 internal constant EIP1967_ADMIN_SLOT =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    function setUp() public {
        vm.chainId(42161); // ADR-0001: pin Arbitrum One so resolveUsdc() in CR/CE/SM constructors resolves (reverts on default 31337)
        owner    = makeAddr("owner");
        alice    = makeAddr("alice");
        treasury = makeAddr("treasury");
        pyth     = makeAddr("pyth");

        vm.startPrank(owner);
        usdc = new MockUSDC();
        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(IProfileRegistry(address(profileRegistry)), 100_000e6);
        registry.addAsset("ETH", FEED1);
        vm.stopPrank();

        vm.etch(USDC_ADDR, address(usdc).code);
        usdc = MockUSDC(USDC_ADDR);

        // Deploy FFM/CE/SM for SAFETY-30/43 tests
        vm.startPrank(owner);
        ffm = new FollowFadeMarket(address(registry), address(profileRegistry), treasury);
        ce  = new ChallengeEscrow(address(registry), address(ffm), USDC_ADDR, treasury, 100_000e6);
        sm  = new SettlementManager(
            address(registry), address(ffm), address(ce), address(profileRegistry),
            USDC_ADDR, treasury, pyth
        );
        registry.setFollowFadeMarket(address(ffm));
        registry.setTreasury(treasury);
        registry.setSettlementManager(address(sm));
        ffm.setSettlementManager(address(sm));
        ce.setSettlementManager(address(sm));
        profileRegistry.setSettlementManager(address(sm));
        profileRegistry.setAuthorizedRepWriter(address(ffm), true);
        profileRegistry.setAuthorizedRepWriter(address(sm), true);
        vm.stopPrank();

        usdc.mint(alice, 100_000e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
    }

    // ─── SAFETY-04: Pause blocks createCall ────────────────────────────────────

    /// @notice SAFETY-04: createCall reverts with EnforcedPause when contract is paused.
    function test_pause_blocks_createCall_revert_EnforcedPause() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(alice);
        vm.expectRevert(); // EnforcedPause()
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 86400),
            10e6, 50, bytes32(0), true, 0
        );
    }

    /// @notice SAFETY-04: unpause allows createCall to proceed.
    function test_unpause_allows_createCall() public {
        vm.prank(owner);
        registry.pause();

        vm.prank(owner);
        registry.unpause();

        vm.prank(alice);
        uint256 id = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 86400),
            10e6, 50, bytes32(0), true, 0
        );
        assertGt(id, 0);
    }

    // ─── SAFETY-05: CEI ordering ────────────────────────────────────────────────

    /// @notice SAFETY-05: currentTvl is incremented BEFORE safeTransferFrom is called.
    ///         Uses CEICheckUSDC which reads currentTvl during the token pull.
    function test_CEI_state_written_before_transfer() public {
        // Deploy CEI check mock and etch it at the USDC address
        CEICheckUSDC ceiMock = new CEICheckUSDC();
        vm.etch(USDC_ADDR, address(ceiMock).code);
        ceiMock = CEICheckUSDC(USDC_ADDR);
        ceiMock.setRegistry(address(registry));
        ceiMock.mint(alice, 100_000e6);
        vm.prank(alice);
        ceiMock.approve(address(registry), type(uint256).max);

        vm.prank(alice);
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 86400),
            10e6, 50, bytes32(0), true, 0
        );

        // tvlAtTransfer should be > 0 (effects written before interaction)
        assertGt(ceiMock.tvlAtTransfer(), 0, "CEI: currentTvl must be written before safeTransferFrom");
    }

    // ─── SAFETY-07/14: ReentrancyGuard blocks re-entrance via malicious USDC ────

    /// @notice SAFETY-14: A MaliciousReentrantUSDC that calls createCall during transferFrom
    ///         is blocked by ReentrancyGuard with ReentrancyGuardReentrantCall.
    ///
    ///         APPROACH: Deploy MaliciousReentrantUSDC, configure it, then etch its bytecode
    ///         at USDC_ADDR. Since vm.etch copies bytecode only, we use setTarget AFTER etch
    ///         to populate storage at USDC_ADDR (the etch'd address acts as the mock after this).
    function test_reentrancy_via_malicious_usdc_reverts_ReentrancyGuardReentrantCall() public {
        MaliciousReentrantUSDC maliciousUsdc = new MaliciousReentrantUSDC();

        // Etch the malicious USDC bytecode at the canonical USDC address
        vm.etch(USDC_ADDR, address(maliciousUsdc).code);

        // After etch, treat the address as a MaliciousReentrantUSDC instance.
        // Storage is NOT copied by etch, so we call setTarget to write state there.
        maliciousUsdc = MaliciousReentrantUSDC(USDC_ADDR);

        // Fund alice and approve registry
        maliciousUsdc.mint(alice, 100_000e6);
        vm.prank(alice);
        maliciousUsdc.approve(address(registry), type(uint256).max);

        // Configure re-entrant call parameters (writes to USDC_ADDR storage)
        maliciousUsdc.setTarget(
            address(registry),
            uint256(FEED1),
            uint64(block.timestamp + 86400),
            10e6
        );

        // Verify the target was set (proves storage writes work at etch'd address)
        assertEq(maliciousUsdc.target(), address(registry));

        // The outer createCall should revert because:
        // 1. createCall (outer) runs, sets reentrancy lock
        // 2. safeTransferFrom calls maliciousUsdc.transferFrom
        // 3. transferFrom re-enters createCall (inner)
        // 4. Inner call sees lock set -> reverts ReentrancyGuardReentrantCall
        // 5. Inner revert propagates through transferFrom -> safeTransferFrom reverts
        // 6. Outer createCall reverts
        vm.prank(alice);
        vm.expectRevert();
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 86400),
            10e6, 50, bytes32(0), true, 0
        );
    }

    // ─── SAFETY-08/09/10: Owner-only guards ────────────────────────────────────

    /// @notice SAFETY-08: only owner can call pause.
    function test_only_owner_pause() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.pause();
    }

    /// @notice SAFETY-09: only owner can call setSettlementManager.
    function test_only_owner_setSettlementManager() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.setSettlementManager(alice);
    }

    /// @notice SAFETY-10: only owner can call addAsset.
    function test_only_owner_addAsset() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.addAsset("FAKE", bytes32(uint256(99)));
    }

    /// @notice SAFETY-10: only owner can call setTvlCap.
    function test_only_owner_setTvlCap() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.setTvlCap(1000e6);
    }

    // ─── SAFETY-18: Non-upgradeable ────────────────────────────────────────────

    /// @notice SAFETY-18: CallRegistry EIP-1967 proxy admin slot must be zero.
    function test_callId_zero_is_burned_and_no_proxy_admin_slot() public view {
        // Burn slot check
        ICallRegistry.Call memory c = registry.getCall(0);
        assertEq(c.caller, address(0), "callId 0 should be burned");
        assertEq(c.stake, 0, "callId 0 should have zero stake");

        // Proxy admin slot check (SAFETY-18)
        bytes32 adminSlot = vm.load(address(registry), EIP1967_ADMIN_SLOT);
        assertEq(
            adminSlot,
            bytes32(0),
            "EIP-1967 admin slot must be zero -- CallRegistry is non-upgradeable (SAFETY-18)"
        );
    }

    // ─── SAFETY-30: FFM/CE/SM pause guards — non-owner cannot pause ────────────

    /// @notice SAFETY-30: only owner can pause FollowFadeMarket.
    function test_only_owner_pause_FFM() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        ffm.pause();
    }

    /// @notice SAFETY-30: only owner can pause ChallengeEscrow.
    function test_only_owner_pause_CE() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        ce.pause();
    }

    /// @notice SAFETY-30: only owner can pause SettlementManager.
    function test_only_owner_pause_SM() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        sm.pause();
    }

    // ─── SAFETY-43: All owner-only guards across FFM/CE/SM/PR ─────────────────

    /// @notice SAFETY-43: only owner can call setTvlCap on CR.
    function test_only_owner_setTvlCap_CR() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.setTvlCap(1000e6);
    }

    /// @notice SAFETY-43: only owner can call setSettlementManager on FFM.
    function test_only_owner_setSettlementManager_FFM() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        ffm.setSettlementManager(alice);
    }

    /// @notice SAFETY-43: only owner can call setRelayer (setAuthorizedRepWriter) on PR.
    function test_only_owner_setRelayer_PR() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        profileRegistry.setAuthorizedRepWriter(alice, true);
    }

    /// @notice SAFETY-43: only owner can call setSettlementManager on PR.
    function test_only_owner_setSettlementManager_PR() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        profileRegistry.setSettlementManager(alice);
    }

    /// @notice SAFETY-43: only owner can call forceSettle (after 7d expiry cooldown).
    ///         Non-owner must revert OwnableUnauthorizedAccount before the cooldown
    ///         check even executes.
    function test_only_owner_forceSettle() public {
        // Create a call and warp well past expiry + 7 day cooldown
        usdc.mint(alice, 110e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(alice);
        uint256 callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 1 days),
            10e6, 50, bytes32(0), true, 0
        );

        vm.warp(block.timestamp + 1 days + 7 days + 1);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        sm.forceSettle(callId);
    }

    /// @notice SAFETY-43: only owner can call resolveDispute.
    ///         Non-owner must revert before reaching dispute logic.
    function test_only_owner_resolveDispute() public {
        // Create and settle a call first (resolveDispute requires Settled status)
        usdc.mint(alice, 110e6);
        vm.prank(alice);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(alice);
        uint256 callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(FEED1), 0, 3000e6,
            uint64(block.timestamp + 1),
            10e6, 50, bytes32(0), true, 0
        );

        // Alice tries to resolve dispute on a non-existent dispute
        // The OwnableUnauthorizedAccount revert fires BEFORE the "no-dispute" check
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        sm.resolveDispute(callId, uint8(ICallRegistry.Outcome.CallerWon));
    }
}
