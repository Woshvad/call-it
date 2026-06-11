/**
 * target-scale.test.ts — quick-260611-5mh RC3 regression guards.
 *
 * Canonical targetValue scale is 1e8 (SettlementManager.sol:714 — "targetValue
 * stored in same units as Pyth price (8-decimal form, expo=-8)"). The composer
 * previously converted at 1e6: typing $4,200 created a $42.00 on-chain target.
 * Reference: real call #14 has targetValue=100000000000000 (1e14 = $1M @ 1e8).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  TARGET_SCALE,
  usdToTargetValue,
  targetValueToUsd,
  formatTargetForDisplay,
} from '../app/new/lib/target-scale';
import { createCallSchema, MIN_STAKE } from '@call-it/shared';

const WEB_ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(WEB_ROOT, p), 'utf-8');

describe('canonical 1e8 target scale (B4)', () => {
  test('TARGET_SCALE is 1e8 (Pyth 8-decimal form)', () => {
    expect(TARGET_SCALE).toBe(100_000_000);
  });

  test('$4,200 entry produces on-chain targetValue 420000000000 (1e8)', () => {
    expect(usdToTargetValue(4200)).toBe(420_000_000_000n);
  });

  test('$1,000,000 matches the verified call #14 raw value (1e14)', () => {
    expect(usdToTargetValue(1_000_000)).toBe(100_000_000_000_000n);
  });

  test('display round-trips: 420000000000n renders as $4,200', () => {
    expect(targetValueToUsd(420_000_000_000n)).toBe(4200);
    expect(formatTargetForDisplay('priceTarget', 420_000_000_000n)).toBe('4,200');
  });

  test('spreadVs ratios use the same 1e8 scale (2.5x round-trip)', () => {
    const raw = usdToTargetValue(2.5)!;
    expect(raw).toBe(250_000_000n);
    expect(targetValueToUsd(raw)).toBe(2.5);
  });

  test('event milestone targets display RAW (EventFields stores unscaled integers)', () => {
    // "1000000" for $1M TVL is stored as-is — never divided by any scale.
    expect(formatTargetForDisplay('event', 1_000_000n)).toBe('1,000,000');
  });

  test('empty/invalid input returns undefined (field resets to required state)', () => {
    expect(usdToTargetValue(NaN)).toBeUndefined();
    expect(usdToTargetValue(Infinity)).toBeUndefined();
  });
});

describe('default targetValue is empty + required (no numeric prefill)', () => {
  test('new/page.tsx no longer prefills targetValue: 1n', () => {
    const source = read('app/new/page.tsx');
    expect(source).toContain('targetValue: undefined');
    expect(source).not.toContain('targetValue: 1n');
  });

  test('createCallSchema rejects a missing targetValue (required field)', () => {
    const result = createCallSchema.safeParse({
      marketType: 'priceTarget',
      eventSubtype: 'none',
      category: 'majors',
      assetA: 'BTC',
      targetValue: undefined,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      stake: MIN_STAKE,
      conviction: 50,
      criteriaText: '',
      openToChallenges: true,
      callerSettledCalls: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'targetValue')).toBe(true);
    }
  });
});

describe('no stale 1e6 target conversion remains in the composer', () => {
  const COMPOSER_FILES = [
    'app/new/components/PriceTargetFields.tsx',
    'app/new/components/SpreadVsFields.tsx',
    'app/new/components/PublishConfirmModal.tsx',
  ];

  for (const file of COMPOSER_FILES) {
    test(`${file} routes targetValue through target-scale helpers`, () => {
      const source = read(file);
      expect(source).toContain('target-scale');
      // The old inline 1e6 conversion pattern must be gone from target handling
      expect(source).not.toMatch(/targetValue[\s\S]{0,200}1_000_000/);
    });
  }

  test('preview market line in new/page.tsx uses formatTargetForDisplay', () => {
    const source = read('app/new/page.tsx');
    expect(source).toContain('formatTargetForDisplay(formValues.marketType, formValues.targetValue)');
  });
});

describe('creation-fee disclosure (B7)', () => {
  test('PublishConfirmModal shows the fee line + stake+fee total from CREATION_FEE', () => {
    const source = read('app/new/components/PublishConfirmModal.tsx');
    expect(source).toContain('CREATION_FEE');
    expect(source).toContain('Creation fee');
    expect(source).toContain('Total (stake + fee)');
    // No hardcoded "10" dollars — value derives from the constant
    expect(source).toContain('Number(CREATION_FEE) / 1_000_000');
  });

  test('/new shows the persistent fee note near the stake input', () => {
    const source = read('app/new/page.tsx');
    expect(source).toContain('creation fee at publish');
    expect(source).toContain('CREATION_FEE');
  });
});
