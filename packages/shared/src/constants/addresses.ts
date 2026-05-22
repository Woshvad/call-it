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

// ---------------------------------------------------------------------------
// Phase 1 deployed contract addresses
// Populated after running: packages/contracts/script/DeployPhase1.s.sol
// ---------------------------------------------------------------------------

/**
 * CallRegistry on Arbitrum Sepolia (Phase 1 deploy).
 *
 * PLACEHOLDER: Sepolia deploy requires a funded deployer key and RPC access.
 * Run the deploy command documented in packages/contracts/script/DeployPhase1.s.sol
 * and update this value with the deployed address.
 *
 * Command to deploy:
 *   cd packages/contracts && \
 *   DEPLOYER_PRIVATE_KEY=<key> forge script script/DeployPhase1.s.sol:DeployPhase1 \
 *     --rpc-url arbitrum_sepolia --broadcast \
 *     --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
 *
 * Post-deploy smoke test (§19.11):
 *   cast call <addr> "currentTvl()"  -> 0
 *   cast call <addr> "tvlCap()"      -> 5000000000
 *
 * Threat: T-01-16 -- wrong address pinned in frontend silently routes txs to wrong contract.
 */
export const CALL_REGISTRY_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const;
// PLACEHOLDER: Replace with address from DeployPhase1.s.sol after Sepolia deploy.

/**
 * ProfileRegistry on Arbitrum Sepolia (Phase 1 deploy).
 * Deployed alongside CallRegistry via DeployPhase1.s.sol.
 * See CALL_REGISTRY_ARBITRUM_SEPOLIA comment for deploy instructions.
 */
export const PROFILE_REGISTRY_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const;
// PLACEHOLDER: Replace with address from DeployPhase1.s.sol after Sepolia deploy.

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
