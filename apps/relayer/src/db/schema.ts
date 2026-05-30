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
