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

import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';

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
