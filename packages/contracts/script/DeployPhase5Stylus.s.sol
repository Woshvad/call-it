// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md ss11.4, ss11.6 -- StylusScoreEngine proxy + impl deploy
// Requirement: REP-19, REP-21, REP-24, OPS-16
//
// DEPLOYMENT SAFETY CHECKLIST (ss19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. STYLUS_IMPL_ADDRESS must be set -- output from `cargo stylus deploy` on Arbitrum Sepolia
//    Run: cargo stylus deploy --endpoint $ARBITRUM_SEPOLIA_RPC_URL
//         cargo stylus activate --address <WASM_ADDR> --endpoint $ARBITRUM_SEPOLIA_RPC_URL
//    Then export: export STYLUS_IMPL_ADDRESS=<deployed_wasm_address>
// 3. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 4. Run dry-sim: forge script script/DeployPhase5Stylus.s.sol:DeployPhase5Stylus --rpc-url arbitrum_sepolia
// 5. If sim passes, broadcast:
//    forge script script/DeployPhase5Stylus.s.sol:DeployPhase5Stylus \
//      --rpc-url arbitrum_sepolia --broadcast \
//      --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
// 6. Update packages/shared/src/constants/addresses.ts with all 4 Phase 5 addresses
// 7. Set fly secret: fly secrets set STYLUS_SCORE_ENGINE_ADDRESS=<proxy_addr> --app call-it-relayer-sepolia
// 8. Repoint calendar: pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date $(date +%Y-%m-%d)
// 9. Run CutoffFallback.s.sol upgrade round-trip on Sepolia (REP-21, REP-24)
//
// POST-DEPLOY VERIFICATION (ss19.11):
// cast call <SM> "stylusScoreEngine()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <proxy address>
// cast call <proxy> "compute_rep_change(uint128,uint8,uint8,bool,uint256)" 100 50 50 true 10 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> non-zero int32
// cast call <proxyAdmin> "owner()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <deployer address>

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { StatelessTransparentProxy } from "../src/StatelessTransparentProxy.sol";
import { SolidityScoreEngine } from "../src/SolidityScoreEngine.sol";
import { RevertingStylusEngine } from "../src/RevertingStylusEngine.sol";
import { SettlementManager } from "../src/SettlementManager.sol";

