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
 * CallRegistry on Arbitrum Sepolia — v2 (Phase 2 redeploy).
 *
 * DEPLOYED 2026-05-30 via DeployPhase2.s.sol (OZ 5.6.1, solc 0.8.30).
 * Deploy block: 272458669. Deployer/owner/treasury: 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5.
 * Supersedes the Phase 1 v1 address (0xC61deC55ED916f97006FC1B01695Ee9297a8867C).
 *
 * Post-deploy verification (on-chain, all green):
 *   followFadeMarket()  -> FFM address                                 ✓
 *   profileRegistry()   -> ProfileRegistry v2                          ✓
 *   treasury()          -> 0xDa8c...A4a5                               ✓
 *   tvlCap()            -> 5000000000                                  ✓
 *   currentTvl()        -> 0                                           ✓
 *
 * Threat: T-01-16 -- wrong address pinned in frontend silently routes txs to wrong contract.
 */
export const CALL_REGISTRY_ARBITRUM_SEPOLIA =
  '0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D' as const;

/**
 * ProfileRegistry on Arbitrum Sepolia — v2 (Phase 2 redeploy).
 * Deployed alongside CallRegistry v2 via DeployPhase2.s.sol (2026-05-30).
 * Deploy block: 272458667. Owner: 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5.
 * v2 adds authorizedRepWriters (FFM authorized). Supersedes the Phase 1 v1
 * address (0x4dCdE524F0566f583fab237d7CeED2fE8fB02322).
 */
export const PROFILE_REGISTRY_ARBITRUM_SEPOLIA =
  '0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E' as const;

/**
 * FollowFadeMarket on Arbitrum Sepolia (Phase 2 deploy).
 *
 * DEPLOYED 2026-05-30 via DeployPhase2.s.sol. Deploy block: 272458674.
 * Constructor: (CallRegistry v2, ProfileRegistry v2, treasury 0xDa8c...A4a5).
 *
 * Post-deploy verification (on-chain, all green):
 *   callRegistry()     -> CallRegistry v2                              ✓
 *   profileRegistry()  -> ProfileRegistry v2                          ✓
 *   treasury()         -> 0xDa8c...A4a5                               ✓
 *   (CallRegistry.followFadeMarket() points back here; PR.authorizedRepWriters(FFM)=true)
 *
 * Threat: T-02-04-01 — wrong/zero address routes all FFM reads/writes to nowhere.
 */
export const FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =
  '0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362' as const;

/**
 * FollowFadeMarket on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after the Sepolia staging gate.
 */
export const FOLLOW_FADE_MARKET_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

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

/**
 * ChallengeEscrow on Arbitrum Sepolia (Phase 3 deploy).
 *
 * NOT YET DEPLOYED — placeholder pending the 03-03 operator deploy.
 * DeployPhase3.s.sol is ready: ChallengeEscrow(CallRegistry v2, FollowFadeMarket,
 * USDC native, treasury, tvlCap=5_000_000_000). After broadcast, replace the zero
 * address below with the deployed address and record deploy block + on-chain
 * assertions here (mirror FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA above). The deploy
 * block also feeds packages/subgraph/subgraph.yaml startBlock (Plan 03-04).
 *
 * Threat: T-03-03-01 — wrong/zero address routes all duel reads/writes to nowhere;
 * downstream code MUST guard against the zero address until the real value lands.
 */
export const CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * ChallengeEscrow on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after the Sepolia staging gate.
 */
export const CHALLENGE_ESCROW_ARBITRUM_ONE =
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
 * Sepolia entry is the live deployed address (02-04, 2026-05-30).
 */
export const FOLLOW_FADE_MARKET_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: FOLLOW_FADE_MARKET_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
};

/**
 * ChallengeEscrow contract addresses — Sepolia pending the 03-03 deploy.
 */
export const CHALLENGE_ESCROW_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
};

/**
 * SettlementManager contract addresses — populated in Phase 3.
 */
export const SETTLEMENT_MANAGER_ADDRESSES: AddressRecord = { ...EMPTY_ADDRESSES };

// ---------------------------------------------------------------------------
// Subgraph URLs (The Graph — Subgraph Studio)
// ---------------------------------------------------------------------------

/**
 * Subgraph Studio query URL for the call-it-sepolia deployment (Arbitrum Sepolia).
 *
 * DEPLOYED 2026-05-30 via `graph deploy call-it-sepolia` (graph-cli 0.98.1).
 * Studio user id: 1754389. Version label: v0.0.1.
 * IPFS build hash: QmRyZoED61CDfVVg6BAz6ZairKh1mnY8vRbeydLmfu3xej.
 * Indexes CallRegistry v2, ProfileRegistry v2, FollowFadeMarket (Phase 2 addresses).
 * Studio dashboard: https://thegraph.com/studio/subgraph/call-it-sepolia
 *
 * Note: this is the version-pinned endpoint emitted by the deploy. Republishing a
 * new version label will mint a new URL — update this constant on each redeploy.
 * Also update RELAYER_SUBGRAPH_URL in apps/relayer/.env and .env.production.
 *
 * Requirement: D-27 (Studio key held by relayer only — frontend hits /api/feed proxy)
 * Threat: T-01-67 — schema drift between Phase 0 stubs and Phase 1 real events (closed)
 */
export const SUBGRAPH_URL_SEPOLIA =
  'https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1' as const;

/**
 * Subgraph Decentralized Network URL (Arbitrum One mainnet).
 * Published from Studio in Phase 7 (out of scope for Phase 1).
 * See: 01-CONTEXT.md "Out of scope: Decentralized Network subgraph publish (→ Phase 7)"
 */
export const SUBGRAPH_URL_MAINNET: string | null = null;
