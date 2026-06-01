/**
 * Duel trending worker.
 *
 * Runs every 60s (configurable). On each tick:
 *   1. Queries subgraph for active challenges (Proposed/Accepted) — paginated at 100/batch
 *   2. Computes pot = min(callerStake, challengerStake) * 2 for each challenge
 *   3. Checks backer count against parent call positions (see Known Limitation below)
 *   4. If pot >= 500_000_000 (500 USDC) OR backers >= 50: upserts trending_duels
 *      ON CONFLICT (challenge_id) DO UPDATE SET trending_until = now() + 4h
 *   5. Deletes expired pins (WHERE trending_until < now())
 *
 * Known Limitation — backer count (Known Plan Issue #4, per STATE.md):
 *   The Phase-2 subgraph `Call` entity does NOT expose `followTotalShares` or
 *   `fadeTotalShares` as direct scalar fields. They exist on the FollowFadeMarket
 *   contract as state variables indexed per callId, but are not yet projected into
 *   the subgraph schema. The trending worker therefore falls back to pot-only
 *   trending (backerCount stored as 0 in trending_duels until the subgraph schema
 *   is updated in Phase 7 to add these fields). The 50-backer threshold will be
 *   wired once the field is available.
 *   TODO(Phase-7): add followTotalShares/fadeTotalShares to Call entity in schema.graphql,
 *   then compute backerCount = followTotalShares + fadeTotalShares here.
 *
 * Thresholds (D-07):
 *   POT_THRESHOLD    = 500_000_000 (500 USDC in 6-decimal micro-units)
 *   BACKER_THRESHOLD = 50          (wired when subgraph exposes the field)
 *   PIN_DURATION_MS  = 4 * 60 * 60 * 1000 (4 hours)
 *
 * Error containment:
 *   tick() is wrapped in try/catch; any error increments errors counter and logs
 *   but does NOT throw. setInterval continues. (T-03-05-03)
 *
 * Log events:
 *   { event: 'duel_trending_worker_tick' }        — normal tick
 *   { event: 'duel_trending_worker_promoted' }    — duel earned trending pin
 *   { event: 'duel_trending_worker_expired' }     — expired pins removed
 *   { event: 'duel_trending_worker_error' }       — error in tick
 *
 * Requirements: SOCIAL-41, SOCIAL-48
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { lt } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { trendingDuels } from '../db/schema.js';
import type * as schema from '../db/schema.js';

// ── Thresholds ────────────────────────────────────────────────────────────────

/** 500 USDC in 6-decimal micro-units (6-decimal ERC-20 USDC) */
const POT_THRESHOLD = 500_000_000n;

/** Backer count threshold — placeholder until subgraph exposes followTotalShares */
const BACKER_THRESHOLD = 50;

/** 4-hour trending pin duration */
const PIN_DURATION_MS = 4 * 60 * 60 * 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

type DrizzleDb = NodePgDatabase<typeof schema>;

export interface DuelTrendingWorkerConfig {
  /** Subgraph URL for querying active duel pot + backer count */
  subgraphUrl: string;
  /** Drizzle ORM database client */
  db: DrizzleDb;
  /** Polling interval in milliseconds. Default: 60_000 (60s per D-07) */
  intervalMs?: number;
}

export interface DuelTrendingWorkerHandle {
  stop(): void;
  getStats(): {
    lastRun: number;
    duelsChecked: number;
    duelsPromoted: number;
    pinsExpired: number;
    errors: number;
  };
}

// ── Subgraph types ────────────────────────────────────────────────────────────

interface SubgraphChallenge {
  id: string;
  challengerStake: string;
  callerStake: string;
  status: string;
}

interface SubgraphChallengesResponse {
  data?: {
    challenges?: SubgraphChallenge[];
  };
  errors?: Array<{ message: string }>;
}

// ── Subgraph fetch (paginated at 100 per batch — T-02-07-03) ─────────────────

