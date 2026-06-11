/**
 * hermes-spot.test.ts — quick-260611-uf9 trivially-true call guard (relayer layer).
 *
 * V1 settles >= ONLY (SettlementManager.sol:718), so a priceTarget call with
 * targetValue at/below the live current price is a guaranteed CALLED IT =
 * free rep farming. The preflight route enforces targetValue STRICTLY above
 * the live Hermes spot price — FAIL-CLOSED when Hermes is unreachable
 * (fail-open would let users farm guaranteed wins whenever Hermes blips).
 *
 * Coverage:
 *   - normalizePythPriceTo1e8 exact integer math at expo -8 (identity),
 *     -6 (multiply path — the non-(-8) verification case), -10 (floor divide)
 *   - evaluateTargetGuard below/equality/above boundaries + null fail-closed
 *   - getSpotPrice1e8 defensive never-throw parse with a mock HermesClient
 *     (pattern: workers/__tests__/pyth-adapter.test.ts)
 *   - Source pins on routes/calls-preflight.ts so a future refactor cannot
 *     silently drop the server-side guard
 *     (pattern: routes/__tests__/profile-registry-address.test.ts)
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HermesClient } from '@pythnetwork/hermes-client';
import {
  normalizePythPriceTo1e8,
  evaluateTargetGuard,
  getSpotPrice1e8,
} from '../hermes-spot.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('normalizePythPriceTo1e8 — exact integer expo normalization', () => {
  it('expo -8 is the identity (canonical Pyth 8-decimal form)', () => {
    expect(normalizePythPriceTo1e8(9_743_218_000_000n, -8)).toBe(9_743_218_000_000n);
  });

  it('expo -6 multiplies exactly by 100 (the non-(-8) verification case)', () => {
    // $25.00 at expo -6 = 25_000_000 → 2_500_000_000 at 1e8
    expect(normalizePythPriceTo1e8(25_000_000n, -6)).toBe(2_500_000_000n);
  });

  it('expo -10 floor-divides by 100 (floor is exact for the strict-above rule)', () => {
    // $25.00 at expo -10 = 250_000_000_099 → floor → 2_500_000_000 at 1e8.
    // For an integer target T: T > floor(spot) ⟺ T > spot, so no precision
    // is lost at the boundary.
    expect(normalizePythPriceTo1e8(250_000_000_099n, -10)).toBe(2_500_000_000n);
    expect(normalizePythPriceTo1e8(199n, -10)).toBe(1n);
  });
});

describe('evaluateTargetGuard — strict-above rule, fail-closed', () => {
  const SPOT_2500 = 250_000_000_000n; // $2,500.00 at 1e8

  it('spot null → FAIL-CLOSED price_unverifiable (never fail-open)', () => {
    const result = evaluateTargetGuard(999_999_999_999_999n, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('price_unverifiable');
      expect(result.message).toContain('Could not verify current price');
    }
  });

  it('target BELOW spot → target_not_above_current (guaranteed-win farming)', () => {
    const result = evaluateTargetGuard(3_700_000_000n /* $37 */, SPOT_2500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('target_not_above_current');
      expect(result.message).toContain('2,500');
      expect(result.message).toContain('Target must be above the current price');
    }
  });

  it('target EQUAL to spot → rejected (equality boundary — settles at-or-above)', () => {
    const result = evaluateTargetGuard(SPOT_2500, SPOT_2500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('target_not_above_current');
    }
  });

  it('target STRICTLY above spot → ok (barely-above is a legit coin-flip)', () => {
    expect(evaluateTargetGuard(SPOT_2500 + 1n, SPOT_2500)).toEqual({ ok: true });
  });

  it('sub-$1 assets format with 8 decimals in the rejection copy (PEPE/BONK class)', () => {
    // spot $0.00001234 at 1e8 = 1234n
    const result = evaluateTargetGuard(1_000n, 1_234n);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('0.00001234');
    }
  });
});

describe('getSpotPrice1e8 — defensive never-throw Hermes parse (mock client)', () => {
  const FEED_ID = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

  const mockClient = (impl: ReturnType<typeof vi.fn>): HermesClient =>
    ({ getLatestPriceUpdates: impl }) as unknown as HermesClient;

  it('good parsed response → normalized 1e8 bigint', async () => {
    const client = mockClient(
      vi.fn().mockResolvedValue({
        parsed: [{ price: { price: '250000000000', expo: -8, conf: '100', publish_time: 1 } }],
      }),
    );
    await expect(getSpotPrice1e8(FEED_ID, client)).resolves.toBe(250_000_000_000n);
  });

  it('non-(-8) expo response normalizes through the same path', async () => {
    const client = mockClient(
      vi.fn().mockResolvedValue({
        parsed: [{ price: { price: '25000000', expo: -6, conf: '1', publish_time: 1 } }],
      }),
    );
    await expect(getSpotPrice1e8(FEED_ID, client)).resolves.toBe(2_500_000_000n);
  });

  it('client throws → null (Hermes is an untrusted boundary — never throws)', async () => {
    const client = mockClient(vi.fn().mockRejectedValue(new Error('hermes down')));
    await expect(getSpotPrice1e8(FEED_ID, client)).resolves.toBeNull();
  });

  it('missing parsed → null', async () => {
    const client = mockClient(vi.fn().mockResolvedValue({ binary: { data: [] } }));
    await expect(getSpotPrice1e8(FEED_ID, client)).resolves.toBeNull();
  });

  it('malformed price shape (non-string mantissa / missing expo) → null', async () => {
    const badMantissa = mockClient(
      vi.fn().mockResolvedValue({ parsed: [{ price: { price: 250, expo: -8 } }] }),
    );
    await expect(getSpotPrice1e8(FEED_ID, badMantissa)).resolves.toBeNull();

    const missingExpo = mockClient(
      vi.fn().mockResolvedValue({ parsed: [{ price: { price: '250' } }] }),
    );
    await expect(getSpotPrice1e8(FEED_ID, missingExpo)).resolves.toBeNull();

    const nonNumericMantissa = mockClient(
      vi.fn().mockResolvedValue({ parsed: [{ price: { price: 'not-a-number', expo: -8 } }] }),
    );
    await expect(getSpotPrice1e8(FEED_ID, nonNumericMantissa)).resolves.toBeNull();
  });

  it('zero / negative mantissa → null (never a fabricated or nonsense price)', async () => {
    const zero = mockClient(
      vi.fn().mockResolvedValue({ parsed: [{ price: { price: '0', expo: -8 } }] }),
    );
    await expect(getSpotPrice1e8(FEED_ID, zero)).resolves.toBeNull();

    const negative = mockClient(
      vi.fn().mockResolvedValue({ parsed: [{ price: { price: '-100', expo: -8 } }] }),
    );
    await expect(getSpotPrice1e8(FEED_ID, negative)).resolves.toBeNull();
  });
});

describe('preflight route wiring pins (fail-closed guard cannot be silently dropped)', () => {
  const routeSource = readFileSync(
    resolve(__dirname, '../../routes/calls-preflight.ts'),
    'utf-8',
  );

  it('calls-preflight.ts wires getSpotPrice1e8 + evaluateTargetGuard under withTimeout', () => {
    expect(routeSource).toContain('getSpotPrice1e8');
    expect(routeSource).toContain('evaluateTargetGuard');
    expect(routeSource).toContain('withTimeout');
  });

  it('the gate is conditioned on the priceTarget market type and fail-closed', () => {
    expect(routeSource).toContain("'priceTarget'");
    expect(routeSource).toContain('price_unverifiable');
  });
});
