/**
 * Call It — The Tape (home feed, `/`) — prototype tape restyle (Phase 09.2-06)
 *
 * Markup: prototype `call it frontend/screens/feed.jsx` (markup + token donor
 * ONLY, D-05). Data layer untouched: useFeed() infinite-query with 5s
 * first-page polling (UI-56), cursor pagination (D-25), relayer /api/feed
 * (D-27 — Studio key never reaches this bundle).
 *
 * Tabs: Live + Settled ONLY (D-08). The old Following tab was unfiltered
 * (rendered the same allItems) and the Duels tab fetched /api/duels — a route that
 * does not exist (verified: apps/web/app/api has no duels route). Both are
 * dead controls and are CUT, not fixed (CONTEXT deferral: "do not reproduce,
 * do not fix here"). The same applies to the trending-duel pin, the
 * Challengeable filter, and the per-card Challenge CTA — all driven by data
 * the feed never receives (openToChallenges is not in the /api/feed
 * response). Challenge lives on /call/[id], where ChallengeFormModal remains.
 *
 * D-06: feed cards carry NO one-click stake toggles — tapping a card
 * navigates to /call/[id] where the real amount-based modals live.
 * D-07: only real FeedItem fields render (see CallCard).
 *
 * Requirements: CALL-58, CALL-59, CALL-60, UI-04, UI-53, UI-56, UI-48
 */

'use client';

import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/hooks/useFeed';
import { FeedList } from '@/components/FeedList';
import { FromYourNetworkSections } from '@/app/components/FromYourNetworkSections';
import type { FeedItem } from '@/lib/relayer-client';

// ── Types ─────────────────────────────────────────────────────────────────────

// D-08: narrowed to the two tabs with real wiring (Following/Duels cut).
type FeedTab = 'Live' | 'Settled';

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

  // Real wiring per tab: Live = not-yet-settled, Settled = settled.
  const liveItems = allItems.filter((item) => item.status !== 'settled');
  const settledItems = allItems.filter((item) => item.status === 'settled');
  const visibleItems = activeTab === 'Live' ? liveItems : settledItems;

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

  const tabs: FeedTab[] = ['Live', 'Settled'];

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

      {/* Tab bar — prototype .tabs: Live + Settled ONLY (D-08) */}
      <div className="tabs" role="tablist">
        {tabs.map((tab) => (
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
            {tab === 'Live' ? 'Live calls' : 'Settled'}
          </button>
        ))}
      </div>

      {/* "From your X / Farcaster" sections — opted-in viewers only
          (AUTH-16 gate inside FromYourNetworkSections; self-hides otherwise). */}
      {activeTab === 'Live' && <FromYourNetworkSections />}

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

          <FeedList
            items={visibleItems}
            isLoading={isLoading}
            onItemClick={handleOpenCall}
          />

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

      {/* Plan 05: Playwright signin.spec.ts hook — preserved per plan dependency */}
      <div data-testid="signed-in" style={{ display: 'none' }} aria-hidden="true" />
    </div>
  );
}
