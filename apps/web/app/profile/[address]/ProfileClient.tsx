/**
 * ProfileClient — Client Component boundary for the profile page.
 *
 * Wraps ProfileHeader + the Overview tab (UI-09). The Server Component (page.tsx)
 * fetches profile data and passes it here.
 *
 * AUTH-44: ProfileHeader receives handle (not address) as the display name.
 *
 * Overview tab (UI-09, UI-SPEC §Profile Overview) — built from @call-it/ui
 * primitives, FLEXBOX ONLY (no CSS grid, Pitfall 15):
 *   - 5-stat row: Accuracy / Calibration / ROI / Contrarian hits / Streak
 *   - CATEGORY REPUTATION (3 Cards in a flex row)
 *   - RECENT CALLS (CallCard list + All/Open/Settled filter chips)
 *   - MOST FOLLOWED BY (avatar+handle list)
 *   - NOTABLE RECEIPTS (trophy Cards with Stamp + outcome word)
 * Every list defines its empty state per the UI-SPEC copy tables.
 *
 * Requirements: UI-09, AUTH-44
 */

'use client';

import { useState } from 'react';
import { ProfileHeader, Card, CallCard, type CallCardData } from '@call-it/ui';
import type { ProfileResponse } from '@/lib/relayer-client';

const ACCENT = '#E8F542';

interface ProfileClientProps {
  address: string;
  profile: ProfileResponse | null;
  fetchError: string | null;
}

type CallFilter = 'All' | 'Open' | 'Settled';

export function ProfileClient({ address, profile, fetchError }: ProfileClientProps) {
  // Build the user object for ProfileHeader (AUTH-44: no address field).
  const headerUser = profile
    ? {
        handle: profile.handle,
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
            backgroundColor: '#18181B',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            color: '#A1A1AA',
            marginBottom: '24px',
          }}
        >
          Couldn&apos;t load the tape. The data feed is catching up — refresh in a moment.
        </div>
      )}

      {/* ProfileHeader — AUTH-44: renders handle, NOT address */}
      <div style={{ marginBottom: '32px' }}>
        <ProfileHeader user={headerUser} />
      </div>

      {/* Overview tab (UI-09) */}
      <ProfileOverview profile={profile} />
    </main>
  );
}

// ─── Overview tab (UI-09) ────────────────────────────────────────────────────

function ProfileOverview({ profile }: { profile: ProfileResponse | null }) {
  const [callFilter, setCallFilter] = useState<CallFilter>('All');

  // Derived stats from the profile response. Recent calls / followers / receipts are
  // not yet on the relayer ProfileResponse — render their documented empty states
  // (UI-SPEC) until the data surfaces (RECENT CALLS list is hydrated client-side
  // post-deploy, D-04 / Plan 07-06). The 5-stat row uses the available aggregates.
  const accuracy =
    profile && profile.settledCalls > 0
      ? `${Math.round((profile.wins / profile.settledCalls) * 100)}%`
      : '—';
  const calibration = '—'; // not yet surfaced by the relayer ProfileResponse
  const roi = '—'; // not yet surfaced by the relayer ProfileResponse
  const contrarianHits = '—'; // not yet surfaced by the relayer ProfileResponse
  const streak = profile ? String(profile.streak) : '—';

  const recentCalls: CallCardData[] = []; // hydrated client-side post-deploy (D-04)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* 5-stat row — flex row, wraps on narrow widths */}
      <section
        style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '24px' }}
      >
        <StatBlock label="Accuracy" value={accuracy} />
        <StatBlock label="Calibration" value={calibration} />
        <StatBlock label="ROI" value={roi} />
        <StatBlock label="Contrarian hits" value={contrarianHits} />
        <StatBlock label="Streak" value={streak} />
      </section>

      {/* CATEGORY REPUTATION — 3 Cards in a flex row (NOT grid) */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 className="font-mono text-xs uppercase tracking-wide text-brand-muted">
          CATEGORY REPUTATION
        </h2>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', flexWrap: 'wrap' }}>
          {['Majors', 'DeFi', 'Other'].map((cat) => (
            <Card key={cat} style={{ flex: '1 1 0', minWidth: '160px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="font-display font-bold text-brand-text text-lg">{cat}</span>
                <span className="font-mono font-bold text-brand-text text-lg">
                  {profile ? profile.globalRep : '—'}
                </span>
                <div
                  style={{
                    height: '6px',
                    backgroundColor: '#27272A',
                    border: '1px solid #27272A',
                  }}
                >
                  <div style={{ height: '100%', width: '60%', backgroundColor: ACCENT }} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* RECENT CALLS — CallCard list + All/Open/Settled filter chips */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <h2 className="font-mono text-xs uppercase tracking-wide text-brand-muted">
            RECENT CALLS
          </h2>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '6px' }}>
            {(['All', 'Open', 'Settled'] as CallFilter[]).map((f) => {
              const active = f === callFilter;
              return (
                <button
                  key={f}
                  onClick={() => setCallFilter(f)}
                  className="font-mono text-xs"
                  style={{
                    padding: '3px 10px',
                    border: '2px solid',
                    borderColor: active ? ACCENT : '#27272A',
                    color: active ? ACCENT : '#A1A1AA',
                    backgroundColor: '#18181B',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 400,
                  }}
                >
                  {f}
                </button>
              );
            })}
          </div>
        </div>
        {recentCalls.length === 0 ? (
          <EmptyState
            heading="No calls yet"
            body="This caller hasn't made a public call. Follow to get notified when they do."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentCalls.map((call, i) => (
              <CallCard key={i} call={call} />
            ))}
          </div>
        )}
      </section>

      {/* MOST FOLLOWED BY — avatar+handle list */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 className="font-mono text-xs uppercase tracking-wide text-brand-muted">
          MOST FOLLOWED BY
        </h2>
        <EmptyState heading="No followers yet" body="Be the first to follow." />
      </section>

      {/* NOTABLE RECEIPTS — trophy Cards with Stamp + outcome word */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 className="font-mono text-xs uppercase tracking-wide text-brand-muted">
          NOTABLE RECEIPTS
        </h2>
        <EmptyState heading="No receipts yet" body="Receipts appear here once a call settles." />
      </section>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '88px' }}>
      <span className="font-mono text-xs uppercase tracking-wide text-brand-muted">{label}</span>
      <span className="font-mono font-bold text-brand-text text-lg">{value}</span>
    </div>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '20px 16px',
        border: '2px dashed #27272A',
        backgroundColor: '#18181B',
      }}
    >
      <span className="font-display font-bold text-brand-text text-base">{heading}</span>
      <span className="font-body text-brand-muted text-sm">{body}</span>
    </div>
  );
}
