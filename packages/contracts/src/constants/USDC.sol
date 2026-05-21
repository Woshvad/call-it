// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

// Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
// Spec: CALL_IT_SPEC1.md ss10.5 -- USDC mandate; hardcoded address contract
// Requirement: SAFETY-13, OPS-22
//
// This is the SINGLE SOURCE OF TRUTH for the USDC address in Solidity.
// The matching TypeScript constant lives in packages/shared/src/constants/usdc.ts
// Both must always equal: 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
//
// WARNING: Do NOT use 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 (bridged USDC.e)
// The CI grep guard (usdc-paste in .github/workflows/grep-guards.yml) will fail
// the build if the bridged address appears anywhere except the TypeScript fixture file.

// Native USDC address on Arbitrum One (Circle canonical deployment).
// ERC-2612 permit supported. Redeemable 1:1 with Circle via CCTP.
// Network: Arbitrum One (chain ID 42161)
address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
