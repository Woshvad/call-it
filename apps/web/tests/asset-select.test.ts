/**
 * asset-select.test.ts — catalog-drift guard (quick-260611-hog).
 *
 * ASSET_GROUPS (the composer dropdown catalog) must flatten to EXACTLY the
 * 24 PYTH_FEED_IDS keys: every allowlisted symbol present, nothing extra,
 * no duplicates, in the six expected category groups. The `readonly
 * AssetSymbol[]` typing makes drift a compile error; this test guards
 * set equality at runtime in case the keyspace and groups diverge.
 *
 * Requirement: CALL-06, UI-02
 */

import { describe, test, expect } from 'vitest';
import { ASSET_GROUPS } from '../app/new/components/AssetSelect';
import { PYTH_FEED_IDS } from '@call-it/shared';

const flattened = ASSET_GROUPS.flatMap((g) => [...g.symbols]);

describe('ASSET_GROUPS catalog-drift guard', () => {
  test('flattens to exactly 24 symbols with no duplicates', () => {
    expect(flattened).toHaveLength(24);
    expect(new Set(flattened).size).toBe(24);
  });

  test('set-equals the PYTH_FEED_IDS keys (every key present, nothing extra)', () => {
    const feedKeys = Object.keys(PYTH_FEED_IDS);
    expect(feedKeys).toHaveLength(24);
    expect(new Set(flattened)).toEqual(new Set(feedKeys));
  });

  test('group labels match the six expected categories in order', () => {
    expect(ASSET_GROUPS.map((g) => g.label)).toEqual([
      'Majors',
      'L2s',
      'DeFi',
      'Restaking & LSTs',
      'Memes',
      'AI & RWA',
    ]);
  });
});
