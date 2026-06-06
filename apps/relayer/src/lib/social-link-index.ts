/**
 * Off-chain handle-uniqueness index helpers (D-06).
 *
 * One ACTIVE link per (platform, handleNormalized): a handle can be actively
 * linked to only one Call It profile at a time. A second account attempting to
 * link an already-active handle is rejected with a 409-shaped error
 * (anti-impersonation / anti-squatting). Re-linking the SAME handle to the SAME
 * user is allowed (idempotent). Active = unlinkedAt IS NULL.
 *
 * These helpers operate on the social_link_index drizzle table. They take the
 * drizzle db client as a parameter so routes/workers/tests can inject a mock.
 *
 * Requirements: AUTH-13, D-06. Threat T-01.5-02-03 (handle squatting).
 */

import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { socialLinkIndex } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type DrizzleDb = NodePgDatabase<typeof schema>;

/** Platform string stored in the index. */
export type SocialIndexPlatform = 'twitter' | 'farcaster';

/**
 * A conflict error carrying the 409 shape the route returns to the client.
 * Thrown by assertHandleAvailable when the handle is actively linked elsewhere.
 */
export class HandleAlreadyLinkedError extends Error {
  readonly statusCode = 409;
  readonly code = 'handle_already_linked';
  constructor(message = 'handle_already_linked') {
    super(message);
    this.name = 'HandleAlreadyLinkedError';
  }
}

/**
 * Normalize a handle for matching (Claude's Discretion):
 * lowercase + strip a single leading '@' + trim whitespace.
 */
export function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

/**
 * Assert the (platform, handle) is available for `userAddress` (D-06).
 *
 * Available if there is NO active row (unlinkedAt IS NULL) for this
 * (platform, handleNormalized) owned by a DIFFERENT address. An active row owned
 * by the SAME address is fine (re-link / idempotent).
 *
 * @throws HandleAlreadyLinkedError (409) when actively linked to a different user.
 */
export async function assertHandleAvailable(
  db: DrizzleDb,
  platform: SocialIndexPlatform,
  handleNormalized: string,
  userAddress: string,
): Promise<void> {
  const active = await db
    .select()
    .from(socialLinkIndex)
    .where(
      and(
        eq(socialLinkIndex.platform, platform),
        eq(socialLinkIndex.handleNormalized, handleNormalized),
        isNull(socialLinkIndex.unlinkedAt),
      ),
    );

  const conflict = active.find(
    (row) => row.userAddress.toLowerCase() !== userAddress.toLowerCase(),
  );
  if (conflict) {
    throw new HandleAlreadyLinkedError();
  }
}

/**
 * Record an active link for (platform, handle) → userAddress (D-06).
 *
 * If a row already exists for this (platform, handleNormalized) — whether active
 * (same user re-link) or previously unlinked — it is reactivated/repointed to the
 * current userAddress with unlinkedAt cleared. Otherwise a new active row is
 * inserted. This keeps the (platform, handleNormalized) unique index satisfied
 * while supporting re-link and last-valid-proof-wins semantics.
 *
 * Call AFTER assertHandleAvailable has passed.
 */
export async function recordActiveLink(
  db: DrizzleDb,
  platform: SocialIndexPlatform,
  handleNormalized: string,
  userAddress: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(socialLinkIndex)
    .where(
      and(
        eq(socialLinkIndex.platform, platform),
        eq(socialLinkIndex.handleNormalized, handleNormalized),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(socialLinkIndex)
      .set({ userAddress, linkedAt: new Date(), unlinkedAt: null })
      .where(
        and(
          eq(socialLinkIndex.platform, platform),
          eq(socialLinkIndex.handleNormalized, handleNormalized),
        ),
      );
    return;
  }

  await db.insert(socialLinkIndex).values({
    platform,
    handleNormalized,
    userAddress,
  });
}

/**
 * Mark all active links for a user on a platform as unlinked (D-06, D-13).
 *
 * Used by the unlink-purge route and the SocialUnlinked backstop watcher.
 * Idempotent — re-running is a no-op (already-unlinked rows are not re-touched
 * meaningfully). Sets unlinkedAt = now() on any active rows for this user.
 */
export async function markUnlinked(
  db: DrizzleDb,
  platform: SocialIndexPlatform,
  userAddress: string,
): Promise<void> {
  await db
    .update(socialLinkIndex)
    .set({ unlinkedAt: new Date() })
    .where(
      and(
        eq(socialLinkIndex.platform, platform),
        eq(socialLinkIndex.userAddress, userAddress),
        isNull(socialLinkIndex.unlinkedAt),
      ),
    );
}
