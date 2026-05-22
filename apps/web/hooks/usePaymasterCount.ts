/**
 * usePaymasterCount — Tanstack Query hook for per-user paymaster cap status.
 *
 * Fetches GET /api/paymaster-count from the relayer (privy-session-gated).
 * Returns { count, capacity: 5, remaining } for the authenticated user.
 *
 * Used by:
 *   - PaymasterCapBanner — shows "USDC gas mode active" when remaining === 0
 *   - useCirclePaymaster — determines whether to route through Circle paymaster
 *
 * Polling: Refetches every 30s and on window focus.
 * Auth: Uses Privy getAccessToken() for Bearer token.
 *
 * Requirements: AUTH-27, AUTH-28, D-02
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

export interface PaymasterCountData {
  count: number;
  capacity: number;
  remaining: number;
}

/**
 * Fetch the paymaster count from the relayer with auth.
 */
async function fetchPaymasterCount(getAccessToken: () => Promise<string | null>): Promise<PaymasterCountData> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const res = await fetch(`${RELAYER_BASE}/api/paymaster-count`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch paymaster count: ${res.status}`);
  }

  return res.json() as Promise<PaymasterCountData>;
}

/**
 * usePaymasterCount — returns the user's lifetime paymaster usage.
 *
 * Returns:
 *   { count, capacity: 5, remaining } — current state
 *   isLoading, isError — loading/error states
 *   isCapped — true when remaining === 0 (trigger Circle paymaster handoff)
 */
export function usePaymasterCount() {
  const { ready, authenticated, getAccessToken } = usePrivy();

  const query = useQuery({
    queryKey: ['paymaster-count'],
    queryFn: () => fetchPaymasterCount(getAccessToken),
    enabled: ready && authenticated,
    staleTime: 30_000,  // 30s stale time
    refetchInterval: 60_000,  // Refetch every 60s
    refetchOnWindowFocus: true,
  });

  const data = query.data;

  return {
    count: data?.count ?? 0,
    capacity: data?.capacity ?? 5,
    remaining: data?.remaining ?? 5,
    isCapped: (data?.remaining ?? 5) === 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
