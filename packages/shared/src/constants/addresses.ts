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
 * Verified 2026-05-22 against:
 *   - https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
 *   - https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance
 * Both sources confirm this address. Confidence: HIGH.
 *
 * Threat: T-01-01 — wrong address strands tx 6+ Circle USDC permit signatures
 */
export const CIRCLE_PAYMASTER_ARBITRUM_ONE =
  '0x6C973eBe80dCD8660841D4356bf15c32460271C9' as const;

/**
 * Circle USDC Paymaster on Arbitrum Sepolia (testnet).
 * Used for Sepolia staging end-to-end paymaster handoff tests.
 *
 * Verified 2026-05-22 against the same Arbitrum docs + Circle blog as the
 * mainnet address above. Confidence: HIGH.
 */
export const CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA =
  '0x31BE08D380A21fc740883c0BC434FcFc88740b58' as const;

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

// ---------------------------------------------------------------------------
// Phase 1 deployed contract addresses
// Populated after running: packages/contracts/script/DeployPhase1.s.sol
// ---------------------------------------------------------------------------

/**
 * CallRegistry on Arbitrum Sepolia (Phase 1 deploy).
 *
 * DEPLOYED 2026-05-29 via DeployPhase1.s.sol (OZ 5.6.1, solc 0.8.30).
 * Deploy block: 271888754. Deployer/owner: 0xF4ee61950B63cCA5C82f1146484d018Ac95Bd0F2.
 *
 * Post-deploy smoke test (§19.11) — all green:
 *   cast call <addr> "currentTvl()"  -> 0           ✓
 *   cast call <addr> "tvlCap()"      -> 5000000000  ✓
 *   cast call <addr> "owner()"       -> deployer     ✓
 *
 * Threat: T-01-16 -- wrong address pinned in frontend silently routes txs to wrong contract.
 */
export const CALL_REGISTRY_ARBITRUM_SEPOLIA =
  '0xC61deC55ED916f97006FC1B01695Ee9297a8867C' as const;

/**
 * ProfileRegistry on Arbitrum Sepolia (Phase 1 deploy).
 * Deployed alongside CallRegistry via DeployPhase1.s.sol (2026-05-29).
 * Deploy block: 271888754. Owner: 0xF4ee61950B63cCA5C82f1146484d018Ac95Bd0F2.
 */
export const PROFILE_REGISTRY_ARBITRUM_SEPOLIA =
  '0x4dCdE524F0566f583fab237d7CeED2fE8fB02322' as const;

/**
 * CallRegistry on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after >=48h Sepolia staging gate.
 * Spec: §19.11 mandatory post-deploy smoke test required before public announcement.
 */
export const CALL_REGISTRY_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * ProfileRegistry on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy alongside CallRegistry.
 */
export const PROFILE_REGISTRY_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

// ---------------------------------------------------------------------------
// Legacy address record structure (retained for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * CallRegistry contract addresses — populated in Phase 1.
 * @deprecated Use CALL_REGISTRY_ARBITRUM_SEPOLIA / CALL_REGISTRY_ARBITRUM_ONE directly.
 */
export const CALL_REGISTRY_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: CALL_REGISTRY_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: CALL_REGISTRY_ARBITRUM_SEPOLIA,
};

/**
 * ProfileRegistry contract addresses — populated in Phase 1.
 * @deprecated Use PROFILE_REGISTRY_ARBITRUM_SEPOLIA / PROFILE_REGISTRY_ARBITRUM_ONE directly.
 */
export const PROFILE_REGISTRY_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: PROFILE_REGISTRY_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
};

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

// ---------------------------------------------------------------------------
// Subgraph URLs (The Graph — Subgraph Studio)
// ---------------------------------------------------------------------------

/**
 * Subgraph Studio URL for the call-it-sepolia deployment (Arbitrum Sepolia).
 *
 * Updated after running: pnpm --filter @call-it/subgraph deploy:sepolia
 * The Studio dashboard shows the query endpoint after a successful deploy.
 *
 * Format: https://api.studio.thegraph.com/query/<user-id>/call-it-sepolia/version/latest
 *
 * PLACEHOLDER: Replace with the actual Studio URL after first Sepolia deploy.
 * Also update RELAYER_SUBGRAPH_URL in apps/relayer/.env and .env.production.
 *
 * Requirement: D-27 (Studio key held by relayer only — frontend hits /api/feed proxy)
 * Threat: T-01-67 — schema drift between Phase 0 stubs and Phase 1 real events (closed)
 */
export const SUBGRAPH_URL_SEPOLIA =
  'https://api.studio.thegraph.com/query/PLACEHOLDER/call-it-sepolia/version/latest' as const;

/**
 * Subgraph Decentralized Network URL (Arbitrum One mainnet).
 * Published from Studio in Phase 7 (out of scope for Phase 1).
 * See: 01-CONTEXT.md "Out of scope: Decentralized Network subgraph publish (→ Phase 7)"
 */
export const SUBGRAPH_URL_MAINNET: string | null = null;
