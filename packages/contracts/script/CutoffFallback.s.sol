// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md ss11.6 -- 48h-before-demo cutoff upgrade (OPS-16)
// Requirement: REP-21, REP-24, OPS-16
//
// OPS-16 RUNBOOK: execute if cargo stylus check fails 48h before demo.
//
// Usage (forge script):
//   forge script script/CutoffFallback.s.sol:CutoffFallback \
//     --rpc-url arbitrum_sepolia --broadcast
//
// Usage (cast one-liner -- equivalent, preferred for ops):
//   cast send $PROXY_ADMIN_ADDR \
//     "upgradeAndCall(address,address,bytes)" \
//     $PROXY_ADDR $SOLIDITY_BASELINE_ADDR "" \
//     --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
//     --private-key $DEPLOYER_KEY
//
// DEVIATION NOTE: OZ v5 ProxyAdmin removed getProxyImplementation()/getProxyAdmin() helpers.
// Post-upgrade verification reads the EIP-1967 implementation slot directly:
//   bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
//   cast storage $PROXY_ADDR 0x360894... --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//     -> $SOLIDITY_BASELINE_ADDR (lower 20 bytes)

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { ITransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/// @title CutoffFallback
/// @notice OPS-16 runbook script: upgrades the StylusScoreEngine proxy to the
///         SolidityScoreEngine fallback implementation in a single command.
///
///         Fill the three address constants below from DeployPhase5Stylus.s.sol output
///         (packages/shared/src/constants/addresses.ts) before running.
///
///         Post-upgrade verification reads the EIP-1967 implementation slot directly
///         because OZ v5 removed ProxyAdmin.getProxyImplementation() helper.
contract CutoffFallback is Script {
    // Populated from addresses.ts after DeployPhase5Stylus.s.sol broadcast.
    // Replace address(0) with real addresses from Plan 06 deployment output.

    address public constant PROXY_ADMIN_ADDR       = address(0); // FILL AFTER DEPLOY
    address public constant PROXY_ADDR             = address(0); // FILL AFTER DEPLOY
    address public constant SOLIDITY_BASELINE_ADDR = address(0); // FILL AFTER DEPLOY

    // EIP-1967 implementation storage slot:
    // keccak256("eip1967.proxy.implementation") - 1
    bytes32 internal constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    function run() external {
        // Load deployer key. Must be the ProxyAdmin owner (set during DeployPhase5Stylus).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        // Upgrade proxy to SolidityScoreEngine.
        // OZ 5.6.1: upgradeAndCall(ITransparentUpgradeableProxy proxy, address impl, bytes data)
        // is onlyOwner payable. Passing "" as data (no initialize() call needed).
        ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(PROXY_ADDR)),
            SOLIDITY_BASELINE_ADDR,
            ""
        );

        vm.stopBroadcast();

        // ---------------------------------------------------------------------------
        // Post-upgrade verification via EIP-1967 implementation slot
        // OZ v5 removed ProxyAdmin.getProxyImplementation() -- read slot directly.
        // EIP-1967: implementation slot = keccak256("eip1967.proxy.implementation") - 1
        // ---------------------------------------------------------------------------
        bytes32 implSlotValue = vm.load(PROXY_ADDR, IMPL_SLOT);
        address impl = address(uint160(uint256(implSlotValue)));

        require(
            impl == SOLIDITY_BASELINE_ADDR,
            "CutoffFallback: implementation mismatch"
        );

        console.log("[OK] Proxy upgraded to SolidityScoreEngine at:", SOLIDITY_BASELINE_ADDR);
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands):");
        console.log("  cast storage", PROXY_ADDR, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  -> lower 20 bytes must equal:", SOLIDITY_BASELINE_ADDR);
        console.log("  cast call", PROXY_ADDR, "\"compute_rep_change(uint128,uint8,uint8,bool,uint256)\" 100 50 50 true 10 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  -> non-zero int32 (Solidity fallback, not Stylus)");
    }
}
