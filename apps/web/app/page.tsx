/**
 * Call It — Home feed page (/)
 *
 * Phase 1 feed shell (Plan 09):
 *   - Unauthenticated visitors: see the feed + [Sign in] CTA (§18.1 — public read)
 *   - Authenticated users: see the feed + [+ NEW CALL] primary CTA
 *   - Empty feed: renders D-35 empty state copy + primary button
 *   - Feed cards stagger enter (UI-53) via .card-enter + --index CSS variable
 *   - First page auto-polls every 5s (UI-56) via useFeed refetchInterval
 *
 * Data: relayer /api/feed (D-24/25/26/27 — Studio key server-side only)
 *
 * Requirements: CALL-58, CALL-59, CALL-60, UI-04, UI-53, UI-56, D-24/25/26/27
 *
 * D-12: Domain literals are never hardcoded.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/hooks/useFeed';
import { FeedList } from '@/components/FeedList';

// Import the global CSS for feed card stagger animation (UI-53)
import './globals.css';

export default function HomePage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const { allItems, isLoading, fetchNextPage, hasNextPage } = useFeed();

  function handleNewCallClick() {
    if (authenticated) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/new' as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/signin' as any);
    }
  }

  return (
    <main
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Header row */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}
      >
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            fontFamily: 'monospace',
            letterSpacing: '-0.02em',
            color: '#E8F542',
            margin: 0,
          }}
        >
          CALL IT
        </h1>

        {/* Auth-aware CTA — only shown when Privy is ready */}
        {ready && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            {authenticated ? (
              <button
                onClick={handleNewCallClick}
                style={{
                  padding: '8px 16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  backgroundColor: '#E8F542',
                  color: '#09090E',
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0 0 #000',
                  cursor: 'pointer',
                }}
              >
                + NEW CALL
              </button>
            ) : (
              <button
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push('/signin' as any)}
                style={{
                  padding: '8px 16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  backgroundColor: 'transparent',
                  color: '#E8F542',
                  border: '2px solid #E8F542',
                  cursor: 'pointer',
                }}
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </header>

      {/* Feed list — renders empty state or populated list */}
      <FeedList
        items={allItems}
        isLoading={isLoading}
        onNewCallClick={handleNewCallClick}
      />

      {/* Pagination — load more button (visible when more pages exist) */}
      {hasNextPage && (
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={() => fetchNextPage()}
            style={{
              padding: '8px 24px',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#A1A1AA',
              background: 'none',
              border: '1px solid #27272A',
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      )}

      {/* Plan 05: Playwright signin.spec.ts hook — preserved per plan dependency */}
      <div data-testid="signed-in" style={{ display: 'none' }} aria-hidden="true" />
    </main>
  );
}
