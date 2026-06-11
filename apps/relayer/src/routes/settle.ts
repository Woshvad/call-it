/**
 * GET /api/settle/:callId — Settlement provenance route (D-10, SETTLE-52)
 *
 * Returns provenance data for a settled call: oracle source, settlement tx hash,
 * path-aware raw oracle data (Pyth=price+confidence+publishTime, attestation paths=payload,
 * CEX=announcement), and the EIP-712 relayer signature.
 *
 * CRITICAL: oracle.type MUST be an explicit field in the response (not derivable only from
 * oracle.url). The ProvenanceModal branches on this field to render oracle-type-specific
 * raw data (SETTLE-52 / D-10).
 *
 * Data flow:
 *   1. Check Redis cache key `settle_provenance:{callId}` (60s TTL — settled data is immutable)
 *   2. On cache miss: query subgraph for Settlement entity → extract provenance fields
 *   3. Build path-aware rawOracleData based on oracle.type
 *   4. Cache result and return
 *
 * Log events:
 *   { event: 'settle_provenance_cache_hit' }   — served from Redis
 *   { event: 'settle_provenance_cache_miss' }  — fetched from subgraph
 *   { event: 'settle_provenance_error' }       — fetch failure
 *
 * Security:
 *   - No auth gate (public read — spec §18.1)
 *
 * Requirements: SETTLE-52, D-10, SHARE-12
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getCached, setCached } from '../lib/cache.js';
import { getLogger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** All 7 oracle adapter types supported by the SettlementManager. */
type OracleType =
  | 'pyth'
  | 'nft-twap'
  | 'defillama'
  | 'rpc-metrics'
  | 'snapshot'
  | 'tally'
  | 'cex';

/**
 * Path-aware raw oracle data — shape depends on oracle.type.
 * Pyth: price + confidence + publishTime
 * nft-twap / defillama / rpc-metrics / snapshot / tally: signed attestation payload
 * cex: announcement title + URL + scraped timestamp
 */
type RawOracleData =
  | { pythPrice: string; pythConf: string; pythPublishTime: string }        // type: 'pyth'
  | { attestationPayload: string; evidenceHash?: string; observationCount?: number } // nft-twap
  | { attestationPayload: string }                                           // defillama / rpc-metrics / snapshot / tally
  | { announcementTitle: string; announcementUrl: string; scrapedAt: string } // cex
  | null;

interface ProvenanceResponse {
  callId: string;
  oracle: {
    type: OracleType;
    url: string;
    host: string;
    feedId?: string;
  };
  txHash: string;
  settledAt: number | null;
  rawOracleData: RawOracleData;
  /** EIP-712 relayer signature bound to chainId 42161 (Pitfall 7) */
  relayerSignature: string;
  chainId: 42161;
}

// ── Cache config ──────────────────────────────────────────────────────────────

/** 60s TTL — settled data is immutable once settled */
const CACHE_TTL_SECONDS = 60;

function cacheKey(callId: bigint): string {
  return `settle_provenance:${callId.toString()}`;
}

// ── Subgraph query ────────────────────────────────────────────────────────────

interface SettlementSubgraphResult {
  settlement: {
    id: string;
    callId: string;
    outcome: string;
    oracle: string;
    oracleType: string;
    settledAt: string | null;
    txHash: string;
    repDelta: string;
    /** Signed EIP-712 attestation payload (for non-Pyth paths) */
    attestationPayload?: string;
    /** Pyth-specific fields */
    pythPrice?: string;
    pythConf?: string;
    pythPublishTime?: string;
    /** NFT TWAP specific */
    evidenceHash?: string;
    observationCount?: string;
    /** CEX specific */
    announcementTitle?: string;
    announcementUrl?: string;
    scrapedAt?: string;
    /** Relayer EIP-712 signature */
    relayerSignature?: string;
  } | null;
}

async function fetchSettlementFromSubgraph(
  callId: bigint,
): Promise<SettlementSubgraphResult['settlement'] | null> {
  const subgraphUrl =
    process.env.SUBGRAPH_STUDIO_URL ??
    process.env.RELAYER_SUBGRAPH_URL ??
    process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
    '';
  if (!subgraphUrl) return null;

  const apiKey = process.env.SUBGRAPH_STUDIO_API_KEY ?? '';
  const query = `
    query GetSettlement($callId: ID!) {
      settlement(id: $callId) {
        id
        callId
        outcome
        oracle
        oracleType
        settledAt
        txHash
        repDelta
        attestationPayload
        pythPrice
        pythConf
        pythPublishTime
        evidenceHash
        observationCount
        announcementTitle
        announcementUrl
        scrapedAt
        relayerSignature
      }
    }
  `;

  try {
    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, variables: { callId: callId.toString() } }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: SettlementSubgraphResult };
    return json?.data?.settlement ?? null;
  } catch {
    return null;
  }
}

// ── Oracle URL mapping ────────────────────────────────────────────────────────

