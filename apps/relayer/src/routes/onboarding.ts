/**
 * Onboarding routes — persists 4-screen onboarding state to Fly Postgres (Plan 06).
 *
 * Routes:
 *   GET  /api/onboarding/state        — reads (or lazily creates) the user's onboarding row
 *   POST /api/onboarding/advance      — advances the onboarding step (transactional, idempotent)
 *
 * Both routes are gated by `privySessionPreHandler` (T-01-33) which attaches
 * `request.privyUserId` after verifying the Privy session JWT.
 *
 * Step ordering (canonical):
 *   1 = Handle
 *   2 = Connect Socials
 *   3 = Follow-graph opt-in
 *   4 = Fund (wallet funding step)
 *   5 = Tagline (completion gate — taglineCommittedAt IS NOT NULL)
 *
 * Pitfall B (D-32): concurrent POSTs use `ON CONFLICT DO UPDATE` + transaction
 * so that parallel advances for the same user never produce a split-brain row.
 *
 * Security: T-01-33, T-01-34, T-01-35
 * Requirements: AUTH-19, AUTH-20, AUTH-21
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { onboardingState } from '../db/schema.js';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';

// ─── Step ordering constants ──────────────────────────────────────────────────

export const STEP_SLUGS = ['handle', 'socials', 'followgraph', 'fund', 'tagline'] as const;
export type StepSlug = (typeof STEP_SLUGS)[number];

/**
 * Canonical step number for each slug.
 * Used by the middleware to map currentStep → slug for redirect.
 */
export const STEP_NUMBER: Record<StepSlug, number> = {
  handle: 1,
  socials: 2,
  followgraph: 3,
  fund: 4,
  tagline: 5,
};


// ─── Zod schemas ─────────────────────────────────────────────────────────────

const OnboardingAdvanceBody = z.object({
  step: z.enum(STEP_SLUGS),
  timestamp: z.string().datetime().optional(),
});

type OnboardingAdvanceInput = z.infer<typeof OnboardingAdvanceBody>;

// ─── Row helpers ─────────────────────────────────────────────────────────────

type OnboardingRow = typeof onboardingState.$inferSelect;

function rowToResponse(row: OnboardingRow) {
  return {
    currentStep: row.currentStep,
    handleSetAt: row.handleSetAt ? row.handleSetAt.getTime() : null,
    socialsStepCompletedAt: row.socialsStepCompletedAt
      ? row.socialsStepCompletedAt.getTime()
      : null,
    followgraphOptinAt: row.followgraphOptinAt ? row.followgraphOptinAt.getTime() : null,
    taglineCommittedAt: row.taglineCommittedAt ? row.taglineCommittedAt.getTime() : null,
  };
}

/**
 * Validates step ordering.
 *
 * Returns null if the step is allowed to proceed, or the expected step slug
 * if this is an out-of-order request.
 *
 * Relaxations (per plan spec):
 * - 'followgraph' is always allowed once handle is set (can skip socials)
 * - 'fund' is always allowed once handle is set
 * - 'tagline' is always allowed once handle is set
 * - Setting the same step twice is idempotent (allowed)
 */
function checkStepOrder(row: OnboardingRow, step: StepSlug): StepSlug | null {
  // Cannot do ANYTHING before handle
  if (!row.handleSetAt && step !== 'handle') {
    return 'handle';
  }

  // Socials requires handle
  if (step === 'socials' && !row.handleSetAt) {
    return 'handle';
  }

  // All other steps (followgraph, fund, tagline) are allowed once handle is set
  // This supports the "skip socials" flow per AUTH-08
  return null; // order OK
}

// ─── Route plugin ─────────────────────────────────────────────────────────────

