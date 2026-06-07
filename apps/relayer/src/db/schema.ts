/**
 * Drizzle ORM schema for the Call It relayer database (Phase 1).
 *
 * Tables defined here are provisioned on Fly Postgres (D-07) via:
 *   pnpm --filter @call-it/relayer db:migrate
 *
 * Security (T-01-03):
 * - varchar(42) on address column rejects oversized 0x literals
 * - varchar(128) on privy_user_id matches Privy's documented DID format
 * - varchar(32) on auth_type prevents arbitrary strings
 *
 * Soft-delete pattern (D-08, T-01-05):
 * - address_book rows are NEVER deleted; removed_at IS NOT NULL = removed
 * - Downstream Plan 07 reads with WHERE removed_at IS NULL filter
 */

import { pgTable, serial, varchar, text, timestamp, integer, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// address_book
// ---------------------------------------------------------------------------

/**
 * Per-user address book entries.
 *
 * D-08: Never delete, only soft-remove via removedAt.
 * D-09: 24h cooldown enforced server-side — addedAt + 24h > now() = deny.
 */
export const addressBook = pgTable(
  'address_book',
  {
    id: serial('id').primaryKey(),
    privyUserId: varchar('privy_user_id', { length: 128 }).notNull(),
    address: varchar('address', { length: 42 }).notNull(),
    label: text('label'),
    addedAt: timestamp('added_at').defaultNow().notNull(),
    /** NULL = active; NOT NULL = soft-removed (D-08) */
    removedAt: timestamp('removed_at'),
  },
  (table) => ({
    addressBookUserIdx: index('address_book_user_idx').on(table.privyUserId),
  }),
);

// ---------------------------------------------------------------------------
// auth_methods
// ---------------------------------------------------------------------------

/**
 * Tracks Privy auth method linkages per user.
 *
 * D-10: New auth method 24h cooldown enforced via withdrawal hook.
 * Populated by: Privy webhook on auth.linked event (preferred), or
 * session-bootstrap polling (fallback).
 */
export const authMethods = pgTable(
  'auth_methods',
  {
    id: serial('id').primaryKey(),
    privyUserId: varchar('privy_user_id', { length: 128 }).notNull(),
    /** 'google' | 'twitter' | 'wallet' — capped at 32 chars (T-01-03) */
    authType: varchar('auth_type', { length: 32 }).notNull(),
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
  },
  (table) => ({
    authMethodsUserIdx: index('auth_methods_user_idx').on(table.privyUserId, table.linkedAt),
  }),
);

// ---------------------------------------------------------------------------
// onboarding_state
// ---------------------------------------------------------------------------

/**
 * Persists 4-screen onboarding progress per user across browser-close (D-32).
 *
 * PK is privy_user_id — one row per user.
 * currentStep: 1=Handle, 2=Connect Socials, 3=Follow-graph opt-in, 4=Tagline
 * Completion signal: taglineCommittedAt IS NOT NULL
 *
 * On next sign-in: relayer reads this row and redirects to the last
 * incomplete step if taglineCommittedAt IS NULL.
 */
export const onboardingState = pgTable('onboarding_state', {
  privyUserId: varchar('privy_user_id', { length: 128 }).primaryKey(),
  currentStep: integer('current_step').default(1).notNull(),
  handleSetAt: timestamp('handle_set_at'),
  socialsStepCompletedAt: timestamp('socials_step_completed_at'),
  followgraphOptinAt: timestamp('followgraph_optin_at'),
  taglineCommittedAt: timestamp('tagline_committed_at'),
});

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

/**
 * Per-user in-app notifications. D-13/D-14.
 *
 * Generic event_type column — 'caller_exited' is the first consumer in Phase 2;
 * designed to be reused by Phase 3 (challenge_proposed) and Phase 4
 * (settlement_ready, payout_available) without schema changes.
 *
 * Soft-read pattern: readAt IS NULL = unread; never deleted.
 *
 * Indexes:
 *   - (user_address, read_at)   — inbox query: WHERE read_at IS NULL
 *   - (user_address, created_at) — pagination: ORDER BY created_at DESC
 *   - UNIQUE (user_address, event_type, call_id) — fan-out idempotency (WR-05).
 *     A caller exits a given call at most once, so each holder receives at most
 *     one caller_exited notification per call. This lets notification-fanout.ts
 *     run INSERT ... ON CONFLICT DO NOTHING, so a re-processed event (capped-range
 *     overlap, worker restart, RPC retry) cannot create duplicate rows. Generalises
 *     to future event types (one settlement_ready per call, etc.).
 *
 * Security (T-02-05-02): eventType written exclusively by the relayer worker;
 * varchar(50) cap prevents injection via oversized strings.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    /** Ethereum address of the notification recipient (0x + 40 hex chars) */
    userAddress: varchar('user_address', { length: 42 }).notNull(),
    /**
     * Application-controlled event discriminant.
     * Phase 2: 'caller_exited'
     * Phase 3: 'challenge_proposed'
     * Phase 4: 'settlement_ready' | 'payout_available'
     */
    eventType: varchar('event_type', { length: 50 }).notNull(),
    /** On-chain callId the notification refers to */
    callId: integer('call_id').notNull(),
    /**
     * Arbitrary JSON payload — call metadata, amounts, etc.
     * No private keys or PII beyond the recipient's own public address (T-02-05-01).
     */
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    /** NULL = unread; NOT NULL = read (D-14) */
    readAt: timestamp('read_at'),
  },
  (table) => ({
    notificationsUserReadIdx: index('notifications_user_read_idx').on(
      table.userAddress,
      table.readAt,
    ),
    notificationsUserTimeIdx: index('notifications_user_time_idx').on(
      table.userAddress,
      table.createdAt,
    ),
    // WR-05: idempotency key — dedupes re-processed events at the DB layer so the
    // fan-out worker's ON CONFLICT DO NOTHING cannot create duplicate rows.
    notificationsDedupeIdx: uniqueIndex('notifications_user_event_call_idx').on(
      table.userAddress,
      table.eventType,
      table.callId,
    ),
  }),
);

