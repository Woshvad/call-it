'use client';

import { useReadContract } from 'wagmi';
import { useAccount } from 'wagmi';
import {
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
  PROFILE_REGISTRY_ARBITRUM_ONE,
} from '@call-it/shared';

// ─── Minimal ProfileRegistry ABI for settledCalls view ───────────────────────

const profileRegistrySettledCallsAbi = [
  {
    type: 'function',
    name: 'settledCalls',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

/**
 * useSettledCalls — reads ProfileRegistry.settledCalls(user) for the connected wallet.
 *
 * D-23: Cached per session (staleTime: Infinity — the count only increases over time
 * and a stale value only caps conviction conservatively, which is safe).
 *
 * Returns:
 *   - settledCalls: number (0 if not connected or not deployed)
 *   - isLoading: boolean
 *
 * Used by ConvictionSliderField to determine whether to show the auto-cap warning
 * (Gate 6.3: conviction >= 85 AND settledCalls < 10 → cap to 84).
 *
 * Requirement: CALL-28, CALL-29, CALL-30, CALL-31, D-23
 */
export function useSettledCalls(): { settledCalls: number; isLoading: boolean } {
  const { address } = useAccount();

  // Use Sepolia for development; mainnet for production
  const networkId = process.env['NEXT_PUBLIC_CHAIN_ID'] ?? 'sepolia';
  const registryAddress = (
    networkId === 'mainnet'
      ? PROFILE_REGISTRY_ARBITRUM_ONE
      : PROFILE_REGISTRY_ARBITRUM_SEPOLIA
  ) as `0x${string}`;

  const { data, isLoading } = useReadContract({
    address: registryAddress,
    abi: profileRegistrySettledCallsAbi,
    functionName: 'settledCalls',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && registryAddress !== '0x0000000000000000000000000000000000000000',
      // D-23: Cache per session — the settled calls count only increases
      staleTime: Infinity,
      gcTime: 1000 * 60 * 30, // 30 minutes
    },
  });

  return {
    settledCalls: data ? Number(data) : 0,
    isLoading,
  };
}
