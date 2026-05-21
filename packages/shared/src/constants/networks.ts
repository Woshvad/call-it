/**
 * Network constants — Arbitrum mainnet and Arbitrum Sepolia (staging).
 *
 * IMPORTANT: Call It v1 is NOT multi-chain (OPS-21, D-18).
 * Only two chain IDs are exported: mainnet (42161) and Sepolia (421614 — staging only).
 * Do NOT add other chain IDs here; it would violate OPS-21.
 *
 * Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
 * Requirement: OPS-21
 */

/**
 * Arbitrum One (mainnet) chain ID.
 * This is the ONLY production network for Call It v1.
 */
export const ARBITRUM_MAINNET_CHAIN_ID = 42161 as const;

/**
 * Arbitrum Sepolia (staging) chain ID.
 * Used for the ≥48h Sepolia staging gate (§19.10) and local development.
 * Never used in production USDC transfer paths.
 */
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614 as const;

/**
 * Supported network names in Call It v1.
 */
export type NetworkName = 'mainnet' | 'sepolia';

/**
 * Network record type — associates a name with its chain ID.
 */
export type NetworkRecord = {
  name: NetworkName;
  chainId: typeof ARBITRUM_MAINNET_CHAIN_ID | typeof ARBITRUM_SEPOLIA_CHAIN_ID;
  rpcEnvVar: string;
};

/**
 * Supported networks map.
 */
export const NETWORKS: Record<NetworkName, NetworkRecord> = {
  mainnet: {
    name: 'mainnet',
    chainId: ARBITRUM_MAINNET_CHAIN_ID,
    rpcEnvVar: 'ALCHEMY_RPC_URL_MAINNET',
  },
  sepolia: {
    name: 'sepolia',
    chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    rpcEnvVar: 'ALCHEMY_RPC_URL_SEPOLIA',
  },
};