// ---------------------------------------------------------------------------
// quote_stance
// ---------------------------------------------------------------------------

/**
 * Off-chain quote-call stance annotation. D-15.
 *
 * Records whether a quote-call follows or fades the parent call.
 * Keyed to the on-chain CallQuoted event (parentCallId + quoteCallId pair).
 *
 * Read by: apps/relayer/src/routes/quote-stance.ts
 * Written by: Drizzle db.insert(quoteStance).values(row) in quote-stance.ts
 *
 * Index:
 *   - (quote_call_id) — look up stance for a given quote call
 */
export const quoteStance = pgTable(
  'quote_stance',
  {
    id: serial('id').primaryKey(),
    /** On-chain callId of the original (parent) call being quoted */
    callId: integer('call_id').notNull(),
    /** On-chain callId of the quoting call */
    quoteCallId: integer('quote_call_id').notNull(),
    /** 'following' | 'fading' — caller's stated stance relative to the parent call */
    stance: varchar('stance', { length: 10 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    quoteStanceQuoteIdx: index('quote_stance_quote_idx').on(table.quoteCallId),
  }),
);

// ---------------------------------------------------------------------------
// trending_duels  (Phase 3 — D-07)
// ---------------------------------------------------------------------------

/**
 * Tracks which 1v1 challenges are currently "trending" for the Duels feed.
 *
 * A challenge earns a trending pin when its pot >= $500 USDC or backer count >= 50.
 * The duel-trending-worker.ts upserts rows on every tick (60s cadence) and
 * deletes expired pins (trending_until < now()) so only live duels surface.
 *
 * Dedup index on challenge_id ensures ON CONFLICT DO UPDATE re-pins without
 * duplicating the same duel — mirrors the WR-05 notifications idempotency pattern.
 *
 * Written by: apps/relayer/src/workers/duel-trending-worker.ts
 * Read by:    apps/relayer/src/routes/duels.ts (trending_duels WHERE trending_until > now())
 */
export const trendingDuels = pgTable(
  'trending_duels',
  {
    id: serial('id').primaryKey(),
    /** On-chain challengeId from ChallengeEscrow */
    challengeId: integer('challenge_id').notNull(),
    /** ISO timestamp when the trending pin expires (set to now() + 4h on each upsert) */
    trendingUntil: timestamp('trending_until').notNull(),
    /** Combined pot in USDC micro-units (challengerStake + callerStake) at time of pin */
    potUsdc: varchar('pot_usdc', { length: 30 }).notNull().default('0'),
    /** Follow + fade backer count on the parent call at time of pin */
    backerCount: integer('backer_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    /** Dedup key — one row per challengeId; ON CONFLICT DO UPDATE re-pins expiry */
    trendingDuelsChallengeIdx: uniqueIndex('trending_duels_challenge_id_idx').on(table.challengeId),
    /** Expiry scan index — DELETE FROM trending_duels WHERE trending_until < now() */
    trendingDuelsTrendingUntilIdx: index('trending_duels_trending_until_idx').on(table.trendingUntil),
  }),
);

// ---------------------------------------------------------------------------
// call_oracle_criteria  (Phase 05.1 — Gap B.3)
// ---------------------------------------------------------------------------

/**
 * Off-chain criteria store for non-Pyth oracle adapters.
 *
 * The on-chain Call struct does not carry string identifiers (proposalId,
 * protocolSlug, tokenSymbol). This table bridges the gap:
 *
 *   Writer: apps/relayer/src/workers/calls-preflight.ts
 *           Called via insertCriteria() after CallCreated on-chain confirmation.
 *           Only DefiLlama (2), RpcMetrics (3), and CexScraper (6) calls need a row.
 *           Governance (Snapshot/Tally) use assetA encoding; NFT-TWAP uses assetA.
 *
 *   Reader: apps/relayer/src/workers/oracle-adapters/{defillama,rpc-metrics,cex}-adapter.ts
 *           Called via resolveCriteria(callId) at settlement time.
 *           If null returned → adapter returns { ambiguous: true } → settlement DEFERs.
 *
 * Fail-safe (T-05.1-04-02): if this table is unavailable or row missing,
 * the adapter must NEVER settle — it returns { ambiguous: true } so the
 * dispute window handles it. No mis-settlement is possible.
 *
 * PK on call_id is sufficient for the lookup pattern (single key lookup at
 * settlement time). No secondary indexes needed.
 */
export const callOracleCriteria = pgTable('call_oracle_criteria', {
  /** On-chain callId (assigned post-tx from CallCreated event) */
  callId: integer('call_id').primaryKey().notNull(),
  /**
   * OracleType enum value: 2=DefiLlama, 3=RpcMetrics, 6=CexScraper.
   * (Governance=4/5 and NFT-TWAP=1 do not use this table.)
   */
  oracleType: integer('oracle_type').notNull(),
  /**
   * The string identifier the adapter needs at settlement time:
   *   - DefiLlama / RpcMetrics: protocolSlug (e.g. 'uniswap', 'aave')
   *   - CexScraper: tokenSymbol (e.g. 'BTC', 'ETH')
   */
  identifier: text('identifier').notNull(),
  /**
   * Optional unit description for targetValue comparison (e.g. 'tvl', 'volume_24h').
   * NULL for CEX calls (binary listed/not-listed; no unit needed).
   */
  targetUnit: text('target_unit'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// follow_graph  (Phase 01.5 — D-12, AUTH-17)
// ---------------------------------------------------------------------------

/**
 * Viewer-scoped Twitter/Farcaster follow graph (D-12, AUTH-17).
 *
 * Keyed by the authenticated viewer's privyUserId — the relayer NEVER exposes
 * another user's graph (AUTH-17 viewer-only). One row per followed handle/id.
 * The "From your X / Farcaster" feed (FEED wave, 01.5 later plan) cross-references
 * these handles against on-chain-linked twitterHandle/farcasterHandle.
 *
 * Privacy (AUTH-17, D-13): purge-on-disconnect deletes these rows AND the matching
 * Redis cache key. The unlink-purge route + SocialUnlinked watcher both clear them.
 *
 * Mirrors the existing varchar/index patterns (varchar(128) privy_user_id).
 */
export const followGraph = pgTable(
  'follow_graph',
  {
    id: serial('id').primaryKey(),
    /** Authenticated viewer's Privy DID — the graph owner (viewer-only, AUTH-17) */
    privyUserId: varchar('privy_user_id', { length: 128 }).notNull(),
    /** 'twitter' | 'farcaster' */
    platform: varchar('platform', { length: 16 }).notNull(),
    /** Followed account's handle — normalized, lowercased */
    followedHandle: varchar('followed_handle', { length: 64 }),
    /** Followed account's stable id — X user id / Farcaster fid */
    followedId: varchar('followed_id', { length: 64 }),
    fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
  },
  (table) => ({
    /** Per-viewer, per-platform lookup for feed cross-reference + purge */
    followGraphUserIdx: index('follow_graph_user_idx').on(table.privyUserId, table.platform),
  }),
);

// ---------------------------------------------------------------------------
// social_link_index  (Phase 01.5 — D-06 handle uniqueness)
// ---------------------------------------------------------------------------

/**
 * Off-chain handle-uniqueness index (D-06): one ACTIVE link per (platform, handle).
 *
 * A given X/FC handle can be actively linked to only one Call It profile at a
 * time. A second account attempting to link an already-active handle is rejected
 * with 409 (anti-impersonation / anti-squatting). Re-linking a different handle to
 * your own profile is allowed (last valid proof wins for your account).
 *
 * Active = unlinkedAt IS NULL. On unlink/purge, the active row is marked
 * unlinkedAt = now() rather than deleted (auditable history).
 *
 * uniqueIndex on (platform, handle_normalized): the relayer's
 * assertHandleAvailable() enforces the "one active link" rule in application code
 * (a row is only ever inserted/reactivated after the active-elsewhere check
 * passes), so this unique index also guards against double-insert races. Because
 * unlinked rows keep their (platform, handle_normalized), the application
 * reactivates the existing row on re-link rather than inserting a duplicate.
 *
 * Mirrors RESEARCH Pattern 5 schema.
 */
export const socialLinkIndex = pgTable(
  'social_link_index',
  {
    id: serial('id').primaryKey(),
    /** 'twitter' | 'farcaster' */
    platform: varchar('platform', { length: 16 }).notNull(),
    /** Normalized handle (lowercased, '@'-stripped) — the uniqueness key */
    handleNormalized: varchar('handle_normalized', { length: 64 }).notNull(),
    /** On-chain wallet address the handle is linked to (0x + 40 hex) */
    userAddress: varchar('user_address', { length: 42 }).notNull(),
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
    /** NULL = ACTIVE link; NOT NULL = unlinked (D-06 active = unlinkedAt IS NULL) */
    unlinkedAt: timestamp('unlinked_at'),
  },
  (table) => ({
    /** One row per (platform, handle) — guards double-insert; app reactivates on re-link */
    socialLinkActiveIdx: uniqueIndex('social_link_active_idx').on(
      table.platform,
      table.handleNormalized,
    ),
    /** Reverse lookup for backstop purge by user address (SocialUnlinked watcher) */
    socialLinkUserIdx: index('social_link_user_idx').on(table.userAddress),
  }),
);

// ---------------------------------------------------------------------------
// duel_kings  (Phase 3 — D-07)
// ---------------------------------------------------------------------------

/**
 * Weekly Duel King leaderboard. One row per week (keyed by week_anchor = Monday 00:00 UTC).
 *
 * The duel-king-worker.ts runs weekly to elect the Duel King:
 *   1. Query subgraph for settled challenges in the trailing 7 days.
 *   2. Group by winner; compute consecutive win streak within the window.
 *   3. Tie-break: most recent win, then highest pot.
 *   4. Upsert INTO duel_kings ON CONFLICT (week_anchor) DO UPDATE.
 *
 * Phase 4 settlement worker populates real settled-challenge data; until then
 * the worker produces placeholder output (D-08 decision).
 *
 * Written by: apps/relayer/src/workers/duel-king-worker.ts
 * Read by:    apps/relayer/src/routes/duels.ts (Duel King banner)
 */
export const duelKings = pgTable(
  'duel_kings',
  {
    id: serial('id').primaryKey(),
    /** Ethereum address of this week's Duel King (0x + 40 hex chars) */
    winnerAddress: varchar('winner_address', { length: 42 }).notNull(),
    /** Consecutive win streak within trailing 7d window (at time of computation) */
    winStreak: integer('win_streak').notNull().default(0),
    /** Highest individual pot won in this week, in USDC micro-units (for tie-break) */
    highestPotUsdc: varchar('highest_pot_usdc', { length: 30 }).notNull().default('0'),
    /** Most recent win timestamp for tie-break resolution */
    lastWinAt: timestamp('last_win_at'),
    /** Week anchor: Monday 00:00 UTC of the computation week (unique per week) */
    weekAnchor: timestamp('week_anchor').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    /** One Duel King per week — ON CONFLICT (week_anchor) DO UPDATE re-elects */
    duelKingsWeekIdx: uniqueIndex('duel_kings_week_anchor_idx').on(table.weekAnchor),
  }),
);

// ---------------------------------------------------------------------------
// call_statement  (Phase 07 — D-05 relayer-authoritative statement)
// ---------------------------------------------------------------------------

/**
 * Off-chain authoritative human-readable market statement (prose) per call (D-05).
 *
 * The on-chain Call struct carries no prose — only numerics (marketType, assetA,
 * targetValue, etc.). This table is the SINGLE SOURCE of the human-readable
 * "what is being called" line that the OG card + receipt page render via
 * /api/calls/:id/live-state `marketLine` (IN-03 closure). It is the analog of
 * call_oracle_criteria (the off-chain string bridge for oracle adapters), kept as
 * a DISTINCT table — it is NOT the `reasoning` field (D-05 discretion: reasoning is
 * the caller's argument; statement is the market line).
 *
 *   Writer: apps/relayer/src/workers/calls-preflight.ts (handleCallCreated)
 *           via insertCallStatement() at call-create time. The write is FAIL-SAFE
 *           non-fatal — a DB outage logs + continues, never blocks call creation
 *           (T-07-02-02).
 *
 *   Reader: apps/relayer/src/routes/live-state.ts via resolveCallStatement(callId)
 *           → response.marketLine (authoritative prose, D-05). When null, marketLine
 *           is omitted so the client/OG falls back to the subgraph templated mirror
 *           (D-03 — no IPFS on the hot path).
 *
 * Security (V5, T-07-02-01): the statement is caller-supplied untrusted prose. It is
 * length-capped on persist (STATEMENT_MAX_LEN) before storage; Satori renders it as
 * text (not HTML) and the OG truncates further at render time.
 *
 * PK on call_id is sufficient (single-key lookup at render time). No secondary indexes.
 */
export const callStatement = pgTable('call_statement', {
  /** On-chain callId (assigned post-tx from the CallCreated event) */
  callId: integer('call_id').primaryKey().notNull(),
  /** Authoritative human-readable market statement (untrusted, length-capped on persist) */
  statement: text('statement').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
