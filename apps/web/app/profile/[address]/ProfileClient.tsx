/**
 * ProfileClient — Client Component boundary for the profile page.
 *
 * Wraps ProfileHeader + ProfileTabs which require React client context
 * (hooks from @call-it/ui, useState).
 *
 * The Server Component (page.tsx) fetches profile data and passes it here.
 * AUTH-44: ProfileHeader receives handle (not address) as the display name.
 */

'use client';

import { ProfileHeader } from '@call-it/ui';
import { ProfileTabs } from '@/components/ProfileTabs';
import type { ProfileResponse } from '@/lib/relayer-client';

interface ProfileClientProps {
  address: string;
  profile: ProfileResponse | null;
  fetchError: string | null;
}

export function ProfileClient({ address, profile, fetchError }: ProfileClientProps) {
  // Build the user object for ProfileHeader (AUTH-44: no address field in ProfileHeaderUser)
  const headerUser = profile
    ? {
        // AUTH-11 priority chain: use handle (already resolved server-side by relayer)
        handle: profile.handle,
        // AUTH-44: no address field — ProfileHeader must never render the wallet address
        verified: profile.verifiedX || profile.verifiedFc,
        stats: {
          totalCalls: profile.totalCalls,
          settledCalls: profile.settledCalls,
          wins: profile.wins,
        },
      }
    : {
        handle: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '...',
        stats: { totalCalls: 0, settledCalls: 0, wins: 0 },
      };

  return (
    <main
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Error state */}
      {fetchError && (
        <div
          style={{
            padding: '12px 16px',
            borderLeft: '3px solid #EF4444',
            backgroundColor: '#1A1A1A',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            color: '#A1A1AA',
            marginBottom: '24px',
          }}
        >
          Profile unavailable — {fetchError}
        </div>
      )}

      {/* ProfileHeader — AUTH-44: renders handle, NOT address */}
      <div style={{ marginBottom: '32px' }}>
        <ProfileHeader user={headerUser} />
      </div>

      {/* Tab navigation + content */}
      <ProfileTabs address={address} initialTab="overview" />
    </main>
  );
}
