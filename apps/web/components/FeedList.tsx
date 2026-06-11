/**
 * FeedList — renders the call feed with stagger animation (UI-53).
 *
 * quick-260611-u1l: LIVE (non-settled/non-disputed) items render the NEW
 * prototype-layout LiveCallCard (apps/web component) with REAL on-chain
 * follow/fade reserves + ProfileRegistry handle fallback from
 * hooks/useFeedMarketData. Settled/disputed items stay on the existing
 * CallCard path (which internally routes to the SettledCallCard treatment —
 * owned by quick-260611-tbc).
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
import { CallCard, SkeletonFeedCard, settledOutcomeWord } from '@call-it/ui';
import { twitterIntentUrl, buildShareText } from '@call-it/shared';
import type { FeedItem } from '@/lib/relayer-client';
import { LiveCallCard } from '@/components/LiveCallCard';
import { useFeedReserves, useFeedHandles } from '@/hooks/useFeedMarketData';

interface FeedListProps {
  items: FeedItem[];
  isLoading?: boolean;
  /** D-06: card tap navigates to the call page (real modals live there). */
  onItemClick?: (item: FeedItem) => void;
}

// C3 (quick-260611-5mh): real market line — the PLAN-01 enriched
// `marketLine` (e.g. "ETH ≥ $1,000,000") → stored statement → 'Open Call'.
function marketLineFor(item: FeedItem): string {
  return (
    (item.marketLine && item.marketLine.trim()) ||
    (item.statement && item.statement.trim()) ||
    'Open Call'
  );
}

function feedItemToCallCardData(item: FeedItem) {
  // expiry is a unix timestamp (seconds); deadline is Date
  const expirySeconds = typeof item.expiry === 'number' ? item.expiry : parseInt(String(item.expiry), 10);
  const deadline = new Date(expirySeconds * 1000);

  const marketLine = marketLineFor(item);

  const handle = item.displayHandle ?? item.handle ?? truncateAddress(item.caller ?? '');

  return {
    handle,
    marketLine,
    // D-07: never fabricate conviction — missing value hides the CONVICTION row.
    conviction: typeof item.conviction === 'number' ? item.conviction : undefined,
    deadline,
    stake: BigInt(item.stake ?? '0'),
    // status is canonical lowercase from the relayer-client boundary (C1);
    // settled + disputed render the SETTLED tag, everything else is live —
    // CallCard itself downgrades expired live cards to AWAITING SETTLEMENT (C2).
    status: (item.status === 'settled' || item.status === 'disputed'
      ? 'settled'
      : 'live') as 'live' | 'settled' | 'preview',
    // Settled tag upgrades to the §15.7 outcome word when the feed carries it.
    outcome: item.outcome ?? undefined,
    // quick-260611-tbc: settled tape-card enrichment pass-through (ADDITIVE).
    // MANDATORY degradation: against the CURRENT deployed relayer NONE of
    // settledAt/repDelta/finalPct exist on the wire → the settled card renders
    // outcome word + statement + STAKE + SHARE only (overline/FINAL/REP Δ
    // blocks hidden — D-07: absent data is never fabricated).
    settledAt: typeof item.settledAt === 'number' ? item.settledAt : undefined,
    repDelta: typeof item.repDelta === 'number' ? item.repDelta : undefined,
    finalPct: typeof item.finalPct === 'number' ? item.finalPct : undefined,
    // '—' renders ONLY when the enrichment is live (settledAt present) and the
    // market type semantically has no final-vs-target price (RelativePerformance
    // / Event). A marketType-0 item missing finalPct OMITS the FINAL block —
    // missing data ≠ N/A (D-07).
    finalNA:
      item.finalPct === undefined &&
      typeof item.settledAt === 'number' &&
      (item.marketType === 1 || item.marketType === 2)
        ? true
        : undefined,
  };
}

// quick-260611-tbc: settled-card SHARE — EXACTLY the /call/[id] settled share
// recipe (page.tsx:1867-1882): env-locked OG base origin + the shared pure
// builders. ogBase unset → undefined → the card renders NO share control
// (obx precedent, D-08: no dead controls). The handle candidate is passed RAW
// (item.displayHandle ?? item.handle — NEVER the truncateAddress() display
// fallback) so buildShareText's internal isRealHandle omits 0x/#N fakes.
function shareHrefFor(item: FeedItem): string | undefined {
  const word = settledOutcomeWord(item.outcome ?? undefined);
  if (item.status !== 'settled' && item.status !== 'disputed') return undefined;
  if (word === null) return undefined;
  const ogBase = (process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? '').replace(/\/$/, '');
  if (!ogBase) return undefined;
  return twitterIntentUrl(
    `${ogBase}/call/${item.id}`,
    buildShareText({
      outcomeWord: word,
      handle: item.displayHandle ?? item.handle,
      statement: marketLineFor(item),
    }),
  );
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '0x???';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * FeedList — renders the call feed (or skeleton slots while loading).
 */
export function FeedList({ items, isLoading, onItemClick }: FeedListProps) {
  // quick-260611-u1l: batched on-chain reads for the LIVE cards. Hooks are
  // called UNCONDITIONALLY before the early returns (rules of hooks) — empty
  // input arrays pass through and the hooks' `enabled` flags gate the fetch.
  // Lowercase status comparisons only (D-15 canonical boundary).
  const liveItems = items.filter((i) => i.status !== 'settled' && i.status !== 'disputed');
  const reservesMap = useFeedReserves(liveItems.map((i) => i.id));
  const handlesMap = useFeedHandles(liveItems.map((i) => i.caller));

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
          {item.status === 'settled' || item.status === 'disputed' ? (
            <CallCard
              call={feedItemToCallCardData(item)}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
              shareHref={shareHrefFor(item)}
            />
          ) : (
            <LiveCallCard
              item={item}
              reserves={reservesMap.get(item.id)}
              onchainHandle={handlesMap.get(item.caller.toLowerCase())}
              onClick={onItemClick ? () => onItemClick(item) : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}
