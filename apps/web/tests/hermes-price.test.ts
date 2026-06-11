/**
 * hermes-price.test.ts — pure Hermes price lib unit tests (quick-260611-hog).
 *
 * Node-env vitest, ZERO network: fetch is stubbed via vi.stubGlobal. Covers
 * URL building, defensive parsing of the untrusted Hermes JSON boundary
 * (T-hog-01 — null on any malformed/non-finite/non-positive value, never
 * throws), the never-throwing fetch wrapper, USD display formatting, and the
 * percentage-chip target math.
 *
 * Requirement: CALL-06, UI-02
 */

import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  buildHermesLatestUrl,
  parseHermesPriceResponse,
  fetchHermesPrice,
  formatUsdPrice,
  roundForTarget,
  computeChipTarget,
} from '../app/new/lib/hermes-price';
import { PYTH_BTC_USD } from '@call-it/shared';

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── buildHermesLatestUrl ────────────────────────────────────────────────────

describe('buildHermesLatestUrl', () => {
  test('targets the Hermes latest endpoint with the 0x-prefixed feed id as ids[]', () => {
    const url = buildHermesLatestUrl(PYTH_BTC_USD);
    expect(url.startsWith('https://hermes.pyth.network/v2/updates/price/latest')).toBe(true);
    expect(new URL(url).searchParams.get('ids[]')).toBe(PYTH_BTC_USD);
  });
});

// ─── parseHermesPriceResponse ────────────────────────────────────────────────

describe('parseHermesPriceResponse', () => {
  test('realistic BTC payload -> 97432.18', () => {
    const json = { parsed: [{ price: { price: '9743218000000', expo: -8 } }] };
    expect(parseHermesPriceResponse(json)).toBeCloseTo(97432.18, 6);
  });

  test('PEPE-scale payload (price 1234, expo -10) -> 0.0000001234', () => {
    const json = { parsed: [{ price: { price: '1234', expo: -10 } }] };
    expect(parseHermesPriceResponse(json)).toBeCloseTo(0.0000001234, 14);
  });

  test('null on missing parsed', () => {
    expect(parseHermesPriceResponse({ binary: {} })).toBeNull();
  });

  test('null on empty parsed array', () => {
    expect(parseHermesPriceResponse({ parsed: [] })).toBeNull();
  });

  test('null on non-numeric price string', () => {
    const json = { parsed: [{ price: { price: 'not-a-number', expo: -8 } }] };
    expect(parseHermesPriceResponse(json)).toBeNull();
  });

  test('null on non-finite result', () => {
    const json = { parsed: [{ price: { price: '1e500', expo: 0 } }] };
    expect(parseHermesPriceResponse(json)).toBeNull();
  });

  test('null on price <= 0', () => {
    expect(
      parseHermesPriceResponse({ parsed: [{ price: { price: '0', expo: -8 } }] }),
    ).toBeNull();
    expect(
      parseHermesPriceResponse({ parsed: [{ price: { price: '-100', expo: -8 } }] }),
    ).toBeNull();
  });

  test('never throws on garbage inputs', () => {
    for (const garbage of [null, undefined, 42, 'string', [], { parsed: [{}] }]) {
      expect(() => parseHermesPriceResponse(garbage)).not.toThrow();
      expect(parseHermesPriceResponse(garbage)).toBeNull();
    }
  });
});

// ─── fetchHermesPrice (stubbed fetch — no network) ───────────────────────────

describe('fetchHermesPrice', () => {
  test('ok JSON response resolves to the parsed number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ parsed: [{ price: { price: '9743218000000', expo: -8 } }] }),
      })),
    );
    await expect(fetchHermesPrice(PYTH_BTC_USD)).resolves.toBeCloseTo(97432.18, 6);
  });

  test('res.ok === false resolves to null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    await expect(fetchHermesPrice(PYTH_BTC_USD)).resolves.toBeNull();
  });

  test('rejecting fetch (network error / AbortError) resolves to null — never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError');
    }));
    await expect(fetchHermesPrice(PYTH_BTC_USD)).resolves.toBeNull();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down');
    }));
    await expect(fetchHermesPrice(PYTH_BTC_USD)).resolves.toBeNull();
  });
});

// ─── formatUsdPrice ──────────────────────────────────────────────────────────

describe('formatUsdPrice', () => {
  test('>= $1: en-US grouping with exactly 2 decimals', () => {
    expect(formatUsdPrice(97432.18)).toBe('97,432.18');
    expect(formatUsdPrice(1.5)).toBe('1.50');
  });

  test('sub-$1: 4 significant figures without exponent artifacts', () => {
    expect(formatUsdPrice(0.00001234)).toBe('0.00001234');
    expect(formatUsdPrice(0.9876)).toBe('0.9876');
  });
});

// ─── roundForTarget ──────────────────────────────────────────────────────────

describe('roundForTarget', () => {
  test('sub-$1: 4 significant figures', () => {
    expect(roundForTarget(0.000012345)).toBe(Number((0.000012345).toPrecision(4)));
    expect(roundForTarget(0.00001234)).toBe(0.00001234);
  });

  test('>= $1: 2 decimals (110.00 not 110.000000001)', () => {
    expect(roundForTarget(110.000000001)).toBe(110);
    expect(roundForTarget(97432.18499)).toBe(97432.18);
  });
});

// ─── computeChipTarget ───────────────────────────────────────────────────────

describe('computeChipTarget', () => {
  test('(100, 10) -> 110', () => {
    expect(computeChipTarget(100, 10)).toBe(110);
  });

  test('(100, 100) -> 200', () => {
    expect(computeChipTarget(100, 100)).toBe(200);
  });

  test('(0.00001234, 50) -> roundForTarget(0.00001851) — 4 sig figs', () => {
    expect(computeChipTarget(0.00001234, 50)).toBe(roundForTarget(0.00001234 * 1.5));
    expect(computeChipTarget(0.00001234, 50)).toBe(0.00001851);
  });
});
