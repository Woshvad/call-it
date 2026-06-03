// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Requirement: SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20

/*
 * ============================================================================
 * PHASE-6 PLACEHOLDER ADDRESSES — READ BEFORE RUNNING
 * ============================================================================
 *
 * The 6 address constants in this contract are currently set to the
 * Phase-05.1 Sepolia cluster values (deployed 2026-06-02). They are
 * PLACEHOLDERS for two distinct reasons:
 *
 * GATE 1 — Sepolia rehearsal:
 *   Plan 06-02 broadcast (full Phase-6 Sepolia cluster redeploy with
 *   Circle USDC) has NOT yet run. Before executing the Sepolia rehearsal
 *   (Task 2 of this plan), ALL 6 address constants MUST be updated to the
 *   Phase-6 Sepolia cluster addresses produced by the 06-02 broadcast.
 *   The Phase-05.1 addresses below will cause post-broadcast require()
 *   failures if you run this script against the Phase-6 cluster.
 *
 * GATE 2 — Phase-7 mainnet ownership transfer:
 *   This script can only be run on Arbitrum One mainnet AFTER the Phase-7
 *   mainnet contract deploy produces real mainnet addresses for
 *   CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager,
 *   ProfileRegistry, and ProxyAdmin. Update all 6 constants to those
 *   mainnet values before broadcasting on Arbitrum One (chainId 42161).
 *   DO NOT broadcast this script to mainnet with Sepolia addresses — the
 *   post-broadcast require() assertions will catch the mismatch (wrong
 *   pendingOwner / owner), but gas will have been spent and the transfer
 *   will NOT be complete.
 *
 * PHASE-7 MAINNET USE: Before broadcasting on Arbitrum One, update all 6
 * address constants to mainnet values. Current values are Phase-05.1
 * Sepolia cluster PLACEHOLDERS. Mainnet contract addresses will be
 * assigned during Phase-7 deploy. Do NOT broadcast this script to mainnet
 * without updating these constants.
 * ============================================================================
 *
 * DUAL OWNERSHIP MECHANISM — CRITICAL:
 *
 *   5 protocol contracts (CallRegistry, FollowFadeMarket, ChallengeEscrow,
 *   SettlementManager, ProfileRegistry) inherit Ownable2Step:
 *     Step 1: transferOwnership(safe) → sets pendingOwner = safe
 *             owner() UNCHANGED until Safe executes acceptOwnership()
 *     Step 2: Safe executes acceptOwnership() → owner() = safe; pendingOwner = 0
 *
 *   ProxyAdmin (auto-created by OZ 5.x TransparentUpgradeableProxy) inherits
 *   plain Ownable (NOT Ownable2Step):
 *     transferOwnership(safe) is IMMEDIATE and FINAL — owner() = safe in the
 *     same transaction. No acceptOwnership() required. Safe becomes the proxy
 *     admin immediately; deployer loses ProxyAdmin access in the same tx.
 *
 *   This asymmetry is intentional:
 *   - Ownable2Step for protocol contracts: if the Safe address is wrong, the
 *     deployer retains owner() and can cancel by calling transferOwnership(0)
 *     before the Safe calls acceptOwnership. This provides a safety window.
 *   - Plain Ownable for ProxyAdmin: OZ 5.x ProxyAdmin uses Ownable not
 *     Ownable2Step. The deployer loses admin power immediately. Verify
 *     cast call PROXY_ADMIN "owner()(address)" == SAFE immediately after
 *     this script runs (post-broadcast require() already asserts this).
 *
 * ============================================================================
 *
 * Usage (after updating address constants above):
 *
 *   Sepolia rehearsal:
 *     export SAFE_ADDRESS=<address from deploy-safe.ts --network sepolia --execute>
 *     export DEPLOYER_PRIVATE_KEY=<deployer key>
 *     forge script script/TransferOwnershipToSafe.s.sol:TransferOwnershipToSafe \
 *       --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast
 *
 *   Phase-7 mainnet (after updating ALL address constants to mainnet values):
 *     export SAFE_ADDRESS=<address from deploy-safe.ts --network arbitrum-one --execute>
 *     export DEPLOYER_PRIVATE_KEY=<deployer key>
 *     forge script script/TransferOwnershipToSafe.s.sol:TransferOwnershipToSafe \
 *       --rpc-url $ARBITRUM_ONE_RPC_URL --broadcast
 *
 * After running this script, the Safe must execute acceptOwnership() on
 * the 5 Ownable2Step contracts. Run: node scripts/rehearse-ownership.ts
 *
 * ============================================================================
 */

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";

// ── Phase contract source imports (Sepolia + mainnet share the same logic) ────
import { CallRegistry } from "../src/CallRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";

