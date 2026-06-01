// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.4, §12.4 -- SettlementManager deploy + wiring
// Requirement: SETTLE-01, SETTLE-04, OPS-15, OPS-16
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. TREASURY_ADDRESS must be set -- separate EOA or Safe, NEVER address(this)
//    Must be the SAME treasury used in Phase 2 (CallRegistry + FollowFadeMarket)
// 3. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 4. Run dry-sim: forge script script/DeployPhase4.s.sol:DeployPhase4 --rpc-url arbitrum_sepolia
// 5. If sim passes, broadcast:
//    forge script script/DeployPhase4.s.sol:DeployPhase4 \
//      --rpc-url arbitrum_sepolia --broadcast \
//      --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
// 6. Record NEW FFM v2 address in packages/shared/src/constants/addresses.ts:
//    FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA = <new ffmV2 address>
// 7. Record NEW SM address in packages/shared/src/constants/addresses.ts:
//    SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = <sm address>
// 8. Update packages/subgraph/subgraph.yaml:
//    SettlementManager address + startBlock (from console output below)
//    FollowFadeMarket address updated to v2 + startBlock
// 9. Rebuild and redeploy subgraph to Studio:
//    cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia
//
// POST-DEPLOY VERIFICATION (§19.11):
// cast call <SettlementManager> "callRegistry()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D
// cast call <SettlementManager> "followFadeMarket()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <new FFM v2 address>
// cast call <CallRegistry> "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <SettlementManager address>
// cast call <FFM v2> "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <SettlementManager address>
// cast call <ChallengeEscrow> "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <SettlementManager address>
// cast call <ProfileRegistry> "authorizedRepWriters(address)(bool)" <SM_ADDR> \
//   --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> true
// cast balance <SettlementManager> --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> >= 50000000000000000 (0.05 ETH in wei)

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";

/// @title DeployPhase4
/// @notice Deploys FollowFadeMarket v2 and SettlementManager to Arbitrum Sepolia,
///         wires setSettlementManager on all 4 contracts, authorizes SM as rep writer,
///         and funds SM with 0.1 ETH for Pyth update fees.
///
///         Keystone: ONLY FollowFadeMarket is redeployed (adds applySettlement + real
///         claimPayout). CallRegistry, ChallengeEscrow, and ProfileRegistry are unchanged
///         and NOT redeployed -- they already have setSettlementManager() seams from Phase 2/3.
///
///         Phase 4 settles: setSettlementManager(sm) on all 4, setAuthorizedRepWriter(sm, true).
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after >=48h Sepolia staging gate).
contract DeployPhase4 is Script {
    // ─── Phase 2/3 deployed addresses (Arbitrum Sepolia, UNCHANGED) ─────────────
    // Source: packages/shared/src/constants/addresses.ts (populated 2026-05-30/2026-06-01)
    // Verified on Arbiscan Sepolia after each phase deploy.

    /// @notice CallRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458669.
    ///         NOT redeployed in Phase 4.
    address public constant CALL_REGISTRY = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D;

    /// @notice ChallengeEscrow on Arbitrum Sepolia.
    ///         Deployed via DeployPhase3.s.sol at block 272815420.
    ///         NOT redeployed in Phase 4.
    address public constant CHALLENGE_ESCROW = 0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2;

    /// @notice ProfileRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458667.
    ///         NOT redeployed in Phase 4.
    address public constant PROFILE_REGISTRY = 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E;

    // ─── Oracle address ──────────────────────────────────────────────────────────

    /// @notice Pyth price feed contract on Arbitrum Sepolia.
    ///         Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
    ///         Source: CLAUDE.md "Pinned Addresses"
    address public constant PYTH_ARBITRUM_SEPOLIA = 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF;

    // ─── Deployment parameters ───────────────────────────────────────────────────

    /// @notice ETH funded into SettlementManager for Pyth update fees (Pitfall 4).
    ///         0.05 ETH initial budget. Relayer monitors and tops up when < 0.01 ETH.
    ///         OPS-15 runbook covers top-up procedure.
    uint256 public constant PYTH_ETH_BUDGET = 0.05 ether;

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Treasury must be a separate EOA or Safe -- NEVER address(this).
        // Use the same treasury as Phase 2 (CallRegistry + FollowFadeMarket + ChallengeEscrow).
        // Set TREASURY_ADDRESS in your .env before running this script.
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ─── 1. Deploy FollowFadeMarket v2 ─────────────────────────────────────
        // Adds: applySettlement (CEI, idempotency, CALL-41), real claimPayout
        //       (pull-pattern, CEI, Math.mulDiv), getFadeRealReserve, setSettlementManager.
        // Same constructor as Phase 2 FFM -- wired to existing CR + PR.
        // Old FFM 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362 is REPLACED (addresses.ts updated post-deploy).
        FollowFadeMarket ffmV2 = new FollowFadeMarket(
            CALL_REGISTRY,
            PROFILE_REGISTRY,
            treasuryAddress
        );

        console.log("FollowFadeMarket v2 deployed at:", address(ffmV2));

        // ─── 2. Deploy SettlementManager ────────────────────────────────────────
        // Constructor: (callRegistry, followFadeMarketV2, challengeEscrow, profileRegistry,
        //               USDC_ARB_NATIVE, treasury, pythSepolia)
        // USDC MANDATE: USDC_ARB_NATIVE imported from ./constants/USDC.sol (no inline address).
        // The require(_usdc == USDC_ARB_NATIVE) gate in the constructor validates at deploy time.
        SettlementManager sm = new SettlementManager(
            CALL_REGISTRY,
            address(ffmV2),
            CHALLENGE_ESCROW,
            PROFILE_REGISTRY,
            USDC_ARB_NATIVE,
            treasuryAddress,
            PYTH_ARBITRUM_SEPOLIA
        );

        console.log("SettlementManager deployed at:", address(sm));

        // ─── 3. Wire setSettlementManager on all 4 contracts ────────────────────
        // Each contract's setSettlementManager() is onlyOwner (deployer key in Phase 4).
        // Phase 6 multisig promotion rotates ownership.

        // 3a. CallRegistry -- rotates the settlementManager slot from 0x0 (D-01 Phase-2 seam)
        ICallRegistry(CALL_REGISTRY).setSettlementManager(address(sm));
        console.log("CallRegistry.setSettlementManager -> SM:", address(sm));

        // 3b. FollowFadeMarket v2 -- NEW FFM v2 (settlementManager starts at 0x0 post-deploy)
        ffmV2.setSettlementManager(address(sm));
        console.log("FollowFadeMarket v2.setSettlementManager -> SM:", address(sm));

        // 3c. ChallengeEscrow -- rotates the settlementManager slot from 0x0 (D-01 Phase-3 seam)
        IChallengeEscrow(CHALLENGE_ESCROW).setSettlementManager(address(sm));
        console.log("ChallengeEscrow.setSettlementManager -> SM:", address(sm));

        // 3d. ProfileRegistry -- setSettlementManager (not an onlySettlementManager guard
        //     on profile updates -- SM joins authorizedRepWriters separately in step 4)
        IProfileRegistry(PROFILE_REGISTRY).setSettlementManager(address(sm));
        console.log("ProfileRegistry.setSettlementManager -> SM:", address(sm));

        // ─── 4. Authorize SettlementManager as rep writer ───────────────────────
        // SM calls pr.applyRepDelta + pr.updateAfterSettlement -- both require authorization.
        // Per spec §12.5 + Phase-2 D-04.
        IProfileRegistry(PROFILE_REGISTRY).setAuthorizedRepWriter(address(sm), true);
        console.log("ProfileRegistry.setAuthorizedRepWriter(SM, true) -> authorized");

        // ─── 5. Fund SettlementManager with ETH for Pyth fees ───────────────────
        // Pyth pull-oracle requires ETH to pay for VAA update fees (Pitfall 4).
        // Initial budget: 0.05 ETH (covers ~50-100 settlements depending on gas price).
        // Relayer monitors balance; OPS-15 covers top-up when < 0.01 ETH.
        // SM's receive() accepts ETH top-ups.
        payable(address(sm)).transfer(PYTH_ETH_BUDGET);
        console.log("Funded SettlementManager with 0.05 ETH for Pyth update fees");

        vm.stopBroadcast();

        // ─── Post-deploy assertions ──────────────────────────────────────────────
        // Run AFTER vm.stopBroadcast() -- view calls cost no gas.
        // If any require fails, the script exits non-zero and deployment is flagged.

        // Assert SM has correct callRegistry immutable
        require(
            address(sm.callRegistry()) == CALL_REGISTRY,
            "DeployPhase4: sm.callRegistry() mismatch"
        );

        // Assert SM has correct followFadeMarket immutable (FFM v2)
        require(
            address(sm.followFadeMarket()) == address(ffmV2),
            "DeployPhase4: sm.followFadeMarket() mismatch"
        );

        // Assert SM has correct challengeEscrow immutable
        require(
            address(sm.challengeEscrow()) == CHALLENGE_ESCROW,
            "DeployPhase4: sm.challengeEscrow() mismatch"
        );

        // Assert SM has correct profileRegistry immutable
        require(
            address(sm.profileRegistry()) == PROFILE_REGISTRY,
            "DeployPhase4: sm.profileRegistry() mismatch"
        );

        // Assert SM has correct treasury immutable
        require(
            sm.treasury() == treasuryAddress,
            "DeployPhase4: sm.treasury() mismatch"
        );

        // Assert SM has correct pyth immutable
        require(
            address(sm.pyth()) == PYTH_ARBITRUM_SEPOLIA,
            "DeployPhase4: sm.pyth() mismatch"
        );

        // Assert CallRegistry.settlementManager() == SM
        // (public state variable getter -- use concrete contract type for assertion)
        require(
            CallRegistry(CALL_REGISTRY).settlementManager() == address(sm),
            "DeployPhase4: CR.settlementManager() mismatch"
        );

        // Assert FFM v2.settlementManager() == SM
        require(
            ffmV2.settlementManager() == address(sm),
            "DeployPhase4: FFM.settlementManager() mismatch"
        );

        // Assert ChallengeEscrow.settlementManager() == SM
        require(
            ChallengeEscrow(CHALLENGE_ESCROW).settlementManager() == address(sm),
            "DeployPhase4: CE.settlementManager() mismatch"
        );

        // Assert ProfileRegistry.settlementManager() == SM
        require(
            ProfileRegistry(PROFILE_REGISTRY).settlementManager() == address(sm),
            "DeployPhase4: PR.settlementManager() mismatch"
        );

        // Assert ProfileRegistry authorizes SM as rep writer
        require(
            ProfileRegistry(PROFILE_REGISTRY).authorizedRepWriters(address(sm)),
            "DeployPhase4: PR.authorizedRepWriters(SM) != true"
        );

        // Assert SM has ETH budget (0.05 ETH funded in step 5)
        require(
            address(sm).balance >= PYTH_ETH_BUDGET,
            "DeployPhase4: SM ETH balance < 0.05 ether"
        );

        // ─── Deployment Summary ──────────────────────────────────────────────────
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("FollowFadeMarket v2:", address(ffmV2));
        console.log("SettlementManager:", address(sm));
        console.log("---");
        console.log("POST-DEPLOY ASSERTIONS: ALL PASSED");
        console.log("  sm.callRegistry()         -> CALL_REGISTRY                          [OK]");
        console.log("  sm.followFadeMarket()     -> FFM v2 address                         [OK]");
        console.log("  sm.challengeEscrow()      -> CHALLENGE_ESCROW                       [OK]");
        console.log("  sm.profileRegistry()      -> PROFILE_REGISTRY                       [OK]");
        console.log("  CR.settlementManager()    -> SM address                             [OK]");
        console.log("  FFM.settlementManager()   -> SM address                             [OK]");
        console.log("  CE.settlementManager()    -> SM address                             [OK]");
        console.log("  PR.settlementManager()    -> SM address                             [OK]");
        console.log("  PR.authorizedRepWriters() -> true                                   [OK]");
        console.log("  SM ETH balance            -> 0.05 ether                            [OK]");
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts:");
        console.log("   FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =", address(ffmV2));
        console.log("   SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =", address(sm));
        console.log("   Update SETTLEMENT_MANAGER_ADDRESSES record to use the new constant.");
        console.log("   Update FOLLOW_FADE_MARKET_ADDRESSES record to use updated FFM.");
        console.log("2. Update packages/subgraph/subgraph.yaml:");
        console.log("   SettlementManager address =", address(sm));
        console.log("   FollowFadeMarket address =", address(ffmV2));
        console.log("   startBlock = <block number printed above>");
        console.log("3. Rebuild and redeploy subgraph to Studio:");
        console.log("   cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia");
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands):");
        console.log("  cast call", address(sm), "\"callRegistry()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  cast call", address(sm), "\"followFadeMarket()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  cast call", CALL_REGISTRY, "\"settlementManager()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  cast balance", address(sm), "--rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("---");
    }
}
