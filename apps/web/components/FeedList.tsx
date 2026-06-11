/**
 * FeedList — renders an array of CallCards with stagger animation (UI-53).
 *
 * Each card gets className="card-enter" + --index CSS variable for stagger delay.
 * Loading renders rethemed hard-edge skeletons in card slots.
 *
 * 09.2-06: the empty state moved up to app/page.tsx (the "NOTHING ON THE TAPE"
 * copy block owns it there per the UI-SPEC Copywriting Contract) — an empty
 * items array renders nothing here. `onItemClick` is the only card affordance
 * (D-06: navigation to /call/[id]; no inline stake toggles).
 *
 * FLEXBOX ONLY — no display:grid (Pitfall 15 / Satori compatibility).
 *
 * Requirements: UI-04, UI-53, CALL-58
 */

'use client';

import React from 'react';
import { CallCard, SkeletonFeedCard } from '@call-it/ui';
import type { FeedItem } from '@/lib/relayer-client';

interface FeedListProps {
  items: FeedItem[];
  isLoading?: boolean;
  /** D-06: card tap navigates to the call page (real modals live there). */
  onItemClick?: (item: FeedItem) => void;
}

function feedItemToCallCardData(item: FeedItem) {
  // expiry is a unix timestamp (seconds); deadline is Date
  const expirySeconds = typeof item.expiry === 'number' ? item.expiry : parseInt(String(item.expiry), 10);
  const deadline = new Date(expirySeconds * 1000);

  // C3 (quick-260611-5mh): real market line — the PLAN-01 enriched
  // `marketLine` (e.g. "ETH ≥ $1,000,000") → stored statement → 'Open Call'.
  const marketLine =
    (item.marketLine && item.marketLine.trim()) ||
    (item.statement && item.statement.trim()) ||
    'Open Call';

  const handle = item.displayHandle ?? item.handle ?? truncateAddress(item.caller ?? '');

  return {
    handle,
    marketLine,
    conviction: item.conviction ?? 50,
    deadline,
    stake: BigInt(item.stake ?? '0'),
    // status is canonical lowercase from the relayer-client boundary (C1);
    // settled + disputed render the SETTLED tag, everything else is live —
    // CallCard itself downgrades expired live cards to AWAITING SETTLEMENT (C2).
    status: (item.status === 'settled' || item.status === 'disputed'
      ? 'settled'
      : 'live') as 'live' | 'settled' | 'preview',
  };
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '0x???';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * FeedList — renders the call feed (or skeleton slots while loading).
 */
export function FeedList({ items, isLoading, onItemClick }: FeedListProps) {
  // Loading skeleton
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[0, 1, 2].map((i) => (
          <SkeletonFeedCard key={i} />
        ))}
      </div>
    );
  }

  // Empty: the page-level "NOTHING ON THE TAPE" block owns the empty state (09.2-06).
  if (items.length === 0) {
    return null;
  }

  // Populated feed with stagger animation (UI-53)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map((item, i) => (
        <div
          key={item.id}
          className="card-enter"
          style={
            {
              '--index': i,
            } as React.CSSProperties
          }
        >
          <CallCard
            call={feedItemToCallCardData(item)}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
