/**
 * Protocol and external contract addresses.
 *
 * Pyth oracle addresses are pinned and verified.
 * Protocol contract addresses (CallRegistry, etc.) start as null and are
 * populated by Phase 1+ when contracts are deployed.
 *
 * Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
 * Requirement: OPS-21, SAFETY-13
 */

import { ARBITRUM_MAINNET_CHAIN_ID, ARBITRUM_SEPOLIA_CHAIN_ID } from './networks.js';

// ---------------------------------------------------------------------------
// Circle USDC Paymaster (D-04 — post-cap USDC gas, Phase 1)
// ---------------------------------------------------------------------------

/**
 * Circle USDC Paymaster address on Arbitrum One (mainnet).
 *
 * IMPORTANT: This value is MEDIUM confidence from RESEARCH (2026-05-22).
 * Wave 0 Task 3 requires operator to verify against current Arbitrum docs:
 * https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
 *
 * If the verified address differs from this value, update here AND in
 * WAVE-0-VERIFICATION.md AND the env schema default.
 *
 * Source: Arbitrum third-party docs + Circle blog (MEDIUM confidence — may have been redeployed)
 * Threat: T-01-01 — wrong address strands tx 6+ Circle USDC permit signatures
 */
export const CIRCLE_PAYMASTER_ARBITRUM_ONE =
  '0x6C973eBe80dCD8660841D4356bf15c32460271C9' as const;

/**
 * Circle USDC Paymaster on Arbitrum Sepolia (testnet).
 * Wave 0 Task 3 checks whether a Sepolia paymaster exists.
 * If none documented: Sepolia staging uses Alchemy sponsorship for all tx.
 * Set to null until Wave 0 verification confirms a Sepolia address.
 */
export const CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA: string | null = null;

// ---------------------------------------------------------------------------
// Pyth oracle addresses
// ---------------------------------------------------------------------------

/**
 * Pyth price feed contract on Arbitrum One (mainnet).
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
export const PYTH_ARBITRUM_ONE = '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C' as const;

/**
 * Pyth price feed contract on Arbitrum Sepolia (staging).
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
export const PYTH_ARBITRUM_SEPOLIA = '0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF' as const;

// ---------------------------------------------------------------------------
// Protocol contract addresses (populated by Phase 1+)
// ---------------------------------------------------------------------------

type AddressRecord = Record<
  typeof ARBITRUM_MAINNET_CHAIN_ID | typeof ARBITRUM_SEPOLIA_CHAIN_ID,
  string | null
>;

const EMPTY_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: null,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: null,
};

/**
 * CallRegistry contract addresses — populated in Phase 1.
 */
export const CALL_REGISTRY_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };

/**
 * FollowFadeMarket contract addresses — populated in Phase 2.
 */
export const FOLLOW_FADE_MARKET_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };

/**
 * ChallengeEscrow contract addresses — populated in Phase 2.
 */
export const CHALLENGE_ESCROW_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };

/**
 * SettlementManager contract addresses — populated in Phase 3.
 */
export const SETTLEMENT_MANAGER_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };

/**
 * ProfileRegistry contract addresses — populated in Phase 1.5.
 */
export const PROFILE_REGISTRY_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };
