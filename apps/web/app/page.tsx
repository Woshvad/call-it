/**
 * Call It — The Tape (home feed, `/`) — prototype tape restyle (Phase 09.2-06)
 * + restored Following/Duels tabs and asset-class chip row (quick-260611-t7h).
 *
 * Markup: prototype `call it frontend/screens/feed.jsx` (markup + token donor
 * ONLY, D-05). Data layer untouched: useFeed() infinite-query with 5s
 * first-page polling (UI-56), cursor pagination (D-25), relayer /api/feed
 * (D-27 — Studio key never reaches this bundle).
 *
 * Tabs: Live calls / Settled / Following / Duels. The 09.2 D-08 cut of
 * Following/Duels is SUPERSEDED 2026-06-11 (user request): the cut rationale
 * is obsolete — `GET /api/duels` is now real and subgraph-backed (relayer
 * proxy, see app/duels/page.tsx), and Following hosts the real
 * FromYourNetworkSections with an honest dashed fallback. Counts stay honest
 * (D-07): Live/Settled are real lengths, Duels only after the fetch succeeds,
 * Following NEVER (the prototype's 12 was fake). The trending-duel pin, the
 * Challengeable filter, and the per-card Challenge CTA remain CUT — still
 * driven by data the feed never receives.
 *
 * Chip row (Live + Settled only): asset-class grouping over the REAL
 * `assetSymbol` enrichment (lib/relayer-client.ts FeedItem), NOT the 3-value
 * on-chain Category enum. NFTS/MACRO chips trimmed per D-08 (no such call
 * types exist in v1 data — see lib/asset-class.ts).
 *
 * D-06: feed cards carry NO one-click stake toggles — tapping a card
 * navigates to /call/[id] where the real amount-based modals live.
 * D-07: only real FeedItem fields render (see CallCard).
 *
 * Requirements: CALL-58, CALL-59, CALL-60, UI-04, UI-53, UI-56, UI-48
 */

'use client';

import React, { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/hooks/useFeed';
import { FeedList } from '@/components/FeedList';
import { FromYourNetworkSections } from '@/app/components/FromYourNetworkSections';
import { ASSET_CLASS_CHIPS, assetMatchesChip } from '@/lib/asset-class';
import type { FeedItem } from '@/lib/relayer-client';
import { fetchDuels, type DuelEntry } from '@/lib/duels-client';
import { DuelCard } from '@/components/DuelCard';
import { useDuelEnrichment } from '@/hooks/useDuelEnrichment';
import { useFeedHandles } from '@/hooks/useFeedMarketData';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedTab = 'Live' | 'Settled' | 'Following' | 'Duels';

const TAB_LABELS: Record<FeedTab, string> = {
  Live: 'Live calls',
  Settled: 'Settled',
  Following: 'Following',
  Duels: 'Duels',
};

// ── Duels tab wiring — shared duels-client + DuelCard (quick-260611-ust) ──────
// The former local DuelTabRow type / fetchDuels copy / compact DuelRowLink
// moved to lib/duels-client.ts and components/DuelCard.tsx — the feed Duels
// tab now renders the same rich at-a-glance cards as /duels. The count-chip
// logic and the 'NO LIVE DUELS IN YOUR GRAPH.' empty state are unchanged.

// ── Dashed empty block (prototype feed.jsx ~294-305) ──────────────────────────

function DashedEmpty({ heading, sub }: { heading: string; sub: string }) {
  return (
    <div
      style={{
        padding: '80px 20px',
        textAlign: 'center',
        border: '2px dashed var(--border-active)',
      }}
    >
      <div className="h-2" style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
        {heading}
      </div>
      <span className="muted">{sub}</span>
    </div>
  );
}

// ── Empty state (UI-SPEC Copywriting Contract) ─────────────────────────────────

function EmptyTape({ onNewCallClick }: { onNewCallClick: () => void }) {
  return (
    <div
      className="brutal-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <span className="label-overline" style={{ letterSpacing: '0.14em' }}>
        NOTHING ON THE TAPE
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Be the first to go on record.
      </span>
      <button type="button" className="btn cream" onClick={onNewCallClick}>
        + NEW CALL
      </button>
    </div>
  );
}

// ── Error state ("Couldn't load the tape. Retry.") ─────────────────────────────

function TapeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="brutal-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '48px 24px',
        textAlign: 'center',
        borderColor: 'var(--accent-loss)',
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent-loss)',
        }}
      >
        Couldn&apos;t load the tape. Retry.
      </span>
      <button type="button" className="btn outline-white" onClick={onRetry}>
        RETRY
      </button>
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function HomePage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const {
    allItems,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
  } = useFeed();

  const [activeTab, setActiveTab] = useState<FeedTab>('Live');
  const [activeChip, setActiveChip] = useState<string>('All');
  const [duels, setDuels] = useState<DuelEntry[] | null>(null);

  // One fetch on mount; failure keeps `duels` null (no badge, dashed empty).
  useEffect(() => {
    let cancelled = false;
    void fetchDuels().then((result) => {
      if (!cancelled) setDuels(result ? result.duels : null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Duel-card enrichment + handles (quick-260611-ust) — hooks called
  // unconditionally at component top (empty inputs no-op internally).
  const duelEnrichMap = useDuelEnrichment(duels);
  const duelHandleAddrs: string[] = [];
  for (const d of duels ?? []) {
    duelHandleAddrs.push(d.challenger, d.caller);
  }
  for (const e of duelEnrichMap.values()) {
    if (e.winner) duelHandleAddrs.push(e.winner);
  }
  const duelHandles = useFeedHandles(duelHandleAddrs);

  // Real wiring per tab: Live = not-yet-settled, Settled = settled (or under
  // dispute review — the settlement happened). `item.status` is the canonical
  // lowercase status normalized ONCE at the relayer-client boundary (C1 —
  // comparing the TitleCase wire values here was the settled-in-LIVE-tab bug).
  const settledItems = allItems.filter(
    (item) => item.status === 'settled' || item.status === 'disputed',
  );
  const liveItems = allItems.filter(
    (item) => item.status !== 'settled' && item.status !== 'disputed',
  );
  const visibleItems = activeTab === 'Settled' ? settledItems : liveItems;

  // Chip filter over the REAL assetSymbol enrichment. EmptyTape/TapeError and
  // the section-divider keep keying off the UNFILTERED visibleItems.
  const chipFiltered =
    activeChip === 'All'
      ? visibleItems
      : visibleItems.filter((i) => assetMatchesChip(i.assetSymbol, activeChip));

  // Honest counts ONLY (D-07): null → no badge rendered.
  function tabCount(tab: FeedTab): number | null {
    if (tab === 'Live') return liveItems.length;
    if (tab === 'Settled') return settledItems.length;
    if (tab === 'Duels') return duels !== null ? duels.length : null; // only post-fetch-success
    if (tab === 'Following') return null; // no real source — the prototype's 12 was fake (D-07)
    return null;
  }

  function handleNewCallClick() {
    if (authenticated) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/new' as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/signin' as any);
    }
  }

  // D-06: card tap navigates to the call page (the real amount-based
  // FollowFadeModal and ChallengeFormModal live there) — no inline staking.
  function handleOpenCall(item: FeedItem) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(`/call/${item.id}` as any);
  }

  const tabs: FeedTab[] = ['Live', 'Settled', 'Following', 'Duels'];

  // Honest Following fallback — renders only when BOTH network sections are
  // hidden (declined/unset platforms, AUTH-16 gate inside the component).
  const quietHere = (
    <DashedEmpty heading="QUIET HERE." sub="Follow more callers to populate this feed." />
  );

  return (
    <div>
      {/* Page header — prototype .page-header */}
      <div className="page-header">
        <div>
          <h1>The Tape</h1>
          <div className="sub">
            <span className="em">Live calls.</span> Real money. Permanent
            receipts.
          </div>
        </div>
        {/* Auth-aware CTA — only shown once Privy is ready */}
        {ready && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {authenticated ? (
              <button
                type="button"
                className="btn cream"
                onClick={handleNewCallClick}
              >
                + NEW CALL
              </button>
            ) : (
              <button
                type="button"
                className="btn outline-white"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push('/signin' as any)}
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab bar — prototype .tabs: 4 tabs, honest counts only (D-07) */}
      <div className="tabs" role="tablist">
        {tabs.map((tab) => {
          const count = tabCount(tab);
          return (
            <button
              type="button"
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === tab
                    ? '3px solid var(--accent-win)'
                    : '3px solid transparent',
                minHeight: 44,
              }}
            >
              {TAB_LABELS[tab]}
              {count != null && <span className="count">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Live/Settled: chip row + tape body (prototype parity — the network
          sections moved to the Following tab) */}
      {(activeTab === 'Live' || activeTab === 'Settled') && (
        <>
          {/* Asset-class filter chips — Live + Settled ONLY (NFTs/Macro cut, D-08) */}
          <div className="chip-row" style={{ marginBottom: 28 }}>
            {ASSET_CLASS_CHIPS.map((c) => (
              <button
                type="button"
                key={c}
                className={`chip ${activeChip === c ? 'active' : ''}`}
                onClick={() => setActiveChip(c)}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Tape body */}
          {isError && visibleItems.length === 0 ? (
            <TapeError onRetry={() => void refetch()} />
          ) : !isLoading && visibleItems.length === 0 ? (
            <EmptyTape onNewCallClick={handleNewCallClick} />
          ) : (
            <>
              {visibleItems.length > 0 && (
                <div className="section-divider" style={{ marginTop: 0 }}>
                  <span className="title">
                    {activeTab === 'Live' && (
                      <span className="live-dot" aria-hidden="true" />
                    )}
                    {activeTab === 'Live' ? 'THE TAPE · LIVE' : 'THE TAPE · SETTLED'}
                  </span>
                  <span className="line" />
                </div>
              )}

              {chipFiltered.length === 0 && visibleItems.length > 0 ? (
                /* Chip-empty: the tape has items, just none in this class —
                   distinct from EmptyTape (truly empty tape + NEW CALL CTA). */
                <div
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                    textAlign: 'center',
                    padding: '32px 0',
                  }}
                >
                  NO {activeChip.toUpperCase()} CALLS ON THE TAPE.
                </div>
              ) : (
                <FeedList
                  items={chipFiltered}
                  isLoading={isLoading}
                  onItemClick={handleOpenCall}
                />
              )}

              {/* Pagination — real cursor wiring (fetchNextPage), restyled */}
              {hasNextPage && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginTop: 24,
                  }}
                >
                  <button
                    type="button"
                    className="btn outline-white"
                    onClick={() => void fetchNextPage()}
                  >
                    Load more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Following: the real network sections (AUTH-16 gate inside) with an
          honest dashed fallback when both platforms are hidden */}
      {activeTab === 'Following' && <FromYourNetworkSections fallback={quietHere} />}

      {/* Duels: real /api/duels rows or the honest dashed empty (D-07) */}
      {activeTab === 'Duels' &&
        (duels === null || duels.length === 0 ? (
          <DashedEmpty
            heading="NO LIVE DUELS IN YOUR GRAPH."
            sub="Issue a challenge from any call."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {duels.map((duel) => (
              <DuelCard
                key={duel.challengeId}
                duel={duel}
                enrichment={duelEnrichMap.get(duel.challengeId)}
                handles={duelHandles}
              />
            ))}
          </div>
        ))}

      {/* Plan 05: Playwright signin.spec.ts hook — preserved per plan dependency */}
      <div data-testid="signed-in" style={{ display: 'none' }} aria-hidden="true" />
    </div>
  );
}
