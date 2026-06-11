/**
 * Call enrichment helper (quick-260611-5mh — RC2 / D-05 closure).
 *
 * The subgraph CallCreated mapping deliberately writes placeholder values
 * (asset='', expiry=0, conviction=50) because the CallCreated event only
 * carries (id, caller, marketType, stake) — see packages/subgraph/src/
 * call-registry.ts. The REAL post-creation facts (assetA/assetB feed ids,
 * expiry, conviction, targetValue, marketType) live on-chain in
 * CallRegistry.getCall and are IMMUTABLE once the call is created.
 *
 * This module is the shared enrichment layer used by /api/feed and
 * /api/calls/:id/live-state:
 *   - ONE viem multicall per feed page against CallRegistry.getCall(id)
 *   - In-process immutable cache (Map<callId, EnrichedCallFields>) — never
 *     expires because every cached field is set-once at call creation.
 *     NO Redis: the Upstash quota is exhausted (settlement worker down), and
 *     these fields never change anyway.
 *   - Pyth feedId→symbol reverse map built by inverting the shared
 *     PYTH_FEED_IDS constant (packages/shared) — unknown feed ids degrade to
 *     undefined, never a guessed symbol (D-07).
 *   - marketLine builder (server-side display string):
 *       marketType 0 (PriceTarget)         → "ETH ≥ $1,000,000"
 *       marketType 1 (RelativePerformance) → "ETH vs BTC" (both must resolve)
 *       marketType 2 (Event)               → undefined (keep stored statement)
 *
 * GRACEFUL DEGRADATION CONTRACT: enrichFeedItems NEVER throws and NEVER
 * blocks the feed — an RPC failure returns the input items unchanged in their
 * current shape. All enriched fields are ADDITIVE to existing response keys.
 *
 * Requirements: D-05, D-07, RC2 (quick-260611-5mh live investigation)
 */

