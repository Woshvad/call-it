/**
 * Criteria store — read/write helpers for the call_oracle_criteria table.
 *
 * Gap B.3 fix: the on-chain Call struct does not carry string identifiers
 * (protocolSlug, tokenSymbol). This module bridges the gap between call
 * creation time (when the identifier is known) and settlement time (when
 * the adapter needs to look it up).
 *
 * FAIL-SAFE CONTRACT: resolveCriteria returns null when no row is found.
 * Every caller MUST treat null as "ambiguous" and return { ambiguous: true }
 * rather than proceeding to settlement. This is an absolute safety invariant:
 * a missing row must NEVER cause mis-settlement (T-05.1-04-02).
 *
 * Caller scope:
 *   Writer: apps/relayer/src/workers/calls-preflight.ts (after CallCreated)
 *   Reader: oracle adapters — defillama, rpc-metrics, cex at settlement time
 *
 * Requirements: SETTLE-18, SETTLE-19, SETTLE-20, SETTLE-21, SETTLE-22, SETTLE-23, SETTLE-24
 * Spec: CALL_IT_SPEC1.md §13.3, §13.5, §13.6
 */

import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { callOracleCriteria } from './schema.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CriteriaRow {
  /** The string identifier needed by the oracle adapter (protocolSlug or tokenSymbol) */
  identifier: string;
  /** Optional unit for targetValue comparison (e.g. 'tvl', 'volume_24h'). null for CEX. */
  targetUnit: string | null;
}

// ── resolveCriteria ────────────────────────────────────────────────────────────

/**
 * Look up oracle criteria for a call.
 *
 * Returns { identifier, targetUnit } when a row exists, or null when not found.
 *
 * CALLER CONTRACT: null means "criteria not in store". The adapter MUST return
 * { ambiguous: true } — never proceed to settlement with a null result. This is
 * the fail-safe that prevents mis-settlement when the criteria store is unavailable
 * or the backfill has not run yet (T-05.1-04-02).
 *
 * @param callId - on-chain call ID (integer)
 * @returns CriteriaRow if found; null if not found
 */
export async function resolveCriteria(callId: number): Promise<CriteriaRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(callOracleCriteria)
    .where(eq(callOracleCriteria.callId, callId))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return null;
  }

  return {
    identifier: rows[0].identifier,
    targetUnit: rows[0].targetUnit,
  };
}

// ── insertCriteria ─────────────────────────────────────────────────────────────

/**
 * Insert oracle criteria for a call.
 *
 * Uses ON CONFLICT DO NOTHING so re-processing a CallCreated event (capped-range
 * overlap, worker restart, RPC retry) is idempotent — the second insert is a no-op.
 *
 * Governance calls (Snapshot=4, Tally=5) and NFT-TWAP (1) must NOT call this
 * function — they encode their identifier in the call's assetA field on-chain.
 * Pyth (0) also does not use this table.
 *
 * Should only be called for: DefiLlama (2), RpcMetrics (3), CexScraper (6).
 *
 * @param callId - on-chain call ID (integer)
 * @param oracleType - OracleType enum value (2, 3, or 6)
 * @param identifier - protocolSlug (DefiLlama/RpcMetrics) or tokenSymbol (CEX)
 * @param targetUnit - optional metric unit (e.g. 'tvl', 'volume_24h'); null for CEX
 */
export async function insertCriteria(
  callId: number,
  oracleType: number,
  identifier: string,
  targetUnit?: string,
): Promise<void> {
  const db = getDb();
  await db
    .insert(callOracleCriteria)
    .values({
      callId,
      oracleType,
      identifier,
      targetUnit: targetUnit ?? null,
    })
    .onConflictDoNothing();
}
