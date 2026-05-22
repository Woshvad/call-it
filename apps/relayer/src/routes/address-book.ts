/**
 * Address Book CRUD routes (Plan 07, D-07/08/09, AUTH-31).
 *
 * Routes (all privy-session-gated):
 *   GET    /api/addressbook       — list active entries for the authenticated user
 *   POST   /api/addressbook       — add a new address (starts 24h cooldown timer)
 *   DELETE /api/addressbook/:id   — soft-remove (sets removed_at; NEVER deletes the row)
 *
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 * SOFT DELETE ONLY — D-08 compliance guard
 *
 * This file MUST NOT call db.delete() on address_book rows.
 * Deletion is performed by setting removed_at = NOW() only.
 * The grep guard in verification checks: grep -r "db\.delete\(" address-book.ts
 * MUST return ZERO matches.
 *
 * Reason: the address book's cooldown check (in withdraw-authorize.ts) queries
 * ALL rows including removed ones to detect 24h bypass attempts even for
 * addresses the user has since removed (Pitfall 20 / D-09 — the removal itself
 * does NOT reset the cooldown timer).
 * !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
 *
 * Security: T-01-42, T-01-50
 * Requirements: AUTH-31, D-07, D-08, D-09, Pitfall 20
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { addressBook } from '../db/schema.js';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';

// ─── Validation ──────────────────────────────────────────────────────────────

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const AddAddressSchema = z.object({
  address: z.string().regex(ADDRESS_REGEX, 'address must be a valid 0x Ethereum address'),
  label: z.string().max(50).optional(),
});

// ─── Route ───────────────────────────────────────────────────────────────────

export async function addressBookRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /**
   * GET /api/addressbook
   * Returns all active (not soft-removed) address book entries for the current user.
   */
  app.get(
    '/api/addressbook',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;
      const db = getDb();

      const rows = await db
        .select()
        .from(addressBook)
        .where(
          and(
            eq(addressBook.privyUserId, privyUserId),
            isNull(addressBook.removedAt),
          ),
        );

      const entries = rows.map((row) => ({
        id: row.id,
        address: row.address,
        label: row.label,
        addedAt: row.addedAt.toISOString(),
        removedAt: row.removedAt?.toISOString() ?? null,
      }));

      getLogger().info(
        { event: 'address_book_listed', privyUserId, count: entries.length },
        'address book listed',
      );

      return reply.status(200).send(entries);
    },
  );

  /**
   * POST /api/addressbook
   * Adds a new address to the address book. Starts the 24h cooldown timer.
   *
   * Body: { address: string, label?: string }
   */
  app.post<{ Body: z.infer<typeof AddAddressSchema> }>(
    '/api/addressbook',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;

      const parsed = AddAddressSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: 'validation_failed',
          issues: parsed.error.issues,
        });
      }

      const { address, label } = parsed.data;
      const db = getDb();

      const [inserted] = await db
        .insert(addressBook)
        .values({
          privyUserId,
          address,
          label: label ?? null,
          addedAt: new Date(),
        })
        .returning();

      getLogger().info(
        { event: 'address_book_entry_added', privyUserId, address, id: inserted?.id },
        'address book entry added',
      );

      return reply.status(201).send({
        id: inserted!.id,
        address: inserted!.address,
        label: inserted!.label,
        addedAt: inserted!.addedAt.toISOString(),
        removedAt: null,
      });
    },
  );

  /**
   * DELETE /api/addressbook/:id
   * Soft-removes an address book entry (sets removed_at = NOW()).
   * The row is NEVER deleted from Postgres — D-08 compliance.
   *
   * NOTE: This endpoint uses UPDATE … SET removed_at = NOW() only.
   * db.delete() is FORBIDDEN in this file (grep guard in verification).
   */
  app.delete<{ Params: { id: string } }>(
    '/api/addressbook/:id',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;
      const entryId = parseInt(request.params.id, 10);

      if (isNaN(entryId) || entryId <= 0) {
        return reply.status(400).send({ error: 'invalid_id', message: 'id must be a positive integer' });
      }

      const db = getDb();

      // Soft-delete: set removed_at = NOW()
      // Conditions: must belong to this user AND not already removed
      const [updated] = await db
        .update(addressBook)
        .set({ removedAt: new Date() })
        .where(
          and(
            eq(addressBook.id, entryId),
            eq(addressBook.privyUserId, privyUserId),
            isNull(addressBook.removedAt),
          ),
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({
          error: 'not_found',
          message: 'Address book entry not found or already removed',
        });
      }

      getLogger().info(
        { event: 'address_book_entry_removed', privyUserId, entryId },
        'address book entry soft-removed',
      );

      return reply.status(200).send({
        id: updated.id,
        address: updated.address,
        label: updated.label,
        addedAt: updated.addedAt.toISOString(),
        removedAt: updated.removedAt?.toISOString() ?? null,
      });
    },
  );
}
