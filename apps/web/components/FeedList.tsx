/**
 * FeedList — renders an array of CallCards with stagger animation (UI-53).
 *
 * Shows the D-35 empty state when the items array is empty.
 * Each card gets className="card-enter" + --index CSS variable for stagger delay.
 *
 * FLEXBOX ONLY — no display:grid (Pitfall 15 / Satori compatibility).
 *
 * Requirements: UI-04, UI-53, D-35, CALL-58
 */

'use client';

import React from 'react';
import { CallCard, SkeletonFeedCard, Button, Card } from '@call-it/ui';
import type { FeedItem } from '@/lib/relayer-client';

interface FeedListProps {
  items: FeedItem[];
  isLoading?: boolean;
  onNewCallClick?: () => void;
}

function feedItemToCallCardData(item: FeedItem) {
  // expiry is a unix timestamp (seconds); deadline is Date
  const expirySeconds = typeof item.expiry === 'number' ? item.expiry : parseInt(String(item.expiry), 10);
  const deadline = new Date(expirySeconds * 1000);

  // Derive a market line from asset + status
  const marketLine = item.asset
    ? `${item.asset} · ${item.marketType === 0 ? 'Price Target' : 'Call'}`
    : 'Open Call';

  const handle = item.displayHandle ?? item.handle ?? truncateAddress(item.caller ?? '');

  return {
    handle,
    marketLine,
    conviction: item.conviction ?? 50,
    deadline,
    stake: BigInt(item.stake ?? '0'),
    status: (item.status === 'settled' ? 'settled' : 'live') as 'live' | 'settled' | 'preview',
  };
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '0x???';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * FeedList — renders the call feed or the D-35 empty state.
 */
export function FeedList({ items, isLoading, onNewCallClick }: FeedListProps) {
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

  // D-35: empty state
  if (items.length === 0) {
    return (
      <Card
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        {/* Skeleton placeholder shape per D-35 */}
        <SkeletonFeedCard />
        <h3
          style={{
            fontSize: '1.125rem',
            fontFamily: 'monospace',
            color: '#A1A1AA',
            margin: 0,
          }}
        >
          No calls yet. Be the first to go on record.
        </h3>
        <Button intent="primary" size="md" onClick={onNewCallClick}>
          + NEW CALL
        </Button>
      </Card>
    );
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
          <CallCard call={feedItemToCallCardData(item)} />
        </div>
      ))}
    </div>
  );
}