export async function onboardingRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── GET /api/onboarding/state ──────────────────────────────────────────────

  app.get(
    '/api/onboarding/state',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;
      const db = getDb();

      // Try to read existing row
      let rows = await db
        .select()
        .from(onboardingState)
        .where(eq(onboardingState.privyUserId, privyUserId))
        .limit(1);

      // Lazy-init: if no row exists, create a fresh one
      if (rows.length === 0) {
        await db
          .insert(onboardingState)
          .values({ privyUserId, currentStep: 1 })
          .onConflictDoNothing();

        // Re-read after insert (onConflictDoNothing means another writer may have won)
        rows = await db
          .select()
          .from(onboardingState)
          .where(eq(onboardingState.privyUserId, privyUserId))
          .limit(1);
      }

      const row = rows[0];
      if (!row) {
        // Should not happen but guard for type safety
        return reply.status(500).send({ error: 'internal', code: 'row_missing' });
      }

      getLogger().info(
        { event: 'onboarding_state_read', privyUserId, currentStep: row.currentStep },
        'onboarding state read',
      );

      return reply.status(200).send(rowToResponse(row));
    },
  );

  // ── POST /api/onboarding/advance ──────────────────────────────────────────

  app.post<{ Body: OnboardingAdvanceInput }>(
    '/api/onboarding/advance',
    {
      preHandler: privySessionPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['step'],
          properties: {
            step: { type: 'string', enum: [...STEP_SLUGS] },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      // Validate body with Zod for rich error messages
      const parseResult = OnboardingAdvanceBody.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'bad_request',
          code: 'invalid_body',
          details: parseResult.error.flatten(),
        });
      }

      const { step, timestamp } = parseResult.data;
      const privyUserId = request.privyUserId!;
      const db = getDb();

      const ts = timestamp ? new Date(timestamp) : new Date();

      // Use a transaction to prevent Pitfall B (state row drift under concurrent writes)
      const result = await db.transaction(async (tx) => {
        // Ensure row exists (upsert pattern — onConflict idempotent)
        await tx
          .insert(onboardingState)
          .values({ privyUserId, currentStep: 1 })
          .onConflictDoNothing();

        const rows = await tx
          .select()
          .from(onboardingState)
          .where(eq(onboardingState.privyUserId, privyUserId))
          .limit(1);

        const row = rows[0];
        if (!row) {
          return { ok: false, status: 500, body: { error: 'internal', code: 'row_missing' } } as const;
        }

        // Step ordering validation
        const orderError = checkStepOrder(row, step);
        if (orderError !== null) {
          getLogger().warn(
            { event: 'onboarding_advance_out_of_order', privyUserId, step, expected: orderError, currentStep: row.currentStep },
            'out-of-order onboarding advance rejected',
          );
          return {
            ok: false,
            status: 422,
            body: { error: 'out-of-order', expected_step: orderError },
          } as const;
        }

        // Build the update payload
        const updatePayload: Partial<OnboardingRow> = {};

        if (step === 'handle' && !row.handleSetAt) {
          updatePayload.handleSetAt = ts;
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.socials);
        } else if (step === 'handle') {
          // Idempotent — already set, but still bump step if needed
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.socials);
        } else if (step === 'socials' && !row.socialsStepCompletedAt) {
          updatePayload.socialsStepCompletedAt = ts;
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.followgraph);
        } else if (step === 'socials') {
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.followgraph);
        } else if (step === 'followgraph' && !row.followgraphOptinAt) {
          updatePayload.followgraphOptinAt = ts;
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.fund);
        } else if (step === 'followgraph') {
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.fund);
        } else if (step === 'fund') {
          // Fund step does not have its own timestamp column (no DB field for it)
          // Just advance the step to tagline
          updatePayload.currentStep = Math.max(row.currentStep, STEP_NUMBER.tagline);
        } else if (step === 'tagline' && !row.taglineCommittedAt) {
          updatePayload.taglineCommittedAt = ts;
          updatePayload.currentStep = STEP_NUMBER.tagline; // stay at final step
        } else if (step === 'tagline') {
          // Already committed — idempotent
          updatePayload.currentStep = STEP_NUMBER.tagline;
        }

        // Apply update
        if (Object.keys(updatePayload).length > 0) {
          await tx
            .update(onboardingState)
            .set(updatePayload)
            .where(eq(onboardingState.privyUserId, privyUserId));
        }

        // Re-read to get final state
        const updatedRows = await tx
          .select()
          .from(onboardingState)
          .where(eq(onboardingState.privyUserId, privyUserId))
          .limit(1);

        const updatedRow = updatedRows[0];
        if (!updatedRow) {
          return { ok: false, status: 500, body: { error: 'internal', code: 'row_missing_after_update' } } as const;
        }

        getLogger().info(
          { event: 'onboarding_advance_success', privyUserId, step, currentStep: updatedRow.currentStep },
          'onboarding step advanced',
        );

        return { ok: true, body: rowToResponse(updatedRow) } as const;
      });

      if (!result.ok) {
        return reply.status(result.status).send(result.body);
      }

      return reply.status(200).send(result.body);
    },
  );
}