import { fallback, createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getLogger } from './logger.js';
import { PYTH_FEED_IDS, CALL_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

// ── CallRegistry.getCall ABI slice (mirrors live-state.ts) ────────────────────

const CALL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getCall',
    stateMutability: 'view',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'caller', type: 'address' },
          { name: 'stake', type: 'uint96' },
          { name: 'virtualFadeSeed', type: 'uint96' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'marketType', type: 'uint8' },
          { name: 'eventSubtype', type: 'uint8' },
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'conviction', type: 'uint8' },
          { name: 'openToChallenges', type: 'bool' },
          { name: 'callerExitedAt', type: 'uint64' },
          { name: 'outcome', type: 'uint8' },
          { name: 'duplicateHash', type: 'bytes32' },
          { name: 'criteriaHash', type: 'bytes32' },
          { name: 'assetA', type: 'uint256' },
          { name: 'assetB', type: 'uint256' },
          { name: 'targetValue', type: 'uint256' },
          { name: 'parentCallId', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Immutable post-creation fields enriched from CallRegistry.getCall. */
export interface EnrichedCallFields {
  /** Resolved ticker symbol for assetA (e.g. "ETH") — undefined when the feed id is unknown (D-07: degrade, never guess). */
  assetSymbol?: string;
  /**
   * Raw on-chain targetValue as a STRING at 1e8 scale (e.g. "100000000000000"
   * = $1,000,000). WR-04: OMITTED for Event markets (marketType 2) — event
   * milestone targets are stored RAW/unscaled on-chain (target-scale.ts), so
   * emitting them under this 1e8-documented key made ÷1e8 consumers render
   * "$0.01" for a $1M milestone. Event calls degrade to their stored
   * statement (D-07) with no fabricated dollar target.
   */
  targetValue?: string;
  /** Server-built human-readable market line (e.g. "ETH ≥ $1,000,000") — undefined when not derivable. */
  marketLine?: string;
  /** Unix-seconds expiry as a string. */
  expiry: string;
  /** Conviction 0-100. */
  conviction: number;
  /** On-chain marketType ordinal (0=PriceTarget, 1=RelativePerformance, 2=Event). */
  marketType: number;
}

/** The subset of the on-chain Call struct the enrichment needs. */
export interface CallStructForEnrichment {
  createdAt: bigint;
  expiry: bigint;
  conviction: number;
  marketType: number;
  assetA: bigint;
  assetB: bigint;
  targetValue: bigint;
}

// ── Pyth feedId → symbol reverse map ──────────────────────────────────────────

// Built by inverting the shared PYTH_FEED_IDS (symbol → 0x-prefixed feedId).
// Keys are lowercased 0x-prefixed feed ids for case-insensitive matching against
// on-chain uint256/bytes32 values.
const FEED_ID_TO_SYMBOL: ReadonlyMap<string, string> = new Map(
  Object.entries(PYTH_FEED_IDS).map(([symbol, feedId]) => [
    (feedId as string).toLowerCase(),
    symbol,
  ]),
);

/**
 * Resolve a Pyth feed id (on-chain uint256 or 0x-hex string) to its ticker
 * symbol. Returns undefined for unknown ids — degrade, never guess (D-07).
 */
export function feedIdToSymbol(feedId: bigint | string): string | undefined {
  if (typeof feedId === 'bigint') {
    if (feedId === 0n) return undefined;
    return FEED_ID_TO_SYMBOL.get(`0x${feedId.toString(16).padStart(64, '0')}`);
  }
  return FEED_ID_TO_SYMBOL.get(feedId.toLowerCase());
}

// ── marketLine builder ────────────────────────────────────────────────────────

/**
 * Format a 1e8-scale target value as a USD display number (no "$" prefix).
 * en-US locale; no decimals at/above $10, up to 8 fraction digits below $10
 * (sub-$10 assets like PEPE need the precision).
 */
export function formatTargetUsd(targetValue1e8: bigint): string {
  const value = Number(targetValue1e8) / 1e8;
  if (value >= 10) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

/**
 * Build the server-side market line for a call, or undefined when not
 * derivable (unknown feed id / Event market keeps its stored statement).
 * The on-chain struct carries no comparator field, so PriceTarget uses "≥"
 * (the v1 contract semantic: target reached at-or-above).
 */
export function buildMarketLine(
  marketType: number,
  assetSymbolA: string | undefined,
  assetSymbolB: string | undefined,
  targetValue: bigint,
): string | undefined {
  if (marketType === 0) {
    // PriceTarget — needs a resolved primary asset
    if (!assetSymbolA) return undefined;
    return `${assetSymbolA} ≥ $${formatTargetUsd(targetValue)}`;
  }
  if (marketType === 1) {
    // RelativePerformance — needs BOTH assets resolved (degrade otherwise)
    if (!assetSymbolA || !assetSymbolB) return undefined;
    return `${assetSymbolA} vs ${assetSymbolB}`;
  }
  // marketType 2 (Event) and anything else: keep the existing statement
  return undefined;
}

// ── In-process immutable cache ────────────────────────────────────────────────

// All cached fields are set once at call creation and never change, so the
// cache never expires. In-process Map — NO Redis (Upstash quota exhausted).
const enrichmentCache = new Map<string, EnrichedCallFields>();

/** Cache-only lookup (no RPC). Used by the profile route's calls history. */
export function peekEnrichment(callId: string): EnrichedCallFields | undefined {
  return enrichmentCache.get(callId);
}

// ── viem public client (lazy, module-singleton) ───────────────────────────────

type MulticallClient = {
  multicall: (args: {
    contracts: readonly unknown[];
    allowFailure: true;
  }) => Promise<Array<{ status: string; result?: unknown }>>;
};

let client: MulticallClient | null = null;

function getClient(): MulticallClient {
  if (client === null) {
    // Prod injects RPC_URL_ARBITRUM_SEPOLIA (Fly secret); local .env.local uses
    // ARBITRUM_SEPOLIA_RPC_URL — same convention as live-state.ts / profile.ts.
    const rpcUrl =
      process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL;
    client = createPublicClient({
      chain: arbitrumSepolia,
      // Bounded transport (quick-260610-sr0 lesson): the public-RPC fallback
      // tarpit-throttles; never let an enrichment read hang the feed.
      transport: fallback([
        http(rpcUrl, { timeout: 5_000, retryCount: 1 }),
        http(undefined, { timeout: 5_000, retryCount: 1 }), // public RPC failover
      ]),
    }) as unknown as MulticallClient;
  }
  return client;
}

/** Test hook: clear the immutable cache + client singleton. */
export function _resetEnrichmentForTests(): void {
  enrichmentCache.clear();
  client = null;
}

// ── Enrichment from an already-read struct (live-state reuse, zero extra RPC) ─

/**
 * Compute + cache enrichment fields from an already-read getCall struct.
 * Returns null for a zero struct (nonexistent callId — never cached).
 */
export function buildEnrichmentFromStruct(
  callId: string,
  struct: CallStructForEnrichment,
): EnrichedCallFields | null {
  // getCall returns a zero-struct for nonexistent ids — createdAt 0 marks it.
  if (struct.createdAt === 0n) return null;

  const cached = enrichmentCache.get(callId);
  if (cached) return cached;

  const assetSymbol = feedIdToSymbol(struct.assetA);
  const assetSymbolB = feedIdToSymbol(struct.assetB);
  const fields: EnrichedCallFields = {
    ...(assetSymbol !== undefined ? { assetSymbol } : {}),
    // WR-04: targetValue is 1e8-scale ONLY for Price/RelativePerformance markets;
    // Event (marketType 2) targets are raw/unscaled — omit them entirely.
    ...(struct.marketType !== 2 ? { targetValue: struct.targetValue.toString() } : {}),
    ...((): { marketLine?: string } => {
      const line = buildMarketLine(struct.marketType, assetSymbol, assetSymbolB, struct.targetValue);
      return line !== undefined ? { marketLine: line } : {};
    })(),
    expiry: struct.expiry.toString(),
    conviction: struct.conviction,
    marketType: struct.marketType,
  };

  enrichmentCache.set(callId, fields);
  return fields;
}

// ── Batch enrichment (ONE multicall per feed page) ────────────────────────────

/**
 * Enrich a set of callIds: cache hits are served from the in-process Map;
 * uncached ids go through ONE viem multicall (getCall per id, allowFailure).
 *
 * NEVER throws. RPC failure logs a warning and returns whatever was already
 * cached — callers degrade to the unenriched shape.
 */
export async function enrichCallIds(
  callIds: string[],
): Promise<Map<string, EnrichedCallFields>> {
  const result = new Map<string, EnrichedCallFields>();
  const uncached: Array<{ id: string; idBn: bigint }> = [];

  for (const id of callIds) {
    const hit = enrichmentCache.get(id);
    if (hit) {
      result.set(id, hit);
      continue;
    }
    // Skip non-numeric ids gracefully (subgraph Call ids are numeric strings).
    try {
      uncached.push({ id, idBn: BigInt(id) });
    } catch {
      // not a numeric call id — leave unenriched
    }
  }

  if (uncached.length === 0) return result;

  const registryAddress = CALL_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`;
  if (registryAddress.toLowerCase() === ZERO_ADDRESS) return result;

  try {
    const responses = await getClient().multicall({
      contracts: uncached.map(({ idBn }) => ({
        address: registryAddress,
        abi: CALL_REGISTRY_ABI,
        functionName: 'getCall',
        args: [idBn],
      })),
      allowFailure: true,
    });

    for (let i = 0; i < uncached.length; i++) {
      const entry = uncached[i];
      const response = responses[i];
      if (!entry || !response || response.status !== 'success' || response.result === undefined) continue;
      const raw = response.result as Record<string, unknown>;
      const fields = buildEnrichmentFromStruct(entry.id, {
        createdAt: (raw['createdAt'] as bigint) ?? 0n,
        expiry: (raw['expiry'] as bigint) ?? 0n,
        conviction: Number(raw['conviction'] ?? 0),
        marketType: Number(raw['marketType'] ?? 0),
        assetA: (raw['assetA'] as bigint) ?? 0n,
        assetB: (raw['assetB'] as bigint) ?? 0n,
        targetValue: (raw['targetValue'] as bigint) ?? 0n,
      });
      if (fields) result.set(entry.id, fields);
    }
  } catch (err) {
    // GRACEFUL DEGRADATION: an RPC failure must never block the feed.
    getLogger().warn(
      { event: 'call_enrichment_rpc_failed', err: String(err), ids: uncached.map((u) => u.id) },
      'CallRegistry enrichment multicall failed — items returned unenriched',
    );
  }

  return result;
}

/**
 * Enrich feed items (ADDITIVE — all existing keys/casing preserved):
 *   - `expiry` / `conviction` values replaced with the real on-chain facts
 *     (the subgraph mapping writes 0 / 50 placeholders — RC2)
 *   - `asset` populated with the resolved symbol ONLY when currently empty
 *   - NEW keys: `assetSymbol`, `targetValue` (1e8-scale string — omitted for
 *     Event markets whose targets are raw/unscaled, WR-04), `marketLine`
 *
 * NEVER throws — any failure returns the input items unchanged.
 */
export async function enrichFeedItems(items: unknown[]): Promise<unknown[]> {
  try {
    const ids: string[] = [];
    for (const item of items) {
      if (item !== null && typeof item === 'object') {
        const id = (item as Record<string, unknown>)['id'];
        if (typeof id === 'string' || typeof id === 'number') ids.push(String(id));
      }
    }
    if (ids.length === 0) return items;

    const enrichedMap = await enrichCallIds(ids);
    if (enrichedMap.size === 0) return items;

    return items.map((item) => {
      if (item === null || typeof item !== 'object') return item;
      const rec = item as Record<string, unknown>;
      const e = enrichedMap.get(String(rec['id']));
      if (!e) return item;
      const existingAsset = typeof rec['asset'] === 'string' ? (rec['asset'] as string) : '';
      return {
        ...rec,
        expiry: e.expiry,
        conviction: e.conviction,
        // Fill the placeholder '' asset; never clobber a real existing value.
        asset: existingAsset.length > 0 ? existingAsset : (e.assetSymbol ?? existingAsset),
        ...(e.assetSymbol !== undefined ? { assetSymbol: e.assetSymbol } : {}),
        // WR-04: omitted for Event markets (raw/unscaled target — no 1e8 lie).
        ...(e.targetValue !== undefined ? { targetValue: e.targetValue } : {}),
        ...(e.marketLine !== undefined ? { marketLine: e.marketLine } : {}),
      };
    });
  } catch (err) {
    getLogger().warn(
      { event: 'call_enrichment_failed', err: String(err) },
      'Feed enrichment failed — items returned unchanged',
    );
    return items;
  }
}
