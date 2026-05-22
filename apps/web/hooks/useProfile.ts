/**
 * useProfile — Tanstack Query hook for profile data.
 *
 * Fetches from relayer /api/profile/:address with ENS resolution (D-13).
 * Caches for the session; profile data changes infrequently.
 *
 * Requirements: AUTH-11, D-13, REP-17
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { getProfile, type ProfileResponse } from '@/lib/relayer-client';

export type { ProfileResponse };

/**
 * useProfile — query for a specific address's resolved profile.
 *
 * @param address - Ethereum address (hex string)
 */
export function useProfile(address: `0x${string}` | null | undefined) {
  return useQuery<ProfileResponse, Error>({
    queryKey: ['profile', address],
    queryFn: () => getProfile(address!),
    enabled: !!address,
    staleTime: 60_000, // 60s — matches server-side Redis TTL
  });
}
