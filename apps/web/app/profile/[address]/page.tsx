/**
 * Profile page — /profile/[address]
 *
 * Server Component: fetches profile data (ENS, handle, counts) from the relayer
 * at render time. The handle is resolved via the AUTH-11 priority chain server-side.
 *
 * AUTH-44: The ProfileHeader renders the resolved handle, NOT the wallet address.
 * The address appears in the URL slug only — not in the display chrome.
 *
 * Phase 1 scope:
 *   - ProfileHeader (Plan 04) with resolved handle + stats
 *   - Overview tab stub (Phase 7 will add charts + leaderboard)
 *   - Settings link → /profile/[address]/settings
 *
 * Requirements: AUTH-11, AUTH-44, UI-05, UI-08, REP-17, D-12, D-13
 */

// Server Component — no 'use client'

import { ProfileClient } from './ProfileClient';
import { getProfile } from '@/lib/relayer-client';
import type { ProfileResponse } from '@/lib/relayer-client';

interface ProfilePageProps {
  params: Promise<{
    address: string;
  }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { address } = await params;

  let profile: ProfileResponse | null = null;
  let fetchError: string | null = null;

  // Server-side fetch: relayer /api/profile/:address
  // ENS resolution + handle priority chain happens in the relayer (D-13, AUTH-11).
  try {
    profile = await getProfile(address as `0x${string}`);
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Profile fetch failed';
    // Fallback: create a minimal profile with truncated address
    profile = null;
  }

  return (
    <ProfileClient
      address={address}
      profile={profile}
      fetchError={fetchError}
    />
  );
}
