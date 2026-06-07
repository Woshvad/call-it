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
import { callOracleCriteria, callStatement } from './schema.js';

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

// ── call_statement store (Phase 07 — D-05 authoritative market statement) ────────

/**
 * Maximum stored statement length (V5, T-07-02-01).
 *
 * The statement is caller-supplied untrusted prose. We hard-cap it before storage
 * so a hostile caller cannot bloat the table or the OG/receipt render. The OG card
 * truncates much shorter at render time (~77/87 chars); this ceiling is the storage
 * backstop, set generously above the render truncation so a full prose line survives
 * intact while pathological input is rejected/clipped.
 */
export const STATEMENT_MAX_LEN = 280;

/**
 * Insert the authoritative human-readable market statement for a call (D-05).
 *
 * Idempotent via ON CONFLICT DO NOTHING so re-processing a CallCreated event
 * (worker restart, RPC retry, re-submitted enrichment) is a no-op on the second
 * write — the first authoritative statement wins.
 *
 * Caller contract: the statement is untrusted prose. It is length-capped here
 * (STATEMENT_MAX_LEN) before storage (V5) — callers do NOT need to pre-truncate,
 * but an empty/whitespace-only statement is skipped (no row written) so a null
 * resolve cleanly falls through to the subgraph templated mirror (D-03).
 *
 * @param callId - on-chain call ID (integer)
 * @param statement - human-readable market statement (untrusted; capped on persist)
 */
export async function insertCallStatement(callId: number, statement: string): Promise<void> {
  const trimmed = statement.trim();
  if (trimmed.length === 0) {
    // Nothing meaningful to store — leave the row absent so resolve returns null
    // and the OG/receipt falls back to the subgraph templated mirror (D-03).
    return;
  }

  const capped = trimmed.length > STATEMENT_MAX_LEN ? trimmed.slice(0, STATEMENT_MAX_LEN) : trimmed;

  const db = getDb();
  await db
    .insert(callStatement)
    .values({
      callId,
      statement: capped,
    })
    .onConflictDoNothing();
}

/**
 * Resolve the authoritative market statement for a call (D-05).
 *
 * Returns the stored prose when a row exists, or null when absent.
 *
 * CALLER CONTRACT: null means "no authoritative statement stored yet". The caller
 * (live-state marketLine) MUST leave marketLine undefined on null so the client/OG
 * falls back to the subgraph templated mirror (D-03) — never crash, never invent prose.
 *
 * @param callId - on-chain call ID (integer)
 * @returns the statement string if found; null if absent
 */
export async function resolveCallStatement(callId: number): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(callStatement)
    .where(eq(callStatement.callId, callId))
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return null;
  }

  return rows[0].statement;
}
