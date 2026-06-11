/**
 * GET /api/calls/:id/positions — FINAL POSITIONS for a call (quick-260611-5mh A5).
 *
 * The web already calls this route (apps/web/app/call/[id]/page.tsx
 * fetchFinalPositions, ~line 335) and previously got a 404. The consumer
 * contract there is EXACT and drives this response shape:
 *   - the body is a BARE JSON ARRAY (`await res.json() as unknown[]` → .map)
 *   - each item: { handle: string, side: 'follow'|'fade', pnl?: string,
 *     stake: string } — the web BigInt()s pnl/stake and defaults absent
 *     values to '0'.
 *
 * Data source: subgraph Position entities (callId/user/side/usdcDeposited/
 * sharesHeld/entryTime/exitedAt) via queryCallPositions.
 *
 * Design decisions:
 *   - handle = truncated user address (AUTH-44 display alias). Resolving full
 *     profile handles per position would fan out N profile reads on a public
 *     hot path; the truncated alias is the same fallback the profile route's
 *     own priority chain bottoms out at.
 *   - pnl is OMITTED (not zeroed) — settlement P&L per position is not
 *     derivable from Position entities alone, and D-07 mandates degrade-to-
 *     hidden over fake zeros. The web's `?? '0'` default handles the absence.
 *   - NEVER 404s/500s: invalid id → 400; subgraph failure → 200 [] so the
 *     FINAL POSITIONS block degrades to empty instead of erroring.
 *   - Extra additive keys (user/entryTime/exitedAt/sharesHeld) are included
 *     for future consumers; the web ignores unknown keys.
 *
 * Security: public read (no auth gate — spec §18.1); Studio key stays
 * server-side via subgraph-client executeQuery (D-27).
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getLogger } from '../lib/logger.js';
import { queryCallPositions } from '../lib/subgraph-client.js';

// ── Response item (matches the web's FinalPosition mapping) ──────────────────

interface CallPositionItem {
  /** Display handle — truncated address alias, NEVER the raw full address as a "handle" (AUTH-44). */
  handle: string;
  side: 'follow' | 'fade';
  /** Position size in USDC micro-units (subgraph usdcDeposited). */
  stake: string;
  // ── additive extras (web ignores unknown keys) ──
  user: string;
  sharesHeld: string;
  entryTime: string;
  exitedAt: string | null;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function callPositionsRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/calls/:id/positions',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();

      let callId: bigint;
      try {
        callId = BigInt(request.params.id);
      } catch {
        return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
      }

      try {
        const positions = await queryCallPositions(callId.toString());

        const body: CallPositionItem[] = positions.map((p) => ({
          handle: truncateAddress(p.user),
          side: p.side === 'fade' ? 'fade' : 'follow',
          stake: p.usdcDeposited,
          user: p.user,
          sharesHeld: p.sharesHeld,
          entryTime: p.entryTime,
          exitedAt: p.exitedAt ?? null,
        }));

        // Largest positions first (the web renders top-down; without per-
        // position P&L, stake is the natural ordering).
        body.sort((a, b) => {
          try {
            const diff = BigInt(b.stake) - BigInt(a.stake);
            return diff > 0n ? 1 : diff < 0n ? -1 : 0;
          } catch {
            return 0;
          }
        });

        logger.info(
          { event: 'call_positions_fetched', callId: callId.toString(), count: body.length },
          'Call positions fetched',
        );

        return reply.send(body);
      } catch (err) {
        // GRACEFUL DEGRADATION: a subgraph outage must not break the call page —
        // return an empty list (200) so FINAL POSITIONS renders empty (D-07).
        logger.warn(
          { event: 'call_positions_fetch_failed', error: String(err), callId: callId.toString() },
          'Subgraph positions read failed — degrading to empty list',
        );
        return reply.send([]);
      }
    },
  );
}
