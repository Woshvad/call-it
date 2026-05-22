/**
 * useUsdcBalance — wagmi hook for the user's embedded wallet USDC balance.
 *
 * Features:
 * - Polls every 5s via `query.refetchInterval: 5000` (UI-56)
 * - Subscribes to USDC Transfer events to the user's address via
 *   `useWatchContractEvent` for instant updates (AUTH-26)
 * - Always references USDC_ARB_NATIVE from @call-it/shared — never inline
 *   address (T-01-39, grep guard from Phase 0 enforces this)
 *
 * Security: T-01-39 — USDC_ARB_NATIVE imported from @call-it/shared; grep
 *   guard ensures no 0xaf88... or 0xFF97... literals in component source.
 *
 * Requirements: AUTH-24 ($50 export prompt threshold), AUTH-26 (instant
 *   balance refresh on inbound transfer), UI-56 (5s polling interval)
 */

'use client';

import { useAccount, useBalance, useWatchContractEvent } from 'wagmi';
import { erc20Abi } from 'viem';
import { USDC_ARB_NATIVE } from '@call-it/shared';

export interface UsdcBalance {
  /** Raw balance in 6-decimal USDC units (e.g., 50_000_000 = $50.00) */
  balance: bigint | undefined;
  /** Human-readable balance string (e.g., "50.00") */
  formatted: string | undefined;
  isLoading: boolean;
  /** Manual refetch trigger — called by the Transfer event subscription */
  refetch: () => void;
}

/**
 * Returns the user's embedded wallet USDC balance on Arbitrum.
 *
 * Polled at 5s intervals AND updated instantly on inbound Transfer events.
 * Returns `{ balance: undefined }` when the wallet is not connected.
 *
 * Usage:
 *   const { balance, formatted, isLoading } = useUsdcBalance();
 *   if (balance !== undefined && balance >= 50_000_000n) { ... }
 */
export function useUsdcBalance(): UsdcBalance {
  const { address } = useAccount();

  const {
    data,
    isLoading,
    refetch,
  } = useBalance({
    address,
    token: USDC_ARB_NATIVE as `0x${string}`,
    query: {
      // UI-56: 5-second polling interval for near-real-time balance updates
      refetchInterval: 5000,
      // Only run when we have a connected address (T-01-40: prevents null subscription)
      enabled: !!address,
    },
  });

  // AUTH-26: Subscribe to USDC Transfer events targeting the user's address.
  // wagmi v2 cleans up the subscription automatically on unmount (T-01-40).
  // Guard: enabled only when address is present.
  useWatchContractEvent({
    address: USDC_ARB_NATIVE as `0x${string}`,
    abi: erc20Abi,
    eventName: 'Transfer',
    args: address ? { to: address } : undefined,
    enabled: !!address,
    onLogs: () => {
      // Instant balance refresh on any inbound transfer
      void refetch();
    },
  });

  return {
    balance: data?.value,
    formatted: data?.formatted,
    isLoading,
    refetch,
  };
}
