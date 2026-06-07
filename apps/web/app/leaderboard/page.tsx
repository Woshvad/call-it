/**
 * Leaderboard page — /leaderboard ("The Tape")
 *
 * Server Component: fetches the ranked board from the subgraph (Profile.globalRep
 * DESC at read time, D-06) and passes it to the client renderer. The Subgraph
 * Studio key stays server-side (D-27) — see lib/leaderboard-client.ts.
 *
 * D-04: this page (and the profile page) fetch the data feed client-side at deploy;
 * full cross-origin hydration verification is the operator-gated deploy (Plan 07-06).
 * Here the data is fetched server-side from the public Studio query URL.
 *
 * Requirements: UI-12, UI-13, D-06, D-27, D-04
 */

// Server Component — no 'use client'

import { LeaderboardClient } from './LeaderboardClient';
import { getLeaderboard } from '@/lib/leaderboard-client';
import type { LeaderboardData } from '@/lib/leaderboard-client';

export default async function LeaderboardPage() {
  let data: LeaderboardData | null = null;
  let fetchError: string | null = null;

  // Server-side fetch: subgraph Profile.globalRep DESC (D-06). Studio key server-side (D-27).
  try {
    data = await getLeaderboard('all');
  } catch (err) {
    fetchError = err instanceof Error ? err.message : 'Leaderboard fetch failed';
    data = null;
  }

  return <LeaderboardClient data={data} fetchError={fetchError} />;
}
