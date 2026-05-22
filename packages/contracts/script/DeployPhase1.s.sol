// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.1, §11.5, §19.11
// Requirement: SAFETY-18 (non-upgradeable), CALL-34 (tvlCap=$5,000 initial)
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 3. Run dry-sim: forge script script/DeployPhase1.s.sol:DeployPhase1 --rpc-url arbitrum_sepolia
// 4. If sim passes, broadcast:
//    forge script script/DeployPhase1.s.sol:DeployPhase1 \
//      --rpc-url arbitrum_sepolia --broadcast \
//      --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
// 5. Record addresses in packages/shared/src/constants/addresses.ts
// 6. Verify on Arbiscan-Sepolia: https://sepolia.arbiscan.io/address/<addr>
//
// POST-DEPLOY VERIFICATION (§19.11):
// cast call <CallRegistry> "currentTvl()" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL    -> 0
// cast call <CallRegistry> "tvlCap()" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL        -> 5000000000
// cast call <ProfileRegistry> "owner()" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL      -> deployer

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";

/// @title DeployPhase1
/// @notice Deploys ProfileRegistry and CallRegistry to Arbitrum Sepolia.
///
///         Order: ProfileRegistry first (no dependencies), then CallRegistry
///         (requires ProfileRegistry address for Gate 6.3).
///
///         Constructor arguments:
///         - ProfileRegistry: none (Ownable constructor takes msg.sender)
///         - CallRegistry:   (IProfileRegistry profileRegistry, uint256 tvlCap=$5,000)
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after Sepolia staging gate >= 48h).
contract DeployPhase1 is Script {
    /// @notice Initial TVL cap: $5,000 USDC (per spec §10.1).
    ///         Owner can raise up to $100,000 (CallRegistry.MAX_ALLOWED_CAP).
    uint256 public constant INITIAL_TVL_CAP = 5_000_000_000; // $5,000 USDC with 6 decimals

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // 1. Deploy ProfileRegistry (no constructor args; Ownable sets owner = deployer)
        ProfileRegistry profileRegistry = new ProfileRegistry();
        console.log("ProfileRegistry deployed at:", address(profileRegistry));

        // 2. Deploy CallRegistry with ProfileRegistry reference + initial TVL cap
        CallRegistry callRegistry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            INITIAL_TVL_CAP
        );
        console.log("CallRegistry deployed at:", address(callRegistry));

        vm.stopBroadcast();

        // Log the deployment summary for the operator to record in addresses.ts
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("ProfileRegistry:", address(profileRegistry));
        console.log("CallRegistry:", address(callRegistry));
        console.log("---");
        console.log("Record these addresses in:");
        console.log("packages/shared/src/constants/addresses.ts");
        console.log("  PROFILE_REGISTRY_ARBITRUM_SEPOLIA =", address(profileRegistry));
        console.log("  CALL_REGISTRY_ARBITRUM_SEPOLIA    =", address(callRegistry));

        // Verify post-deploy state
        require(
            callRegistry.tvlCap() == INITIAL_TVL_CAP,
            "DeployPhase1: tvlCap mismatch"
        );
        require(
            callRegistry.currentTvl() == 0,
            "DeployPhase1: currentTvl should be 0 post-deploy"
        );
        require(
            address(callRegistry.profileRegistry()) == address(profileRegistry),
            "DeployPhase1: profileRegistry reference mismatch"
        );
    }
}
