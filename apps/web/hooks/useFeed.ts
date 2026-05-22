/**
 * useFeed — Tanstack Query infinite query hook for the call feed.
 *
 * Data source: relayer /api/feed (D-27 — Studio key server-side only)
 * Polling: first page auto-refetches every 5s (UI-56)
 * Pagination: cursor-based recency-desc (D-25)
 *
 * Requirements: CALL-58, CALL-59, UI-56, D-24, D-25, D-26
 */

'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { getFeed, type FeedResponse } from '@/lib/relayer-client';

export type { FeedResponse };

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * useFeed — infinite query for the call feed.
 *
 * Returns:
 *   data.pages[0].items — first page items (polled every 5s, UI-56)
 *   data.pages[n].items — subsequent pages (static, no auto-refresh)
 *   fetchNextPage() — load next cursor page
 *   isLoading — true on initial load
 *   isEmpty — true when first page loaded and has zero items
 */
export function useFeed() {
  const query = useInfiniteQuery<FeedResponse, Error>({
    queryKey: ['feed'],
    queryFn: ({ pageParam }) =>
      getFeed(pageParam as string | undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: FeedResponse) => lastPage.cursor ?? undefined,
    // UI-56: auto-refresh the first page every 5s
    // Note: refetchInterval refetches the entire query from the first page.
    // Deep pagination pages do not auto-refresh — they remain static.
    refetchInterval: 5000,
  });

  const allItems = query.data?.pages.flatMap((p) => p.items) ?? [];
  const isEmpty = !query.isLoading && allItems.length === 0;

  return {
    ...query,
    allItems,
    isEmpty,
  };
}
