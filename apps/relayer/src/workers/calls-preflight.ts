/**
 * calls-preflight worker — post-CallCreated criteria store wiring (Gap B.3 Task 2).
 *
 * Purpose: After the frontend submits a call on-chain and receives the CallCreated
 * event with the on-chain callId, the frontend calls this module's handler to insert
 * a row into call_oracle_criteria for DefiLlama / RpcMetrics / CexScraper calls.
 *
 * Governance calls (Snapshot=4, Tally=5) and NFT-TWAP (1) do NOT use this store:
 *   - Governance: proposalId is stored as uint256 in the call's assetA field on-chain.
 *   - NFT-TWAP:   assetA = uint256(nftContractAddress).
 *   - Pyth (0):   feedId is in assetA; no string lookup needed.
 *
 * FAIL-SAFE: if insertCriteria throws (DB unavailable), we log the error and do
 * NOT fail call creation. The criteria row is supplementary — the adapter's null
 * resolveCriteria return triggers { ambiguous: true } at settlement, so the dispute
 * window handles it without mis-settlement (T-05.1-04-02).
 *
 * Writer:  Called by apps/relayer/src/routes/calls-criteria.ts (POST /api/calls/criteria)
 *          after the frontend confirms a CallCreated event receipt.
 * Reader:  apps/relayer/src/workers/oracle-adapters/{defillama,rpc-metrics,cex}-adapter.ts
 *          via resolveCriteria(callId) at settlement time.
 *
 * Requirements: SETTLE-18, SETTLE-19, SETTLE-20, SETTLE-21, SETTLE-22, SETTLE-23, SETTLE-24
 * Gap: B.3
 */

import { getLogger } from '../lib/logger.js';
import { insertCriteria } from '../db/criteria-store.js';
import { OracleType } from './oracle-adapters/oracle-attestation.js';

// ── Guard: which oracle types use the criteria store ──────────────────────────

/**
 * Oracle types that require a call_oracle_criteria row.
 *
 * DefiLlama(2), RpcMetrics(3), CexScraper(6): need protocolSlug / tokenSymbol.
 *
 * Excluded:
 *   Pyth(0)      — assetA = bytes32 feedId (no string lookup)
 *   NftTwap(1)   — assetA = uint256(nftContractAddress)
 *   Snapshot(4)  — assetA = keccak256 proposalId hash as uint256
 *   Tally(5)     — assetA = on-chain numeric proposalId as uint256
 */
const CRITERIA_STORE_ORACLE_TYPES: readonly OracleType[] = [
  OracleType.DefiLlama,  // 2
  OracleType.RpcMetrics, // 3
  OracleType.CexScraper, // 6
] as const;

// ── Parameters ────────────────────────────────────────────────────────────────

export interface CallCreatedParams {
  /** On-chain callId assigned by CallRegistry on CallCreated event */
  callId: number;
  /** OracleType enum value (matches ISettlementManager.OracleAdapter) */
  oracleType: OracleType;
  /**
   * String identifier the adapter needs at settlement time:
   *   DefiLlama / RpcMetrics: protocolSlug (e.g. 'uniswap', 'aave')
   *   CexScraper: tokenSymbol (e.g. 'BTC', 'ETH')
   */
  identifier: string;
  /**
   * Optional unit description for targetValue comparison.
   *   DefiLlama: 'tvl' | 'volume_24h' | 'fees_7d' etc.
   *   RpcMetrics: 'liquidation' | 'active_addresses' | 'gas'
   *   CexScraper: null (binary confirmed/not; no unit needed)
   */
  targetUnit?: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * Handle a confirmed CallCreated event by inserting oracle criteria.
 *
 * Called by the POST /api/calls/criteria endpoint after the frontend
 * confirms an on-chain CallCreated event receipt.
 *
 * Idempotent: ON CONFLICT DO NOTHING makes duplicate calls safe (worker restart,
 * RPC retry, re-processed events — mirrors the WR-05 notifications pattern).
 *
 * Non-fatal: if insertCriteria throws, we log the error and return gracefully.
 * A missing row triggers { ambiguous: true } at settlement — the dispute window
 * handles it without mis-settlement (T-05.1-04-02).
 *
 * @param params - callId, oracleType, identifier, targetUnit
 */
export async function handleCallCreated(params: CallCreatedParams): Promise<void> {
  const logger = getLogger();
  const { callId, oracleType, identifier, targetUnit } = params;

  const requiresCriteriaStore = (CRITERIA_STORE_ORACLE_TYPES as readonly number[]).includes(oracleType);

  if (!requiresCriteriaStore) {
    logger.debug(
      {
        event: 'calls_preflight_criteria_skip',
        callId,
        oracleType,
      },
      'calls-preflight: oracleType does not use criteria store — skipping insert',
    );
    return;
  }

  if (callId === undefined || callId === null) {
    logger.warn(
      { event: 'calls_preflight_criteria_no_call_id', oracleType },
      'calls-preflight: callId is undefined — skipping criteria insert',
    );
    return;
  }

  try {
    await insertCriteria(callId, oracleType, identifier, targetUnit);

    logger.info(
      {
        event: 'calls_preflight_criteria_inserted',
        callId,
        oracleType,
        identifier,
        targetUnit: targetUnit ?? null,
      },
      'calls-preflight: criteria row inserted for call',
    );
  } catch (err) {
    // Non-fatal: log the error; do NOT fail call creation.
    // The criteria row is supplementary — adapter will DEFER at settlement if missing.
    logger.error(
      {
        err,
        event: 'calls_preflight_criteria_insert_failed',
        callId,
        oracleType,
        identifier,
      },
      'criteria_store_insert_failed — settlement will DEFER if not resolved via backfill',
    );
  }
}
