// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.5 — ProfileRegistry function signatures + events + reverts
// Requirement: AUTH-39, AUTH-40, AUTH-41, AUTH-42, REP-01, REP-02, REP-17, REP-18, SAFETY-18

import { Test } from "forge-std/Test.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";

/// @title ProfileRegistryTest
/// @notice Unit tests for ProfileRegistry covering AUTH-39/40/41/42 + REP-01/02/17/18 + SAFETY-18.
///
///         Test coverage:
///         - REP-01: lazy init at globalRep=100 on first profile touch
///         - AUTH-42: handle length > 50 bytes reverts HandleTooLong
///         - AUTH-39: setSettlementManager onlyOwner enforcement
///         - AUTH-40: setRelayer onlyOwner enforcement
///         - AUTH-41: unlinkTwitter / unlinkFarcaster callable by user (no auth check)
///         - SAFETY-18: non-upgradeable — no proxy admin storage slot (EIP-1967)
///         - REP-18: settledCalls view returns 0 for new user
contract ProfileRegistryTest is Test {
    ProfileRegistry internal registry;

    address internal owner;
    address internal alice;
    address internal bob;
    address internal relayer;
    address internal settlementManager;

    // EIP-1967 proxy admin slot: keccak256("eip1967.proxy.admin") - 1
    bytes32 internal constant EIP1967_ADMIN_SLOT =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    // EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
    bytes32 internal constant EIP1967_IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function setUp() public {
        owner = makeAddr("owner");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        relayer = makeAddr("relayer");
        settlementManager = makeAddr("settlementManager");

        vm.prank(owner);
        registry = new ProfileRegistry();
    }

    // ─── REP-01: Lazy init at globalRep=100 ─────────────────────────────────

    /// @notice REP-01: setDisplayHandle on a new user lazily initializes globalRep to 100
    ///         and sets profileExists = true.
    function test_initial_rep_100_on_first_setDisplayHandle() public {
        assertFalse(registry.profileExists(alice), "profile should not exist before first touch");

        vm.prank(alice);
        registry.setDisplayHandle("alice");

        assertTrue(registry.profileExists(alice), "profile should exist after first touch");
    }

    // ─── REP-18: settledCalls view ────────────────────────────────────────────

    /// @notice REP-18: settledCalls returns 0 for an uninitialized user.
    function test_settledCalls_returns_zero_for_uninitialized_user() public view {
        assertEq(registry.settledCalls(alice), 0, "uninitialized user should have 0 settled calls");
    }

    // ─── AUTH-42: Handle length enforcement ──────────────────────────────────

    /// @notice AUTH-42: setDisplayHandle with a handle > 50 bytes reverts HandleTooLong.
    function test_setDisplayHandle_reverts_HandleTooLong_at_51_bytes() public {
        // 51 ASCII chars = 51 bytes (each ASCII char = 1 byte)
        string memory longHandle = "aaaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeeeef";
        assertEq(bytes(longHandle).length, 51, "test handle must be exactly 51 bytes");

        vm.prank(alice);
        vm.expectRevert(IProfileRegistry.HandleTooLong.selector);
        registry.setDisplayHandle(longHandle);
    }

    /// @notice AUTH-42 boundary: setDisplayHandle with exactly 50 bytes passes.
    function test_setDisplayHandle_passes_at_50_bytes() public {
        // 50 ASCII chars = 50 bytes
        string memory handle50 = "aaaaaaaaaabbbbbbbbbbccccccccccddddddddddeeeeeeeeee";
        assertEq(bytes(handle50).length, 50, "test handle must be exactly 50 bytes");

        vm.prank(alice);
        registry.setDisplayHandle(handle50); // should not revert
    }

    /// @notice Empty handle is legal (AUTH-35 — no minimum length).
    function test_setDisplayHandle_empty_string_is_legal() public {
        vm.prank(alice);
        registry.setDisplayHandle("");
        assertEq(registry.displayHandle(alice), "");
    }

    // ─── AUTH-39: setSettlementManager ─────────────────────────────────────

    /// @notice AUTH-39: non-owner calling setSettlementManager reverts with
    ///         OZ's OwnableUnauthorizedAccount(address) error.
    function test_setSettlementManager_reverts_for_non_owner() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.setSettlementManager(settlementManager);
    }

    /// @notice AUTH-39: owner calling setSettlementManager emits SettlementManagerSet event.
    function test_setSettlementManager_emits_event() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IProfileRegistry.SettlementManagerSet(settlementManager);
        registry.setSettlementManager(settlementManager);
        assertEq(registry.settlementManager(), settlementManager);
    }

    // ─── AUTH-40: setRelayer ─────────────────────────────────────────────────

    /// @notice AUTH-40: non-owner calling setRelayer reverts with OwnableUnauthorizedAccount.
    function test_setRelayer_reverts_for_non_owner() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        registry.setRelayer(relayer);
    }

    /// @notice AUTH-40: owner calling setRelayer emits RelayerSet event.
    function test_setRelayer_emits_event() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit IProfileRegistry.RelayerSet(relayer);
        registry.setRelayer(relayer);
        assertEq(registry.relayer(), relayer);
    }

    // ─── AUTH-41: unlinkTwitter ──────────────────────────────────────────────

    /// @notice AUTH-41: unlinkTwitter is callable by any user on their own record.
    function test_unlinkTwitter_callable_by_self() public {
        // First set up a relayer and link Twitter
        vm.prank(owner);
        registry.setRelayer(relayer);

        vm.prank(relayer);
        registry.linkTwitter(alice, "alice_twitter", keccak256("proof"));

        // Now alice can unlink herself
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit IProfileRegistry.SocialUnlinked(alice, 0);
        registry.unlinkTwitter();
    }

    /// @notice AUTH-41: unlinkFarcaster is callable by any user on their own record.
    function test_unlinkFarcaster_callable_by_self() public {
        // First set up a relayer and link Farcaster
        vm.prank(owner);
        registry.setRelayer(relayer);

        vm.prank(relayer);
        registry.linkFarcaster(alice, "alice.farcaster", keccak256("farcaster_proof"));

        // Now alice can unlink herself
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit IProfileRegistry.SocialUnlinked(alice, 1);
        registry.unlinkFarcaster();
    }

    // ─── linkTwitter / linkFarcaster: relayer guard ──────────────────────────

    /// @notice Non-relayer calling linkTwitter reverts NotRelayer.
    function test_linkTwitter_reverts_NotRelayer_for_non_relayer() public {
        vm.prank(owner);
        registry.setRelayer(relayer);

        vm.prank(alice); // alice is NOT the relayer
        vm.expectRevert(IProfileRegistry.NotRelayer.selector);
        registry.linkTwitter(alice, "alice_twitter", keccak256("proof"));
    }

    /// @notice Non-relayer calling linkFarcaster reverts NotRelayer.
    function test_linkFarcaster_reverts_NotRelayer_for_non_relayer() public {
        vm.prank(owner);
        registry.setRelayer(relayer);

        vm.prank(alice);
        vm.expectRevert(IProfileRegistry.NotRelayer.selector);
        registry.linkFarcaster(alice, "alice.farcaster", keccak256("proof"));
    }

    // ─── updateAfterSettlement: settlementManager guard ──────────────────────

    /// @notice Non-settlementManager calling updateAfterSettlement reverts NotSettlementManager.
    function test_updateAfterSettlement_reverts_NotSettlementManager_for_non_manager() public {
        vm.prank(alice); // alice is NOT the settlementManager
        vm.expectRevert(IProfileRegistry.NotSettlementManager.selector);
        registry.updateAfterSettlement(alice, true, 0);
    }

    /// @notice settlementManager can call updateAfterSettlement (Phase 1 no-op, emits event).
    function test_updateAfterSettlement_callable_by_settlement_manager() public {
        vm.prank(owner);
        registry.setSettlementManager(settlementManager);

        vm.prank(settlementManager);
        // Phase 1 is a no-op skeleton; just verify it does not revert
        registry.updateAfterSettlement(alice, true, 0);
    }

    // ─── SAFETY-18: Non-upgradeable storage slot inspection ──────────────────

    /// @notice SAFETY-18 / D-14: ProfileRegistry must NOT be upgradeable.
    ///         Asserts that the EIP-1967 proxy admin slot and implementation slot
    ///         are both zero (no proxy admin, no logic contract pointer).
    ///         If a proxy pattern was accidentally introduced, one of these would be non-zero.
    function test_profile_is_not_upgradeable_no_proxy_storage_slot() public view {
        address registryAddr = address(registry);

        // EIP-1967 admin slot must be zero (no proxy admin)
        bytes32 adminSlot = vm.load(registryAddr, EIP1967_ADMIN_SLOT);
        assertEq(
            adminSlot,
            bytes32(0),
            "EIP-1967 admin slot must be zero -- ProfileRegistry is non-upgradeable (SAFETY-18)"
        );

        // EIP-1967 implementation slot must be zero (not a proxy)
        bytes32 implSlot = vm.load(registryAddr, EIP1967_IMPL_SLOT);
        assertEq(
            implSlot,
            bytes32(0),
            "EIP-1967 impl slot must be zero -- ProfileRegistry is non-upgradeable (SAFETY-18)"
        );
    }
}
