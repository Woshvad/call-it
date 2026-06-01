// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 — SettlementManager responsibilities
// Requirement: SETTLE-02, SETTLE-03, SETTLE-05, SETTLE-08, SETTLE-43, SETTLE-44, SETTLE-46
//
// RED GATE: This file WILL fail to compile until Plan 04-02 creates
//   packages/contracts/src/SettlementManager.sol
// That compile failure is the expected Wave 0 RED gate. Do not fix the import.
//
// Wave 0 test helper — abstract base for all SettlementManager test contracts.
// SmTestHelper extends CeTestHelper (4-contract stack: PR + CR + FFM + CE)
// and adds a deployed SettlementManager wired to all 4 contracts.

import { CeTestHelper } from "./CeTestHelper.sol";
import { SettlementManager } from "../../src/SettlementManager.sol"; // <-- RED GATE: does not exist yet

/// @title SmTestHelper
/// @notice Abstract helper that extends CeTestHelper with a deployed SettlementManager
///         wired to all 4 existing contracts (CallRegistry, FollowFadeMarket,
///         ChallengeEscrow, ProfileRegistry).
///
///         Boot order:
///           1. super.setUp() → ProfileRegistry + CallRegistry + FollowFadeMarket + MockUSDC
///              + ChallengeEscrow + challenger actor (full CeTestHelper chain)
///           2. Deploy SettlementManager as owner with (cr, ffm, ce, pr, USDC_ARB_NATIVE, treasury, pyth)
///              where pyth = makeAddr("pyth") for unit tests
///           3. Wire: cr.setSettlementManager, ffm.setSettlementManager,
///              ce.setSettlementManager, pr.setSettlementManager,
///              pr.setAuthorizedRepWriter(sm, true) — all vm.prank(owner)
///           4. Approve SettlementManager for alice, bob, challenger
///
///         Exposes:
///           - sm SettlementManager — the deployed contract
///           - pyth address — mock Pyth oracle address for unit tests
///           - DISPUTE_BOND constant ($5 USDC)
///           - FORCE_SETTLE_COOLDOWN constant (7 days)
///           - MAX_COUNTER_CLAIMS constant (3)
///           - DISPUTE_WINDOW constant (24 hours)
abstract contract SmTestHelper is CeTestHelper {
    // ─── Constants matching SettlementManager.sol (Plan 04-02) ───────────────
    uint256 internal constant DISPUTE_BOND           = 5e6;        // $5 USDC
    uint256 internal constant FORCE_SETTLE_COOLDOWN  = 7 days;     // 7 days from expiry
    uint8   internal constant MAX_COUNTER_CLAIMS     = 3;          // SETTLE-30
    uint256 internal constant DISPUTE_WINDOW         = 24 hours;   // SETTLE-29
    uint256 internal constant PROTOCOL_FEE_BPS       = 100;        // 1.0%
    uint256 internal constant CREATOR_FEE_BPS        = 40;         // 0.4%
    uint256 internal constant LP_FEE_BPS             = 30;         // 0.3%

    // ─── Deployed contract ────────────────────────────────────────────────────
    SettlementManager internal sm;

    // ─── Mock addresses for unit tests ───────────────────────────────────────
    address internal pyth; // makeAddr("pyth") — Pyth oracle stub for unit tests (not a fork test)

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public virtual override {
        // Step 1: boot the 4-contract stack (PR + CR + FFM + CE) + MockUSDC + all actors
        super.setUp();

        // Step 2: create mock Pyth address for unit tests
        pyth = makeAddr("pyth");

        // Step 3: deploy SettlementManager as owner
        vm.startPrank(owner);
        sm = new SettlementManager(
            address(registry),      // CallRegistry
            address(ffm),           // FollowFadeMarket
            address(ce),            // ChallengeEscrow
            address(profileRegistry), // ProfileRegistry
            USDC_ARB_NATIVE,
            treasury,
            pyth                    // Pyth oracle (mocked for unit tests)
        );

        // Step 4: wire SettlementManager into all 4 contracts
        registry.setSettlementManager(address(sm));
        ffm.setSettlementManager(address(sm));
        ce.setSettlementManager(address(sm));
        profileRegistry.setSettlementManager(address(sm));

        // Step 5: authorize SettlementManager as rep writer
        profileRegistry.setAuthorizedRepWriter(address(sm), true);

        vm.stopPrank();

        // Step 6: approve SettlementManager for all three actors
        vm.prank(alice);
        usdc.approve(address(sm), type(uint256).max);

        vm.prank(bob);
        usdc.approve(address(sm), type(uint256).max);

        vm.prank(challenger);
        usdc.approve(address(sm), type(uint256).max);

        // Step 7: set up default Pyth mocks so unit tests don't require VAA data.
        // testPythConfidenceGate and testAtomicRollback override these as needed.
        // Default: price=4000e8, conf=1 (narrow confidence), expo=-8
        // This makes the Pyth gate pass and outcome = CallerWon (price 4000 > target 3000).
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getUpdateFee(bytes[])"),
            abi.encode(uint256(0))
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("updatePriceFeeds(bytes[])"),
            abi.encode()
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getPriceNoOlderThan(bytes32,uint256)"),
            abi.encode(
                int64(4000_0000_0000),  // price: 4000 * 10^8 = 400000000000
                uint64(100),            // conf: 100 -- narrow (100*200=20000 < 400000000000)
                int32(-8),              // expo: -8
                uint256(block.timestamp)
            )
        );
    }
}