function oracleUrlFromType(oracleType: OracleType, feedId?: string): { url: string; host: string } {
  switch (oracleType) {
    case 'pyth':
      return {
        url: feedId
          ? `https://pyth.network/price-feeds/crypto-${feedId}`
          : 'https://pyth.network',
        host: 'pyth.network',
      };
    case 'nft-twap':
      return { url: 'https://nft.alchemyapi.io', host: 'alchemy.com' };
    case 'defillama':
      return { url: 'https://defillama.com', host: 'defillama.com' };
    case 'rpc-metrics':
      return { url: 'https://arbiscan.io', host: 'arbiscan.io' };
    case 'snapshot':
      return { url: 'https://snapshot.org', host: 'snapshot.org' };
    case 'tally':
      return { url: 'https://tally.xyz', host: 'tally.xyz' };
    case 'cex':
      return { url: 'https://binance.com/en/support/announcement', host: 'binance.com' };
    default:
      return { url: 'https://oracle.callitapp.xyz', host: 'oracle.callitapp.xyz' };
  }
}

function parseOracleType(raw: string | undefined | null): OracleType {
  if (!raw) return 'pyth';
  const normalized = raw.toLowerCase().replace(/_/g, '-').replace(/\s+/g, '-');
  const valid: OracleType[] = ['pyth', 'nft-twap', 'defillama', 'rpc-metrics', 'snapshot', 'tally', 'cex'];
  return (valid.includes(normalized as OracleType) ? normalized : 'pyth') as OracleType;
}

// ── Build path-aware rawOracleData ────────────────────────────────────────────

function buildRawOracleData(
  oracleType: OracleType,
  settlement: NonNullable<SettlementSubgraphResult['settlement']>,
): RawOracleData {
  switch (oracleType) {
    case 'pyth':
      return {
        pythPrice: settlement.pythPrice ?? '0',
        pythConf: settlement.pythConf ?? '0',
        pythPublishTime: settlement.pythPublishTime ?? '0',
      };
    case 'nft-twap':
      return {
        attestationPayload: settlement.attestationPayload ?? '{}',
        evidenceHash: settlement.evidenceHash,
        observationCount: settlement.observationCount ? Number(settlement.observationCount) : undefined,
      };
    case 'cex':
      return {
        announcementTitle: settlement.announcementTitle ?? '(unavailable)',
        announcementUrl: settlement.announcementUrl ?? '',
        scrapedAt: settlement.scrapedAt ?? new Date().toISOString(),
      };
    case 'defillama':
    case 'rpc-metrics':
    case 'snapshot':
    case 'tally':
    default:
      return {
        attestationPayload: settlement.attestationPayload ?? '{}',
      };
  }
}

// ── Fallback provenance (when subgraph unavailable) ───────────────────────────

function buildFallbackProvenance(callId: bigint): ProvenanceResponse {
  return {
    callId: callId.toString(),
    oracle: {
      type: 'pyth',
      url: 'https://pyth.network',
      host: 'pyth.network',
    },
    txHash: '',
    settledAt: null,
    rawOracleData: null,
    relayerSignature: '',
    chainId: 42161,
  };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function settleRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { callId: string } }>(
    '/api/settle/:callId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['callId'],
          properties: {
            callId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();

      // Parse callId
      let callId: bigint;
      try {
        callId = BigInt(request.params.callId);
      } catch {
        return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
      }

      const key = cacheKey(callId);

      // ── Cache check (L1-first — quick-260611-h36; never throws) ────────────
      {
        const cached = await getCached<ProvenanceResponse>(key, CACHE_TTL_SECONDS);
        if (cached) {
          logger.info(
            { event: 'settle_provenance_cache_hit', callId: callId.toString() },
            'settle provenance served from cache',
          );
          reply.header('x-source', 'cache');
          return reply.send(cached);
        }
      }

      logger.info(
        { event: 'settle_provenance_cache_miss', callId: callId.toString() },
        'settle provenance cache miss — fetching from subgraph',
      );

      try {
        const settlement = await fetchSettlementFromSubgraph(callId);

        let responseData: ProvenanceResponse;

        if (!settlement) {
          // Subgraph miss — return fallback (tx hash + source only, modal handles gracefully)
          responseData = buildFallbackProvenance(callId);
          logger.info(
            { event: 'settle_provenance_subgraph_miss', callId: callId.toString() },
            'Settlement not found in subgraph — returning fallback provenance',
          );
        } else {
          const oracleType = parseOracleType(settlement.oracleType);
          const { url: oracleUrl, host: oracleHost } = oracleUrlFromType(
            oracleType,
            settlement.oracle, // oracle field may hold feedId for Pyth
          );

          responseData = {
            callId: callId.toString(),
            oracle: {
              type: oracleType,          // CRITICAL: explicit type field (not just url) — ProvenanceModal branches on this
              url: oracleUrl,
              host: oracleHost,
              feedId: oracleType === 'pyth' ? settlement.oracle : undefined,
            },
            txHash: settlement.txHash ?? '',
            settledAt: settlement.settledAt ? Number(settlement.settledAt) : null,
            rawOracleData: buildRawOracleData(oracleType, settlement),
            relayerSignature: settlement.relayerSignature ?? '',
            chainId: 42161,
          };
        }

        // ── Cache result (L1 + best-effort Redis) ───────────────────────────
        await setCached(key, responseData, CACHE_TTL_SECONDS);

        reply.header('x-source', 'subgraph');
        return reply.send(responseData);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'settle_provenance_error', error: message, callId: callId.toString() },
          'Failed to fetch settlement provenance',
        );
        // Return fallback rather than 502 — modal handles gracefully (shows tx hash + source)
        return reply.send(buildFallbackProvenance(callId));
      }
    },
  );
}
