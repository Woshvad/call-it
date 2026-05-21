/**
 * Network constants test — OPS-21 enforcement.
 *
 * Call It v1 is NOT multi-chain (OPS-21, D-18).
 * These tests ensure exactly 2 chain IDs are exported (mainnet + Sepolia staging only).
 * Any additional chain ID export would violate OPS-21.
 */

import { describe, it, expect } from 'vitest';
import * as networks from '../src/constants/networks.js';

describe('Network constants (OPS-21: Arbitrum mainnet only, not multi-chain)', () => {
  it('ARBITRUM_MAINNET_CHAIN_ID is 42161', () => {
    expect(networks.ARBITRUM_MAINNET_CHAIN_ID).toBe(42161);
  });

  it('ARBITRUM_SEPOLIA_CHAIN_ID is 421614', () => {
    expect(networks.ARBITRUM_SEPOLIA_CHAIN_ID).toBe(421614);
  });

  it('exactly 2 numeric chain ID constants are exported (OPS-21: not multi-chain)', () => {
    // Extract all numeric chain ID exports — must be exactly 2
    const chainIdExports = Object.entries(networks).filter(
      ([_key, value]) => typeof value === 'number',
    );
    expect(chainIdExports.map(([k]) => k).sort()).toEqual([
      'ARBITRUM_MAINNET_CHAIN_ID',
      'ARBITRUM_SEPOLIA_CHAIN_ID',
    ]);
    expect(chainIdExports).toHaveLength(2);
  });

  it('NETWORKS record contains exactly mainnet and sepolia entries', () => {
    const keys = Object.keys(networks.NETWORKS).sort();
    expect(keys).toEqual(['mainnet', 'sepolia']);
  });

  it('NETWORKS.mainnet has chainId 42161', () => {
    expect(networks.NETWORKS.mainnet.chainId).toBe(42161);
  });

  it('NETWORKS.sepolia has chainId 421614', () => {
    expect(networks.NETWORKS.sepolia.chainId).toBe(421614);
  });
});
