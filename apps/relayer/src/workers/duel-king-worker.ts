/**
 * Duel King worker.
 *
 * Runs weekly (default: 7 * 24 * 3600 * 1000 ms). On each tick:
 *   1. Queries subgraph for settled challenges in trailing 7 days with winner
 *   2. Groups wins by winner address; computes streak (consecutive wins within window)
 *   3. Finds winner with max streak; tie-break: most recent win, then highest pot
 *   4. Upserts INTO duel_kings ON CONFLICT (week_anchor) DO UPDATE
 *
 * Placeholder behavior until Phase 4 settlement (D-08):
 *   ChallengeEscrow is not yet deployed (placeholder zero address — STATE.md
 *   "Deferred Live Infra Phase 3"). The subgraph therefore has zero settled
 *   challenges to query. When the query returns empty results the worker skips
 *   the upsert and logs a no-op tick — correct Phase 3 behavior; the machinery
 *   is ready for Phase 4 settlement data.
 *
 * Week anchor: Monday 00:00:00 UTC of the current week.
 *   Used as the unique key per duel_kings row (one Duel King per week).
 *
 * Error containment:
 *   tick() is wrapped in try/catch; any error increments errors counter and logs
 *   but does NOT throw. setInterval continues.
 *
 * Log events:
 *   { event: 'duel_king_worker_tick' }          — normal tick (with king or no-op)
 *   { event: 'duel_king_worker_no_settled' }    — no settled challenges this week (Phase 3)
 *   { event: 'duel_king_worker_elected' }       — Duel King upserted
 *   { event: 'duel_king_worker_error' }         — error in tick
 *
 * Requirements: SOCIAL-48
 */

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { logger } from '../lib/logger.js';
import { duelKings } from '../db/schema.js';
import type * as schema from '../db/schema.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type DrizzleDb = NodePgDatabase<typeof schema>;

export interface DuelKingWorkerConfig {
  /** Subgraph URL for querying settled challenges */
  subgraphUrl: string;
  /** Drizzle ORM database client */
  db: DrizzleDb;
  /** Polling interval in milliseconds. Default: 7 * 24 * 3600 * 1000 (weekly) */
  intervalMs?: number;
}

export interface DuelKingWorkerHandle {
  stop(): void;
  getStats(): {
    lastRun: number;
    weeksComputed: number;
    errors: number;
  };
}

// ── Subgraph types ────────────────────────────────────────────────────────────

interface SubgraphSettledChallenge {
  id: string;
  winner: string;
  settledAt: string;
  challengerStake: string;
  callerStake: string;
}

interface SubgraphSettledResponse {
  data?: {
    challenges?: SubgraphSettledChallenge[];
  };
  errors?: Array<{ message: string }>;
}

// ── Week anchor: Monday 00:00 UTC of the current week ────────────────────────

function getWeekAnchor(): Date {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sunday, 1=Monday, ...
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysToMonday);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// ── Subgraph fetch: settled challenges in trailing 7 days ─────────────────────

