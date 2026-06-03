// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

// Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
// Spec: CALL_IT_SPEC1.md ss10.5 -- USDC mandate; hardcoded address contract
// Requirement: SAFETY-13, OPS-22
//
// This is the SINGLE SOURCE OF TRUTH for USDC addresses in Solidity.
// The matching TypeScript constants live in packages/shared/src/constants/addresses.ts
// Mainnet: USDC_ARB_NATIVE  = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
// Sepolia: USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
//
// Hybrid strategy (ADR-0001): resolveUsdc() is the chainid-gated selector. The mainnet
// guard (chainid 42161 -> USDC_ARB_NATIVE) is FIRST and UNCONDITIONAL -- preserving
// the SAFETY-13 unfakeable-USDC invariant. Sepolia (421614) is second; all other
// chains revert to prevent accidental deploys to wrong networks.
//
// WARNING: Do NOT use 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 (bridged USDC.e)
// The CI grep guard (usdc-paste in .github/workflows/grep-guards.yml) will fail
// the build if the bridged address appears anywhere except the TypeScript fixture file.

// Native USDC address on Arbitrum One (Circle canonical deployment).
// ERC-2612 permit supported. Redeemable 1:1 with Circle via CCTP.
// Network: Arbitrum One (chain ID 42161)
address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

// Official Circle USDC on Arbitrum Sepolia (testnet). Chain ID 421614.
// 6 decimals -- same parity as mainnet. Faucetable via faucet.circle.com.
// Source: ADR-0001; cast code 0x75faf114... verified bytecode, decimals()=6.
address constant USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

/// @notice Returns the canonical USDC address for the current chain.
/// @dev SAFETY-13 invariant preserved -- chainid 42161 still returns USDC_ARB_NATIVE exclusively.
///      Mainnet branch is FIRST (primary invariant). Sepolia branch is second.
///      Reverts on any other chain -- prevents accidental deploy to wrong network.
///      Both addresses are 6-decimal Circle USDC (ADR-0001 decimals-parity check).
function resolveUsdc() view returns (address) {
    if (block.chainid == 42161)  return USDC_ARB_NATIVE;   // Arbitrum One mainnet
    if (block.chainid == 421614) return USDC_ARB_SEPOLIA;  // Arbitrum Sepolia testnet
    revert("USDC: unsupported chain");
}