/// @title TransferOwnershipToSafe
/// @notice Transfers ownership of all 6 protocol ownership surfaces to the Safe multisig.
///
///         Handles two distinct mechanisms (see block comment at top of file):
///         - 5 Ownable2Step contracts: sets pendingOwner. Safe must run acceptOwnership().
///         - ProxyAdmin (plain Ownable): immediate transfer. Safe is admin after this tx.
///
///         Post-broadcast assertions confirm all transfers initiated correctly.
///         See REQUIRED NEXT STEPS at end of run() for continuation.
///
/// Requirements: SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20
contract TransferOwnershipToSafe is Script {
    // ─────────────────────────────────────────────────────────────────────────
    // Address constants
    // IMPORTANT: See the PLACEHOLDER ADDRESSES block comment at the top of this
    // file. These are Phase-05.1 Sepolia values. Update before running.
    // ─────────────────────────────────────────────────────────────────────────

    // Phase-05.1 Sepolia cluster addresses (2026-06-02 deploy).
    // REPLACE with Phase-6 Sepolia addresses from 06-02 broadcast before Sepolia rehearsal.
    // REPLACE with Arbitrum One mainnet addresses from Phase-7 deploy before mainnet transfer.

    /// @notice CallRegistry on Sepolia (Phase-05.1 placeholder).
    address public constant CALL_REGISTRY =
        0x9E3E467e5D1F1266354444CEaC67651c7e9CACEc;

    /// @notice FollowFadeMarket on Sepolia (Phase-05.1 placeholder).
    address public constant FOLLOW_FADE_MARKET =
        0x5Aa7bC9ee202AD9197CB109e7EcF3d7d99C72a48;

    /// @notice ChallengeEscrow on Sepolia (Phase-05.1 placeholder).
    address public constant CHALLENGE_ESCROW =
        0xf0D65BFd5dFa4e40c81d198DD7ED78423a26Fdea;

    /// @notice SettlementManager on Sepolia (Phase-05.1 placeholder).
    address public constant SETTLEMENT_MANAGER =
        0x765f6ecd85059CF8eF59286DF578AEC0B13230fC;

    /// @notice ProfileRegistry on Sepolia (unchanged from Phase 05.1; not redeployed by Phase 6).
    address public constant PROFILE_REGISTRY =
        0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E;

    /// @notice ProxyAdmin (auto-created by OZ 5.x proxy; unchanged from Phase 5 deploy).
    /// @dev Plain Ownable — transferOwnership is immediate, not 2-step.
    address public constant PROXY_ADMIN_ADDR =
        0xAeA5a279DDF1625490c5F4284eF0D735BB56044a;

    // ─────────────────────────────────────────────────────────────────────────
    // run()
    // ─────────────────────────────────────────────────────────────────────────

    function run() external {
        // Read SAFE_ADDRESS from env. Must be set to the output of deploy-safe.ts.
        // Threat T-06-06-04: post-broadcast assertions will catch a wrong address,
        // but gas is spent. Double-check SAFE_ADDRESS before broadcasting.
        address safe = vm.envAddress("SAFE_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        console.log("TransferOwnershipToSafe: starting ownership transfer");
        console.log("  Safe address:", safe);
        console.log("  Deployer:   ", vm.addr(deployerKey));
        console.log("---");
        console.log("WARNING: These address constants are Phase-05.1 Sepolia PLACEHOLDERS.");
        console.log("         Update before running against Phase-6 cluster or mainnet.");
        console.log("---");

        vm.startBroadcast(deployerKey);

        // ── 5 Ownable2Step contracts (2-step transfer — sets pendingOwner only) ──
        //
        // After this script runs, owner() is UNCHANGED for these 5 contracts.
        // The Safe must call acceptOwnership() on each to complete the transfer.
        // Run: node scripts/rehearse-ownership.ts

        CallRegistry(CALL_REGISTRY).transferOwnership(safe);
        FollowFadeMarket(FOLLOW_FADE_MARKET).transferOwnership(safe);
        ChallengeEscrow(CHALLENGE_ESCROW).transferOwnership(safe);
        SettlementManager(payable(SETTLEMENT_MANAGER)).transferOwnership(safe);
        ProfileRegistry(PROFILE_REGISTRY).transferOwnership(safe);

        // ── ProxyAdmin (plain Ownable — IMMEDIATE, single-step transfer) ──────
        //
        // OZ 5.x auto-created ProxyAdmin uses Ownable (not Ownable2Step).
        // This call is final: deployer loses ProxyAdmin access immediately.
        // Safe becomes the proxy admin in this same transaction.

        ProxyAdmin(PROXY_ADMIN_ADDR).transferOwnership(safe);

        vm.stopBroadcast();

        // ─────────────────────────────────────────────────────────────────────
        // Post-broadcast verification (view calls — no gas cost)
        //
        // For Ownable2Step: assert pendingOwner == safe (owner() still = deployer)
        // For ProxyAdmin:   assert owner() == safe (single-step, immediate)
        // ─────────────────────────────────────────────────────────────────────

        // CallRegistry — Ownable2Step
        require(
            Ownable2Step(CALL_REGISTRY).pendingOwner() == safe,
            "TransferOwnershipToSafe: CallRegistry pendingOwner mismatch"
        );

        // FollowFadeMarket — Ownable2Step
        require(
            Ownable2Step(FOLLOW_FADE_MARKET).pendingOwner() == safe,
            "TransferOwnershipToSafe: FollowFadeMarket pendingOwner mismatch"
        );

        // ChallengeEscrow — Ownable2Step
        require(
            Ownable2Step(CHALLENGE_ESCROW).pendingOwner() == safe,
            "TransferOwnershipToSafe: ChallengeEscrow pendingOwner mismatch"
        );

        // SettlementManager — Ownable2Step
        require(
            Ownable2Step(SETTLEMENT_MANAGER).pendingOwner() == safe,
            "TransferOwnershipToSafe: SettlementManager pendingOwner mismatch"
        );

        // ProfileRegistry — Ownable2Step
        require(
            Ownable2Step(PROFILE_REGISTRY).pendingOwner() == safe,
            "TransferOwnershipToSafe: ProfileRegistry pendingOwner mismatch"
        );

        // ProxyAdmin — plain Ownable (immediate transfer — check owner(), not pendingOwner)
        require(
            ProxyAdmin(PROXY_ADMIN_ADDR).owner() == safe,
            "TransferOwnershipToSafe: ProxyAdmin owner mismatch"
        );

        // ─────────────────────────────────────────────────────────────────────
        // Deployment summary
        // ─────────────────────────────────────────────────────────────────────

        console.log("---");
        console.log("DEPLOYMENT SUMMARY");
        console.log("Safe:", safe);
        console.log("");
        console.log("Ownable2Step contracts (pendingOwner = Safe; owner() UNCHANGED):");
        console.log("  CallRegistry       pendingOwner:", Ownable2Step(CALL_REGISTRY).pendingOwner());
        console.log("  FollowFadeMarket   pendingOwner:", Ownable2Step(FOLLOW_FADE_MARKET).pendingOwner());
        console.log("  ChallengeEscrow    pendingOwner:", Ownable2Step(CHALLENGE_ESCROW).pendingOwner());
        console.log("  SettlementManager  pendingOwner:", Ownable2Step(SETTLEMENT_MANAGER).pendingOwner());
        console.log("  ProfileRegistry    pendingOwner:", Ownable2Step(PROFILE_REGISTRY).pendingOwner());
        console.log("");
        console.log("ProxyAdmin (plain Ownable -- IMMEDIATE transfer):");
        console.log("  ProxyAdmin         owner():     ", ProxyAdmin(PROXY_ADMIN_ADDR).owner());
        console.log("");

        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("");
        console.log("  1. Safe must execute acceptOwnership() on 5 Ownable2Step contracts.");
        console.log("     Run: node scripts/rehearse-ownership.ts");
        console.log("     (with SAFE_ADDRESS, SIGNER_1_PRIVATE_KEY, SIGNER_2_PRIVATE_KEY set)");
        console.log("");
        console.log("  2. After rehearse-ownership.ts completes, verify owner() == Safe on all 5:");
        console.log("     cast call $CR   \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("     cast call $FFM  \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("     cast call $CE   \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("     cast call $SM   \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("     cast call $PR   \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("");
        console.log("  3. ProxyAdmin ownership is already transferred (no acceptOwnership needed):");
        console.log("     cast call $PROXY_ADMIN \"owner()(address)\" --rpc-url $RPC == $SAFE");
        console.log("     (should already return Safe address from this script)");
        console.log("");
        console.log("  4. Prove Safe-gated ops work (via Safe UI at app.safe.global):");
        console.log("     a) Propose pause() on CallRegistry. Signer 2 confirms. Execute.");
        console.log("        cast call $CR \"paused()(bool)\" -> true");
        console.log("     b) Propose unpause(). Execute. cast call $CR \"paused()(bool)\" -> false");
        console.log("     c) Propose ProxyAdmin.upgradeAndCall($PROXY, $BASELINE, \"\"). Execute.");
        console.log("        Verify impl slot. Restore.");
        console.log("---");
    }
}
