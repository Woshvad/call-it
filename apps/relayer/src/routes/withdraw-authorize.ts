/**
 * POST /api/withdraw/authorize — 24h cooldown chokepoint for withdrawals (Plan 07).
 *
 * This endpoint is the server-side 24h security gate for all withdrawal-class userOps.
 * Every withdrawal MUST pass through this endpoint before the relayer co-signs.
 *
 * TWO conditions must both pass for an authorization to succeed:
 *   1. Auth method cooldown (AUTH-32, D-10):
 *      The session user's most recently linked auth method must have been linked
 *      >= 24h ago. If linked < 24h ago, the withdrawal is blocked.
 *      This prevents the "link a fresh 2FA then immediately drain" attack.
 *
 *   2. Destination cooldown (AUTH-31, D-09, Pitfall 20):
 *      If the destination address exists in the address_book, its added_at
 *      must be >= 24h ago. If added < 24h ago, the withdrawal is blocked.
 *      Soft-removed entries are still checked (D-08 — removal doesn't reset timer).
 *      Note: if destination is NOT in address_book, this check is skipped
 *      (e.g., the user is sending to a well-known exchange they haven't tracked).
 *      [IMPORTANT: Production implementation should add ALL known user addresses
 *       to address_book at wallet creation time. Plan 09 handles this for profile linking.]
 *
 * BELT-AND-SUSPENDERS (Pitfall D):
 *   Before every authorize check, the relayer also calls @privy-io/server-auth.getUser()
 *   to fetch the live linkedAccounts from Privy's authoritative store.
 *   If any linkedAccount.linkedAt is < 24h ago BUT there is no corresponding
 *   auth_methods row, the relayer INSERTS the row now (lazy backfill) and rejects
 *   the withdrawal. This closes the "Privy webhook delayed" race window.
 *
 * Security events:
 *   Any 403 response fires a P0 telegram alert (address_book_cooldown_bypass_attempt).
 *   This is security-relevant — it means either the UI was bypassed or someone is
 *   attempting to move funds before the cooldown expires.
 *
 * Response:
 *   200 { authorized: true } — all checks pass
 *   403 { error: 'cooldown_active', code: 'cooldown_active', blockedBy: 'auth_method'|'destination',
 *          cooldownEndsAt: ISO string }
 *
 * Requirements: AUTH-31, AUTH-32, D-09, D-10, Pitfall 20, Pitfall D, T-01-42, T-01-44
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { authMethods, addressBook } from '../db/schema.js';
import { privySessionPreHandler, getPrivyClient } from '../lib/privy-auth.js';
import { sendAlert } from '../workers/alerts.js';
import { getLogger } from '../lib/logger.js';

// ─── Constants ───────────────────────────────────────────────────────────────

const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// ─── Validation ──────────────────────────────────────────────────────────────

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const AuthorizeBodySchema = z.object({
  destination: z.string().regex(ADDRESS_REGEX, 'destination must be a valid 0x Ethereum address'),
  userOpHash: z.string().min(1, 'userOpHash is required'),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cooldownEndsAt(linkedAt: Date): Date {
  return new Date(linkedAt.getTime() + COOLDOWN_MS);
}

function isWithinCooldown(linkedAt: Date, now: Date): boolean {
  return linkedAt.getTime() + COOLDOWN_MS > now.getTime();
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function withdrawAuthorizeRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.post<{ Body: z.infer<typeof AuthorizeBodySchema> }>(
    '/api/withdraw/authorize',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;

      const parsed = AuthorizeBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_failed',
          issues: parsed.error.issues,
        });
      }

      const { destination, userOpHash } = parsed.data;
      const db = getDb();
      const now = new Date();

      // ─── BELT-AND-SUSPENDERS: Pitfall D cross-check ──────────────────────
      //
      // Query Privy's authoritative linkedAccounts BEFORE checking our local table.
      // If any linkedAccount.linkedAt is within 24h but has no auth_methods row,
      // the Privy webhook was delayed/missed — insert the row NOW and reject.
      //
      // This closes the race window where a freshly-linked auth method appears
      // in Privy's store but not yet in our DB (T-01-44).
      try {
        const privyUser = await getPrivyClient().getUser(privyUserId);
        const linkedAccounts = privyUser.linkedAccounts ?? [];

        for (const account of linkedAccounts) {
          // Privy types verifiedAt as a Date already — do NOT multiply by 1000
          // (that coerces the Date to its ms value and overshoots ~1000x, which
          // would make isWithinCooldown always true and reject every withdrawal).
          const linkedAt = account.verifiedAt ? new Date(account.verifiedAt) : null;
          if (!linkedAt) continue;
          if (!isWithinCooldown(linkedAt, now)) continue;

          // This account was linked < 24h ago. Check if we have the row.
          const authType = account.type ?? 'unknown';
          const existingRow = await db
            .select({ id: authMethods.id })
            .from(authMethods)
            .where(
              and(
                eq(authMethods.privyUserId, privyUserId),
                eq(authMethods.authType, authType),
              ),
            )
            .limit(1);

          if (existingRow.length === 0) {
            // Webhook was delayed/missed — lazy backfill
            getLogger().warn(
              {
                event: 'auth_methods_lazy_backfill',
                privyUserId,
                authType,
                linkedAt: linkedAt.toISOString(),
              },
              'Privy linkedAccount not in auth_methods — lazy backfill + reject (Pitfall D)',
            );

            await db.insert(authMethods).values({
              privyUserId,
              authType,
              linkedAt,
            }).onConflictDoNothing();

            const cooldownEnd = cooldownEndsAt(linkedAt);

            // Fire P0 security alert
            await sendAlert('address_book_cooldown_bypass_attempt', {
              privyUserId,
              destination,
              userOpHash,
              blockedBy: 'auth_method',
              reason: 'pitfall_d_webhook_delay',
              cooldownEndsAt: cooldownEnd.toISOString(),
            }).catch(() => undefined); // don't block on alert failure

            return reply.status(403).send({
              error: 'cooldown_active',
              code: 'cooldown_active',
              blockedBy: 'auth_method',
              cooldownEndsAt: cooldownEnd.toISOString(),
              message: `New auth method linked ${linkedAt.toISOString()} — 24h cooldown active until ${cooldownEnd.toISOString()}`,
            });
          }
        }
      } catch (err) {
        // Privy API error — fail safe (reject withdrawal if we can't verify)
        getLogger().error(
          { event: 'privy_getuser_failed', privyUserId, err: String(err) },
          'Failed to fetch user from Privy — rejecting withdrawal as precaution',
        );
        return reply.status(503).send({
          error: 'upstream_unavailable',
          message: 'Unable to verify auth method status — please retry',
        });
      }

      // ─── Check 1: Auth method 24h cooldown ───────────────────────────────
      //
      // Find the most recently linked auth method for this user.
      // If linked within the last 24h → reject.
      const authMethodRows = await db
        .select({ linkedAt: authMethods.linkedAt })
        .from(authMethods)
        .where(eq(authMethods.privyUserId, privyUserId));

      if (authMethodRows.length > 0) {
        const maxLinkedAt = authMethodRows.reduce((latest, row) =>
          row.linkedAt > latest ? row.linkedAt : latest,
          authMethodRows[0]!.linkedAt,
        );

        if (isWithinCooldown(maxLinkedAt, now)) {
          const cooldownEnd = cooldownEndsAt(maxLinkedAt);

          getLogger().warn(
            {
              event: 'withdraw_authorize_rejected',
              privyUserId,
              blockedBy: 'auth_method',
              maxLinkedAt: maxLinkedAt.toISOString(),
              cooldownEndsAt: cooldownEnd.toISOString(),
            },
            'withdrawal blocked by auth_method 24h cooldown',
          );

          await sendAlert('address_book_cooldown_bypass_attempt', {
            privyUserId,
            destination,
            userOpHash,
            blockedBy: 'auth_method',
            maxLinkedAt: maxLinkedAt.toISOString(),
            cooldownEndsAt: cooldownEnd.toISOString(),
          }).catch(() => undefined);

          return reply.status(403).send({
            error: 'cooldown_active',
            code: 'cooldown_active',
            blockedBy: 'auth_method',
            cooldownEndsAt: cooldownEnd.toISOString(),
            message: `Auth method linked ${maxLinkedAt.toISOString()} — 24h cooldown active until ${cooldownEnd.toISOString()}`,
          });
        }
      }

      // ─── Check 2: Destination address 24h cooldown ───────────────────────
      //
      // If the destination exists in the address_book (active OR soft-removed),
      // check that added_at is >= 24h ago.
      //
      // D-09: soft-removed addresses still have their original added_at checked.
      // The removal doesn't reset the cooldown timer.
      const destinationRows = await db
        .select({ addedAt: addressBook.addedAt })
        .from(addressBook)
        .where(
          and(
            eq(addressBook.privyUserId, privyUserId),
            eq(addressBook.address, destination.toLowerCase()),
          ),
        );

      if (destinationRows.length > 0) {
        // Use the oldest addedAt (first time this address was added)
        const oldestAddedAt = destinationRows.reduce((oldest, row) =>
          row.addedAt < oldest ? row.addedAt : oldest,
          destinationRows[0]!.addedAt,
        );

        if (isWithinCooldown(oldestAddedAt, now)) {
          const cooldownEnd = cooldownEndsAt(oldestAddedAt);

          getLogger().warn(
            {
              event: 'withdraw_authorize_rejected',
              privyUserId,
              destination,
              blockedBy: 'destination',
              addedAt: oldestAddedAt.toISOString(),
              cooldownEndsAt: cooldownEnd.toISOString(),
            },
            'withdrawal blocked by destination address 24h cooldown',
          );

          await sendAlert('address_book_cooldown_bypass_attempt', {
            privyUserId,
            destination,
            userOpHash,
            blockedBy: 'destination',
            addedAt: oldestAddedAt.toISOString(),
            cooldownEndsAt: cooldownEnd.toISOString(),
          }).catch(() => undefined);

          return reply.status(403).send({
            error: 'cooldown_active',
            code: 'cooldown_active',
            blockedBy: 'destination',
            cooldownEndsAt: cooldownEnd.toISOString(),
            message: `Destination address added ${oldestAddedAt.toISOString()} — 24h cooldown active until ${cooldownEnd.toISOString()}`,
          });
        }
      }

      // ─── All checks passed ───────────────────────────────────────────────
      getLogger().info(
        { event: 'withdraw_authorized', privyUserId, destination, userOpHash },
        'withdrawal authorized',
      );

      return reply.status(200).send({ authorized: true });
    },
  );
}
