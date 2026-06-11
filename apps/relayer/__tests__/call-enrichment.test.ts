/**
 * Call enrichment helper tests — quick-260611-5mh Task 1 (RC2/D-05).
 *
 * Tests:
 *   1. Reverse map: ETH feedId (bigint + hex string) → "ETH"; unknown → undefined
 *   2. marketLine formatting: $1,000,000 no decimals; sub-$10 keeps decimals
 *   3. buildMarketLine: PriceTarget / RelativePerformance (both-resolve gate) / Event
 *   4. Cache hit skips the multicall (ONE RPC per unique id, ever)
 *   5. RPC failure → enrichFeedItems returns items UNCHANGED (graceful degradation)
 *   6. enrichFeedItems merges additively (existing keys preserved, placeholders fixed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockMulticall } = vi.hoisted(() => ({
  mockMulticall: vi.fn(),
}));

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({ multicall: mockMulticall })),
  // quick-260611-co5: passthrough — production code wraps transports in fallback()
  fallback: vi.fn((transports: unknown[]) => transports[0]),
  http: vi.fn((url: string) => url),
}));

vi.mock('viem/chains', () => ({
  arbitrumSepolia: { id: 421614, name: 'Arbitrum Sepolia' },
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import {
  feedIdToSymbol,
  formatTargetUsd,
  buildMarketLine,
  enrichCallIds,
  enrichFeedItems,
  buildEnrichmentFromStruct,
  peekEnrichment,
  _resetEnrichmentForTests,
} from '../src/lib/call-enrichment.js';
import { PYTH_FEED_IDS } from '@call-it/shared';

// ── Test data — call 14 on Sepolia (verified live 2026-06-11) ─────────────────

const ETH_FEED_ID = PYTH_FEED_IDS.ETH; // 0xff61491a...fd0ace
const BTC_FEED_ID = PYTH_FEED_IDS.BTC;
const ETH_FEED_BIGINT = BigInt(ETH_FEED_ID);

/** getCall struct for call 14: ETH ≥ $1,000,000, expiry 1780931059 */
function call14Struct(): Record<string, unknown> {
  return {
    caller: '0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5',
    stake: 5_000_000n,
    virtualFadeSeed: 0n,
    createdAt: 1780000000n,
    expiry: 1780931059n,
    marketType: 0,
    eventSubtype: 0,
    category: 0,
    status: 1,
    conviction: 50,
    openToChallenges: false,
    callerExitedAt: 0n,
    outcome: 2,
    duplicateHash: '0x' + '0'.repeat(64),
    criteriaHash: '0x' + '0'.repeat(64),
    assetA: ETH_FEED_BIGINT,
    assetB: 0n,
    targetValue: 100000000000000n, // 1e14 = $1,000,000 at 1e8 scale
    parentCallId: 0n,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('call-enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetEnrichmentForTests();
  });

  describe('feedIdToSymbol (reverse map)', () => {
    it('resolves the ETH feed id (bigint) to "ETH"', () => {
      expect(feedIdToSymbol(ETH_FEED_BIGINT)).toBe('ETH');
    });

    it('resolves a 0x hex string case-insensitively', () => {
      expect(feedIdToSymbol(ETH_FEED_ID.toUpperCase().replace('0X', '0x'))).toBe('ETH');
    });

    it('returns undefined for an unknown feed id (degrade, never guess — D-07)', () => {
      expect(feedIdToSymbol(123456789n)).toBeUndefined();
      expect(feedIdToSymbol(0n)).toBeUndefined();
    });
  });

  describe('formatTargetUsd / buildMarketLine', () => {
    it('formats $1,000,000 with no decimals (en-US grouping)', () => {
      expect(formatTargetUsd(100000000000000n)).toBe('1,000,000');
    });

    it('keeps decimals for sub-$10 values', () => {
      expect(formatTargetUsd(550000000n)).toBe('5.5'); // $5.50
      expect(formatTargetUsd(1230n)).toBe('0.0000123'); // PEPE-scale
    });

    it('builds the PriceTarget line: "ETH ≥ $1,000,000"', () => {
      expect(buildMarketLine(0, 'ETH', undefined, 100000000000000n)).toBe('ETH ≥ $1,000,000');
    });

    it('degrades PriceTarget to undefined when the asset is unresolved', () => {
      expect(buildMarketLine(0, undefined, undefined, 100000000000000n)).toBeUndefined();
    });

    it('builds RelativePerformance "A vs B" only when BOTH assets resolve', () => {
      expect(buildMarketLine(1, 'ETH', 'BTC', 0n)).toBe('ETH vs BTC');
      expect(buildMarketLine(1, 'ETH', undefined, 0n)).toBeUndefined();
    });

    it('returns undefined for Event markets (keep the stored statement)', () => {
      expect(buildMarketLine(2, 'ETH', 'BTC', 0n)).toBeUndefined();
    });
  });

  describe('enrichCallIds (multicall + immutable cache)', () => {
    it('enriches call 14 from one multicall and caches the result', async () => {
      mockMulticall.mockResolvedValueOnce([{ status: 'success', result: call14Struct() }]);

      const first = await enrichCallIds(['14']);
      expect(mockMulticall).toHaveBeenCalledTimes(1);
      const e = first.get('14');
      expect(e).toBeDefined();
      expect(e?.assetSymbol).toBe('ETH');
      expect(e?.expiry).toBe('1780931059');
      expect(e?.targetValue).toBe('100000000000000');
      expect(e?.marketLine).toBe('ETH ≥ $1,000,000');
      expect(e?.conviction).toBe(50);

      // Second call: served from the in-process cache — NO second multicall
      const second = await enrichCallIds(['14']);
      expect(mockMulticall).toHaveBeenCalledTimes(1);
      expect(second.get('14')).toEqual(e);
      // peekEnrichment (profile-route cheap path) also hits the cache
      expect(peekEnrichment('14')).toEqual(e);
    });

    it('skips non-numeric ids without any RPC', async () => {
      const result = await enrichCallIds(['call-001', 'not-a-number']);
      expect(result.size).toBe(0);
      expect(mockMulticall).not.toHaveBeenCalled();
    });

    it('never caches a zero struct (nonexistent callId)', async () => {
      const zero = { ...call14Struct(), createdAt: 0n };
      mockMulticall.mockResolvedValue([{ status: 'success', result: zero }]);

      const result = await enrichCallIds(['999']);
      expect(result.size).toBe(0);
      expect(peekEnrichment('999')).toBeUndefined();
    });
  });

  describe('buildEnrichmentFromStruct (live-state zero-extra-RPC path)', () => {
    it('computes and caches enrichment from an already-read struct', () => {
      const fields = buildEnrichmentFromStruct('14', {
        createdAt: 1780000000n,
        expiry: 1780931059n,
        conviction: 50,
        marketType: 0,
        assetA: ETH_FEED_BIGINT,
        assetB: 0n,
        targetValue: 100000000000000n,
      });
      expect(fields?.marketLine).toBe('ETH ≥ $1,000,000');
      expect(peekEnrichment('14')).toEqual(fields);
      expect(mockMulticall).not.toHaveBeenCalled();
    });

    it('returns null for a zero struct', () => {
      const fields = buildEnrichmentFromStruct('999', {
        createdAt: 0n,
        expiry: 0n,
        conviction: 0,
        marketType: 0,
        assetA: 0n,
        assetB: 0n,
        targetValue: 0n,
      });
      expect(fields).toBeNull();
    });

    it('WR-04: Event markets (marketType 2) omit targetValue AND marketLine (raw/unscaled target)', () => {
      // A $1M TVL milestone is stored RAW (1000000), not at 1e8 — emitting it
      // under the 1e8-documented targetValue key made consumers render "$0.01".
      const fields = buildEnrichmentFromStruct('16', {
        createdAt: 1780000000n,
        expiry: 1780931059n,
        conviction: 70,
        marketType: 2,
        assetA: 0n,
        assetB: 0n,
        targetValue: 1000000n, // raw $1,000,000 milestone — NOT 1e8 scale
      });
      expect(fields).not.toBeNull();
      expect(fields?.targetValue).toBeUndefined();
      expect(fields?.marketLine).toBeUndefined();
      // The real on-chain facts still enrich (expiry/conviction/marketType)
      expect(fields?.expiry).toBe('1780931059');
      expect(fields?.conviction).toBe(70);
      expect(fields?.marketType).toBe(2);
    });
  });

  describe('enrichFeedItems (graceful degradation contract)', () => {
    const FEED_ITEMS = [
      {
        id: '14',
        caller: '0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5',
        marketType: 0,
        asset: '',
        stake: '5000000',
        expiry: '0',
        conviction: 50,
        status: 'Settled',
        createdAt: '1780000000',
        outcome: 'CallerLost',
      },
    ];

    it('RPC failure returns the items UNCHANGED (never throws, never blocks)', async () => {
      mockMulticall.mockRejectedValueOnce(new Error('RPC timeout'));

      const result = await enrichFeedItems(FEED_ITEMS);
      expect(result).toEqual(FEED_ITEMS);
    });

    it('merges enrichment additively: placeholders fixed, existing keys preserved', async () => {
      mockMulticall.mockResolvedValueOnce([{ status: 'success', result: call14Struct() }]);

      const result = (await enrichFeedItems(FEED_ITEMS)) as Array<Record<string, unknown>>;
      const item = result[0];
      expect(item).toBeDefined();
      // Placeholders replaced with real on-chain facts (RC2)
      expect(item?.['expiry']).toBe('1780931059');
      expect(item?.['asset']).toBe('ETH');
      // New ADDITIVE keys
      expect(item?.['assetSymbol']).toBe('ETH');
      expect(item?.['targetValue']).toBe('100000000000000');
      expect(item?.['marketLine']).toBe('ETH ≥ $1,000,000');
      // Existing keys and casing untouched (status stays TitleCase)
      expect(item?.['status']).toBe('Settled');
      expect(item?.['stake']).toBe('5000000');
      expect(item?.['outcome']).toBe('CallerLost');
      expect(item?.['caller']).toBe('0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5');
    });

    it('WR-04: Event-market feed items carry NO targetValue / marketLine keys', async () => {
      const eventStruct = {
        ...call14Struct(),
        marketType: 2,
        assetA: 0n,
        targetValue: 1000000n, // raw milestone — not 1e8
      };
      mockMulticall.mockResolvedValueOnce([{ status: 'success', result: eventStruct }]);

      const result = (await enrichFeedItems([{ id: '17', asset: '', status: 'Live' }])) as Array<
        Record<string, unknown>
      >;
      expect(result[0]).toBeDefined();
      expect('targetValue' in (result[0] ?? {})).toBe(false);
      expect('marketLine' in (result[0] ?? {})).toBe(false);
      // Real facts still merge additively
      expect(result[0]?.['expiry']).toBe('1780931059');
    });

    it('relative-performance line requires both assets to resolve', async () => {
      const relStruct = {
        ...call14Struct(),
        marketType: 1,
        assetA: BigInt(ETH_FEED_ID),
        assetB: BigInt(BTC_FEED_ID),
      };
      mockMulticall.mockResolvedValueOnce([{ status: 'success', result: relStruct }]);

      const result = (await enrichFeedItems([{ id: '15', asset: '', status: 'Live' }])) as Array<
        Record<string, unknown>
      >;
      expect(result[0]?.['marketLine']).toBe('ETH vs BTC');
    });
  });
});