/// @title DeployPhase5Stylus
/// @notice Deploys SolidityScoreEngine (48h-cutoff fallback) + RevertingStylusEngine (Phase 6 drill)
///         + ProxyAdmin + TransparentUpgradeableProxy pointing at Stylus WASM impl,
///         then wires the proxy into SettlementManager.setStylusScoreEngine().
///
///         Keystone: SettlementManager, CallRegistry, FollowFadeMarket, ChallengeEscrow,
///         and ProfileRegistry are UNCHANGED and NOT redeployed in Phase 5.
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after >=48h Sepolia staging gate).
contract DeployPhase5Stylus is Script {
    // ---------------------------------------------------------------------------
    // Phase 4 deployed addresses (Arbitrum Sepolia, UNCHANGED)
    // Source: packages/shared/src/constants/addresses.ts (populated 2026-05-30/2026-06-01)
    // NOT redeployed in Phase 5.
    // ---------------------------------------------------------------------------

    /// @notice SettlementManager on Arbitrum Sepolia.
    ///         Deployed via DeployPhase4.s.sol at block 272912513.
    ///         NOT redeployed in Phase 5.
    address public constant SETTLEMENT_MANAGER = 0xAc37a0e4A3e575EF21684c28a5b820dB44654595;

    /// @notice CallRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458669.
    ///         NOT redeployed in Phase 5.
    address public constant CALL_REGISTRY = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D;

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Stylus WASM implementation address from `cargo stylus deploy` output.
        // Must be activated before this script runs.
        // export STYLUS_IMPL_ADDRESS=<cargo-stylus-deploy-output-address>
        address stylusImplAddr = vm.envAddress("STYLUS_IMPL_ADDRESS");

        vm.startBroadcast(deployerKey);

        // --- 1. Deploy SolidityScoreEngine (48h cutoff fallback) ----------------
        // No-storage, stateless, view-only. Deployable behind proxy.
        // Math is identical to SettlementManager._solidityBaselineRepDelta (REP-24).
        // OPS-16: upgrade proxy to this contract via CutoffFallback.s.sol if Stylus fails.
        SolidityScoreEngine solidityEngine = new SolidityScoreEngine();

        // --- 2. Deploy RevertingStylusEngine (Phase 6 SAFETY-42 drill fixture) --
        // Intentionally reverts on compute_rep_change.
        // Used in Phase 6 drill to verify SettlementManager try/catch fallback fires.
        RevertingStylusEngine revertingEngine = new RevertingStylusEngine();

        // --- 3 & 4. Deploy the StatelessTransparentProxy pointing at the Stylus WASM impl.
        // OZ 5.x auto-creates the ProxyAdmin INSIDE the proxy constructor (owned by
        // initialOwner = deployer). Do NOT pre-deploy a ProxyAdmin and pass it -- that
        // is the OZ 4.x pattern and is wrong here.
        // StatelessTransparentProxy permits empty init data because the engine is
        // stateless; stock TransparentUpgradeableProxy would revert with
        // ERC1967ProxyUninitialized() on OZ 5.6+.
        // Phase 5 impl = Stylus WASM. OPS-16 cutoff = upgrade to solidityEngine.
        // Phase 6 promotes the admin owner to multisig (SAFETY-20).
        StatelessTransparentProxy proxy = new StatelessTransparentProxy(
            stylusImplAddr,
            vm.addr(deployerKey)
        );

        // --- 5. Wire proxy address into SettlementManager -----------------------
        // setStylusScoreEngine is onlyOwner in SettlementManager.
        // Deployer key is current owner (Phase 6 promotes to multisig).
        // SettlementManager has a payable receive() -- cast via payable().
        SettlementManager(payable(SETTLEMENT_MANAGER)).setStylusScoreEngine(address(proxy));

        vm.stopBroadcast();

        // ---------------------------------------------------------------------------
        // Post-deploy assertions
        // Run AFTER vm.stopBroadcast() -- view calls cost no gas.
        // If any require fails, the script exits non-zero and deployment is flagged.
        // ---------------------------------------------------------------------------

        // Assert SM has proxy address wired as stylusScoreEngine
        require(
            SettlementManager(payable(SETTLEMENT_MANAGER)).stylusScoreEngine() == address(proxy),
            "DeployPhase5: SM.stylusScoreEngine() mismatch"
        );

        // OZ 5.x auto-created the ProxyAdmin inside the proxy constructor. Read its
        // address from the proxy's ERC-1967 admin slot.
        // adminSlot = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1)
        bytes32 adminSlot = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
        address proxyAdminAddr = address(uint160(uint256(vm.load(address(proxy), adminSlot))));

        // Assert the auto-created ProxyAdmin is owned by the deployer (Phase 5 invariant before multisig)
        require(
            ProxyAdmin(proxyAdminAddr).owner() == vm.addr(deployerKey),
            "DeployPhase5: ProxyAdmin.owner() mismatch"
        );

        // ---------------------------------------------------------------------------
        // Deployment summary
        // ---------------------------------------------------------------------------
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("SolidityScoreEngine:    ", address(solidityEngine));
        console.log("RevertingStylusEngine:  ", address(revertingEngine));
        console.log("ProxyAdmin (auto-created):", proxyAdminAddr);
        console.log("StylusScoreEngine proxy:", address(proxy));
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts (STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA, SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA, REVERTING_STYLUS_ENGINE_ARBITRUM_SEPOLIA, PROXY_ADMIN_ARBITRUM_SEPOLIA constants)");
        console.log("2. fly secrets set STYLUS_SCORE_ENGINE_ADDRESS=<proxy_addr> --app call-it-relayer-sepolia");
        console.log("3. pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date $(date +%Y-%m-%d)");
        console.log("4. Run CutoffFallback.s.sol round-trip on Sepolia to rehearse upgrade (REP-21, REP-24)");
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands):");
        console.log("  cast call", SETTLEMENT_MANAGER, "\"stylusScoreEngine()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  cast call <proxy_addr> \"compute_rep_change(uint128,uint8,uint8,bool,uint256)\" 100 50 50 true 10 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  cast call <proxy_admin_addr> \"owner()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
    }
}
