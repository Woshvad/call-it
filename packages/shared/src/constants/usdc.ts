/**
 * USDC constants — single source of truth for the Call It monorepo.
 *
 * IMPORTANT: This is the ONLY legal location for USDC_E_BRIDGED_DO_NOT_USE.
 * The CI grep guard (usdc-paste in grep-guards.yml) rejects the 0xFF970A61 address
 * ANYWHERE except this file. See CLAUDE.md "What NOT to Use" for context.
 *
 * Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
 * Spec: CALL_IT_SPEC1.md §10.5 — USDC mandate; hardcoded address contract
 * Requirement: SAFETY-13, OPS-22
 */

/**
 * Native USDC on Arbitrum One (Circle's canonical deployment).
 * ERC-2612 permit supported. Redeemable 1:1 with Circle via CCTP.
 *
 * ⚠️  DO NOT use USDC.e (bridged). See USDC_E_BRIDGED_DO_NOT_USE below.
 */
export const USDC_ARB_NATIVE = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const;

/**
 * USDC decimals — always 6 for native USDC on Arbitrum.
 * Use this constant when converting between USDC units and display amounts.
 */
export const USDC_DECIMALS = 6 as const;

/**
 * Bridged USDC.e — NEGATIVE-TEST FIXTURE ONLY.
 *
 * This address is listed here for documentation and test purposes ONLY.
 * It must NEVER appear in any production code path. The CI grep guard
 * (`usdc-paste` in .github/workflows/grep-guards.yml) will fail the build
 * if this address appears anywhere outside this file.
 *
 * Why: USDC.e is not redeemable 1:1 with Circle, has no CCTP support,
 * and does not guarantee ERC-2612 permit. See CLAUDE.md "What NOT to Use".
 */
export const USDC_E_BRIDGED_DO_NOT_USE = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8' as const;
