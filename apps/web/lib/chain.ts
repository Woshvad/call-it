/**
 * chain.ts — single source of truth for the ACTIVE chain + chain-correct
 * contract addresses on the client (quick-260611-5mh RC1 fix).
 *
 * WHY THIS EXISTS: wagmi hooks WITHOUT an explicit `chainId` default to the
 * FIRST chain in the wagmi config. Several read hooks (balance chip, USDC
 * allowances, FFM pool reads) carried no chainId and hardcoded the MAINNET
 * USDC token, so a wallet holding $20 USDC on Arbitrum Sepolia rendered as
 * $0.00 and challenge modals wrongly blocked with "Insufficient USDC balance".
 *
 * EVERY client-side read hook must:
 *   1. pass `chainId: ACTIVE_CHAIN_ID`, and
 *   2. source token/contract addresses from the selected constants below.
 *
 * D-36: only Arbitrum One (42161) + Arbitrum Sepolia (421614) exist here.
 * No address literals — everything is imported from @call-it/shared
 * (T-01-39 / IN-05 grep guards stay satisfied).
 *
 * Mainnet cutover (Phase 7.5): set NEXT_PUBLIC_CHAIN_ID=42161 — every
 * consumer of this module flips together. Mainnet protocol addresses are
 * currently 0x0 placeholders in @call-it/shared (not yet deployed).
 */

import { arbitrum, arbitrumSepolia } from 'viem/chains';
import {
  ARBITRUM_MAINNET_CHAIN_ID,
  ARBITRUM_SEPOLIA_CHAIN_ID,
  USDC_ARB_NATIVE,
  USDC_ARB_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_ONE,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_ONE,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_ONE,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  PROFILE_REGISTRY_ARBITRUM_ONE,
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
  SETTLEMENT_MANAGER_ARBITRUM_ONE,
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

/**
 * The active chain ID. Driven by NEXT_PUBLIC_CHAIN_ID (numeric, e.g. "421614"
 * or "42161"); defaults to Arbitrum Sepolia (421614) — the current deploy
 * target until the Phase 7.5 mainnet cutover.
 */
export const ACTIVE_CHAIN_ID: number =
  Number(process.env['NEXT_PUBLIC_CHAIN_ID']) || ARBITRUM_SEPOLIA_CHAIN_ID;

/** The active viem chain object (D-36: only arbitrum or arbitrumSepolia). */
export const ACTIVE_CHAIN =
  ACTIVE_CHAIN_ID === ARBITRUM_MAINNET_CHAIN_ID ? arbitrum : arbitrumSepolia;

const isMainnet = ACTIVE_CHAIN_ID === ARBITRUM_MAINNET_CHAIN_ID;

/** Chain-correct USDC token address (Sepolia: Circle testnet USDC 0x75fa...AA4d). */
export const USDC_ADDRESS = (
  isMainnet ? USDC_ARB_NATIVE : USDC_ARB_SEPOLIA
) as `0x${string}`;

/** Chain-correct CallRegistry address. */
export const CALL_REGISTRY_ADDRESS = (
  isMainnet ? CALL_REGISTRY_ARBITRUM_ONE : CALL_REGISTRY_ARBITRUM_SEPOLIA
) as `0x${string}`;

/** Chain-correct FollowFadeMarket address. */
export const FOLLOW_FADE_MARKET_ADDRESS = (
  isMainnet ? FOLLOW_FADE_MARKET_ARBITRUM_ONE : FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA
) as `0x${string}`;

/** Chain-correct ChallengeEscrow address. */
export const CHALLENGE_ESCROW_ADDRESS = (
  isMainnet ? CHALLENGE_ESCROW_ARBITRUM_ONE : CHALLENGE_ESCROW_ARBITRUM_SEPOLIA
) as `0x${string}`;

/** Chain-correct ProfileRegistry address. */
export const PROFILE_REGISTRY_ADDRESS = (
  isMainnet ? PROFILE_REGISTRY_ARBITRUM_ONE : PROFILE_REGISTRY_ARBITRUM_SEPOLIA
) as `0x${string}`;

/** Chain-correct SettlementManager address. */
export const SETTLEMENT_MANAGER_ADDRESS = (
  isMainnet ? SETTLEMENT_MANAGER_ARBITRUM_ONE : SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA
) as `0x${string}`;

/**
 * Chain-correct block-explorer base URL (WR-05, no trailing slash):
 * Arbitrum One → arbiscan.io, Arbitrum Sepolia → sepolia.arbiscan.io.
 * Use for every tx/address link so a Sepolia deploy never links to a
 * mainnet explorer page that 404s.
 */
export const EXPLORER_BASE_URL = isMainnet
  ? 'https://arbiscan.io'
  : 'https://sepolia.arbiscan.io';
