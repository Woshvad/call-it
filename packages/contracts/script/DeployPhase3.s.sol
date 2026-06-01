// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.3, §12.3 -- ChallengeEscrow deploy
// Requirement: SOCIAL-36, SOCIAL-48
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. TREASURY_ADDRESS must be set -- separate EOA or Safe, NEVER address(this)
//    Must be the SAME treasury used in Phase 2 (CallRegistry + FollowFadeMarket)
// 3. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 4. Run dry-sim: forge script script/DeployPhase3.s.sol:DeployPhase3 --rpc-url arbitrum_sepolia
// 5. If sim passes, broadcast:
//    forge script script/DeployPhase3.s.sol:DeployPhase3 \
//      --rpc-url arbitrum_sepolia --broadcast \
//      --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
// 6. Record deployed address in packages/shared/src/constants/addresses.ts
//    CHALLENGE_ESCROW_ARBITRUM_SEPOLIA = <deployed address>
// 7. Record deployed address + startBlock in packages/subgraph/subgraph.yaml
// 8. Verify on Arbiscan-Sepolia: https://sepolia.arbiscan.io/address/<addr>
//
// POST-DEPLOY VERIFICATION (§19.11):
// cast call <ChallengeEscrow> "getTvl()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0
// cast call <ChallengeEscrow> "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x0000000000000000000000000000000000000000
// cast call <ChallengeEscrow> "tvlCap()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 5000000000
// cast call <ChallengeEscrow> "callRegistry()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D
// cast call <ChallengeEscrow> "followFadeMarket()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";

/// @title DeployPhase3
/// @notice Deploys ChallengeEscrow to Arbitrum Sepolia.
///
///         Pre-requisites (from Phase 2 live deploy):
///         - CALL_REGISTRY    = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D (live on Sepolia)
///         - FOLLOW_FADE_MARKET = 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362 (live on Sepolia)
///
///         Deploy steps:
///         1. Read DEPLOYER_PRIVATE_KEY + TREASURY_ADDRESS from environment.
///         2. Deploy ChallengeEscrow(CALL_REGISTRY, FOLLOW_FADE_MARKET, USDC_ARB_NATIVE, treasury, tvlCap).
///         3. Post-deploy assertions (off-broadcast, no gas cost).
///         4. Print REQUIRED NEXT STEPS with address + block number.
///
///         Phase 4 wires the settleDuel seam: setSettlementManager() called once
///         on this contract by Phase 4; no ChallengeEscrow redeploy needed (D-01).
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after Sepolia staging gate >= 48h).
contract DeployPhase3 is Script {
    // ─── Phase 2 deployed addresses (Arbitrum Sepolia) ──────────────────────────
    // Source: packages/shared/src/constants/addresses.ts (populated 2026-05-30)
    // Verified on Arbiscan Sepolia after Phase 2 deploy (DeployPhase2.s.sol).

    /// @notice CallRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458669.
    address public constant CALL_REGISTRY = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D;

    /// @notice FollowFadeMarket on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458674.
    address public constant FOLLOW_FADE_MARKET = 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362;

    // ─── Deployment parameters ───────────────────────────────────────────────────

    /// @notice Initial TVL cap: $5,000 USDC (per spec §10.1, D-04 3-way cap).
    ///         Owner can raise up to $100,000 (ChallengeEscrow.MAX_ALLOWED_CAP).
    ///         Applies to ChallengeEscrow's portion of the 3-way TVL cap.
    uint256 public constant INITIAL_TVL_CAP = 5_000_000_000; // $5,000 USDC with 6 decimals

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Treasury must be a separate EOA or Safe -- NEVER address(this).
        // Use the same treasury as Phase 2 (CallRegistry + FollowFadeMarket).
        // Set TREASURY_ADDRESS in your .env before running this script.
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ─── Deploy ChallengeEscrow ─────────────────────────────────────────────
        // Constructor asserts:
        //   require(_callRegistry != address(0))
        //   require(_followFadeMarket != address(0))
        //   require(_usdc == USDC_ARB_NATIVE)         <-- CI invariant (T-3-03-01)
        //   require(_treasury != address(0) && _treasury != address(this))
        //   require(_tvlCap <= MAX_ALLOWED_CAP)
        // USDC_ARB_NATIVE imported from ./constants/USDC.sol (0xaf88d065...e5831)
        // to avoid literal paste (CI usdc-paste guard, T-3-03-01).
        ChallengeEscrow ce = new ChallengeEscrow(
            CALL_REGISTRY,
            FOLLOW_FADE_MARKET,
            USDC_ARB_NATIVE,
            treasuryAddress,
            INITIAL_TVL_CAP
        );

        console.log("ChallengeEscrow deployed at:", address(ce));
        console.log("Deploy block: use for subgraph.yaml startBlock");

        vm.stopBroadcast();

        // ─── Post-deploy assertions ──────────────────────────────────────────────
        // Run AFTER vm.stopBroadcast() -- view calls cost no gas.
        // Mirror of DeployPhase2.s.sol post-deploy assertion pattern (lines 215-281).
        // If any require fails, the script exits non-zero and deployment is flagged.

        // Assert zero TVL at deploy (no funds escrowed yet)
        require(
            ce.getTvl() == 0,
            "DeployPhase3: getTvl() should be 0 post-deploy"
        );

        // Assert settlementManager is address(0) at deploy (D-01 Phase-4 seam)
        require(
            ce.settlementManager() == address(0),
            "DeployPhase3: settlementManager should be address(0) post-deploy"
        );

        // Assert TVL cap set correctly (ChallengeEscrow's own portion cap)
        require(
            ce.tvlCap() == INITIAL_TVL_CAP,
            "DeployPhase3: tvlCap mismatch"
        );

        // Assert CallRegistry wired correctly in ChallengeEscrow
        require(
            address(ce.callRegistry()) == CALL_REGISTRY,
            "DeployPhase3: callRegistry address mismatch"
        );

        // Assert FollowFadeMarket wired correctly in ChallengeEscrow
        require(
            address(ce.followFadeMarket()) == FOLLOW_FADE_MARKET,
            "DeployPhase3: followFadeMarket address mismatch"
        );

        // ─── Deployment Summary ──────────────────────────────────────────────────
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("ChallengeEscrow:", address(ce));
        console.log("---");
        console.log("POST-DEPLOY ASSERTIONS: ALL PASSED");
        console.log("  getTvl()            -> 0                                          [OK]");
        console.log("  settlementManager() -> 0x0000000000000000000000000000000000000000 [OK]");
        console.log("  tvlCap()            -> 5000000000                                 [OK]");
        console.log("  callRegistry()      -> 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D [OK]");
        console.log("  followFadeMarket()  -> 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362 [OK]");
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts:");
        console.log("   CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =", address(ce));
        console.log("   Update CHALLENGE_ESCROW_ADDRESSES record to use the new constants.");
        console.log("2. Update packages/subgraph/subgraph.yaml:");
        console.log("   ChallengeEscrow address =", address(ce));
        console.log("   startBlock = <block number printed above>");
        console.log("   Remove blockHandlers entry from subgraph.yaml ChallengeEscrow section.");
        console.log("3. Rebuild and redeploy subgraph:");
        console.log("   cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia");
        console.log("---");
    }
}