async function fetchActiveChallenges(subgraphUrl: string): Promise<SubgraphChallenge[]> {
  if (!subgraphUrl) return [];

  const all: SubgraphChallenge[] = [];
  let skip = 0;
  const first = 100;

  while (true) {
    const query = `
      query GetActiveChallengesForTrending($first: Int!, $skip: Int!) {
        challenges(
          where: { status_in: ["Proposed", "Accepted"] }
          first: $first
          skip: $skip
          orderBy: proposedAt
          orderDirection: desc
        ) {
          id
          challengerStake
          callerStake
          status
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { first, skip } }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as SubgraphChallengesResponse;

    if (json.errors && json.errors.length > 0) {
      throw new Error(`Subgraph error: ${json.errors.map((e) => e.message).join(', ')}`);
    }

    const challenges = json.data?.challenges ?? [];
    all.push(...challenges);

    if (challenges.length < first) break;
    skip += first;
  }

  return all;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Start the duel trending worker.
 *
 * @param config - worker configuration
 * @returns handle with stop() and getStats()
 */
export function startDuelTrendingWorker(config: DuelTrendingWorkerConfig): DuelTrendingWorkerHandle {
  const { subgraphUrl, db, intervalMs = 60_000 } = config;

  let lastRun = 0;
  let duelsChecked = 0;
  let duelsPromoted = 0;
  let pinsExpired = 0;
  let errors = 0;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;

    logger.info({ event: 'duel_trending_worker_tick' }, 'Duel trending worker tick');

    try {
      // 1. Query subgraph for active challenges
      const challenges = await fetchActiveChallenges(subgraphUrl);
      duelsChecked += challenges.length;

      let promoted = 0;

      for (const c of challenges) {
        // T-03-05-04: validate pot before threshold comparison; skip NaN/undefined
        let pot: bigint;
        try {
          const callerStake = BigInt(c.callerStake);
          const challengerStake = BigInt(c.challengerStake);
          const matched = callerStake < challengerStake ? callerStake : challengerStake;
          pot = matched * 2n;
        } catch {
          logger.warn(
            { event: 'duel_trending_worker_invalid_pot', challengeId: c.id },
            'Invalid stake values — skipping challenge',
          );
          continue;
        }

        // backerCount: 0 until subgraph exposes followTotalShares/fadeTotalShares
        // (see Known Limitation in module JSDoc)
        const backerCount = 0;

        const qualifies = pot >= POT_THRESHOLD || backerCount >= BACKER_THRESHOLD;
        if (!qualifies) continue;

        const newExpiry = new Date(Date.now() + PIN_DURATION_MS);
        const challengeIdNum = parseInt(c.id, 10);

        await db
          .insert(trendingDuels)
          .values({
            challengeId: challengeIdNum,
            trendingUntil: newExpiry,
            potUsdc: pot.toString(),
            backerCount,
          })
          .onConflictDoUpdate({
            target: [trendingDuels.challengeId],
            set: {
              trendingUntil: newExpiry,
              potUsdc: pot.toString(),
              backerCount,
              updatedAt: new Date(),
            },
          });

        promoted++;
        logger.info(
          { event: 'duel_trending_worker_promoted', challengeId: c.id, pot: pot.toString(), backerCount },
          'Duel promoted to trending',
        );
      }

      duelsPromoted += promoted;

      // 2. Delete expired pins (trending_until < now())
      const expiredResult = await db
        .delete(trendingDuels)
        .where(lt(trendingDuels.trendingUntil, new Date()));

      // Drizzle returns rowCount in the result; guard undefined
      const expiredCount = (expiredResult as unknown as { rowCount?: number })?.rowCount ?? 0;
      if (expiredCount > 0) {
        pinsExpired += expiredCount;
        logger.info(
          { event: 'duel_trending_worker_expired', count: expiredCount },
          'Expired trending pins removed',
        );
      }

      lastRun = Date.now();

      logger.info(
        {
          event: 'duel_trending_worker_tick',
          duelsChecked: challenges.length,
          duelsPromoted: promoted,
          pinsExpired: expiredCount,
        },
        'Duel trending worker tick complete',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'duel_trending_worker_error', error: message }, 'Duel trending worker tick failed');
      errors++;
      // Do NOT throw — setInterval must keep running (T-03-05-03)
    }
  }

  const intervalId = setInterval(() => {
    tick().catch((err) => {
      // tick() catches all errors internally; this is a final safety net
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'duel_trending_worker_error', error: message, phase: 'interval-catch' }, 'Uncaught error in duel trending worker');
      errors++;
    });
  }, intervalMs);

  return {
    stop(): void {
      stopped = true;
      clearInterval(intervalId);
    },

    getStats(): {
      lastRun: number;
      duelsChecked: number;
      duelsPromoted: number;
      pinsExpired: number;
      errors: number;
    } {
      return { lastRun, duelsChecked, duelsPromoted, pinsExpired, errors };
    },
  };
}