async function fetchSettledChallenges(
  subgraphUrl: string,
): Promise<SubgraphSettledChallenge[]> {
  if (!subgraphUrl) return [];

  const sevenDaysAgoSec = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000).toString();
  const all: SubgraphSettledChallenge[] = [];
  let skip = 0;
  const first = 100;

  while (true) {
    const query = `
      query GetSettledChallenges($since: String!, $first: Int!, $skip: Int!) {
        challenges(
          where: { status: "Settled", settledAt_gt: $since }
          first: $first
          skip: $skip
          orderBy: settledAt
          orderDirection: desc
        ) {
          id
          winner
          settledAt
          challengerStake
          callerStake
        }
      }
    `;

    const response = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { since: sevenDaysAgoSec, first, skip },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph HTTP error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as SubgraphSettledResponse;

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

// ── Compute pot from challenge ────────────────────────────────────────────────

function computePot(callerStake: string, challengerStake: string): bigint {
  try {
    const a = BigInt(callerStake);
    const b = BigInt(challengerStake);
    const matched = a < b ? a : b;
    return matched * 2n;
  } catch {
    return 0n;
  }
}

// ── Find Duel King from settled challenges ────────────────────────────────────

interface WinRecord {
  settledAt: number;
  pot: bigint;
}

interface KingCandidate {
  winnerAddress: string;
  winStreak: number;
  highestPotUsdc: bigint;
  lastWinAt: Date;
}

function electDuelKing(settled: SubgraphSettledChallenge[]): KingCandidate | null {
  if (settled.length === 0) return null;

  // Group wins by winner address (lowercase for consistency)
  const winsByAddress = new Map<string, WinRecord[]>();

  for (const c of settled) {
    if (!c.winner || c.winner === '0x0000000000000000000000000000000000000000') continue;

    const winner = c.winner.toLowerCase();
    const existing = winsByAddress.get(winner) ?? [];
    existing.push({
      settledAt: parseInt(c.settledAt, 10) || 0,
      pot: computePot(c.callerStake, c.challengerStake),
    });
    winsByAddress.set(winner, existing);
  }

  if (winsByAddress.size === 0) return null;

  const candidates: KingCandidate[] = [];

  for (const [winnerAddress, wins] of winsByAddress.entries()) {
    // Sort by settledAt desc
    wins.sort((a, b) => b.settledAt - a.settledAt);

    // Within a 7-day window all wins are consecutive (no gap > 7d possible)
    // Streak = total count of wins in the window
    const winStreak = wins.length;

    // Highest pot in this week for tie-break
    const highestPotUsdc = wins.reduce((max, w) => (w.pot > max ? w.pot : max), 0n);

    // Most recent win for tie-break
    const lastWinSec = wins[0]?.settledAt ?? 0;
    const lastWinAt = new Date(lastWinSec * 1000);

    candidates.push({ winnerAddress, winStreak, highestPotUsdc, lastWinAt });
  }

  if (candidates.length === 0) return null;

  // Sort: winStreak desc → lastWinAt desc → highestPotUsdc desc
  candidates.sort((a, b) => {
    if (b.winStreak !== a.winStreak) return b.winStreak - a.winStreak;
    if (b.lastWinAt.getTime() !== a.lastWinAt.getTime()) {
      return b.lastWinAt.getTime() - a.lastWinAt.getTime();
    }
    const potDiff = b.highestPotUsdc - a.highestPotUsdc;
    if (potDiff > 0n) return 1;
    if (potDiff < 0n) return -1;
    return 0;
  });

  return candidates[0] ?? null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Start the Duel King worker.
 *
 * @param config - worker configuration
 * @returns handle with stop() and getStats()
 */
export function startDuelKingWorker(config: DuelKingWorkerConfig): DuelKingWorkerHandle {
  const { subgraphUrl, db, intervalMs = 7 * 24 * 3600 * 1000 } = config;

  let lastRun = 0;
  let weeksComputed = 0;
  let errors = 0;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;

    logger.info({ event: 'duel_king_worker_tick' }, 'Duel King worker tick');

    try {
      // Query subgraph for settled challenges in last 7 days
      const settled = await fetchSettledChallenges(subgraphUrl);

      if (settled.length === 0) {
        // Phase 3 placeholder behavior: no settled duels yet (D-08)
        logger.info(
          { event: 'duel_king_worker_no_settled' },
          'No settled challenges in trailing 7 days — Duel King unchanged (Phase 3 pre-settlement placeholder)',
        );
        lastRun = Date.now();
        return;
      }

      // Elect Duel King
      const king = electDuelKing(settled);

      if (!king) {
        logger.info({ event: 'duel_king_worker_no_settled' }, 'Could not elect Duel King — no valid winners');
        lastRun = Date.now();
        return;
      }

      const weekAnchor = getWeekAnchor();

      await db
        .insert(duelKings)
        .values({
          winnerAddress: king.winnerAddress,
          winStreak: king.winStreak,
          highestPotUsdc: king.highestPotUsdc.toString(),
          lastWinAt: king.lastWinAt,
          weekAnchor,
        })
        .onConflictDoUpdate({
          target: [duelKings.weekAnchor],
          set: {
            winnerAddress: king.winnerAddress,
            winStreak: king.winStreak,
            highestPotUsdc: king.highestPotUsdc.toString(),
            lastWinAt: king.lastWinAt,
          },
        });

      weeksComputed++;
      lastRun = Date.now();

      logger.info(
        {
          event: 'duel_king_worker_elected',
          winnerAddress: king.winnerAddress,
          winStreak: king.winStreak,
          highestPotUsdc: king.highestPotUsdc.toString(),
          weekAnchor: weekAnchor.toISOString(),
        },
        'Duel King elected and upserted',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'duel_king_worker_error', error: message }, 'Duel King worker tick failed');
      errors++;
      // Do NOT throw — setInterval must keep running
    }
  }

  const intervalId = setInterval(() => {
    tick().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'duel_king_worker_error', error: message, phase: 'interval-catch' }, 'Uncaught error in Duel King worker');
      errors++;
    });
  }, intervalMs);

  return {
    stop(): void {
      stopped = true;
      clearInterval(intervalId);
    },

    getStats(): { lastRun: number; weeksComputed: number; errors: number } {
      return { lastRun, weeksComputed, errors };
    },
  };
}
