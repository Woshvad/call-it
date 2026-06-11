/**
 * resolve-asset.test.ts — unit tests for resolveAssetToFeedId (quick-260611-bf2).
 *
 * BUG 2 regression pins: typed symbols ('ETH', 'eth', ' btc ') must resolve to
 * their Pyth feed id from the shared PYTH_FEED_IDS catalogue; raw 64-hex 0x ids
 * pass through (lowercased); short hex / unknown symbols / empty → null.
 *
 * Asserts against the shared constants PLUS one hardcoded cross-check for ETH
 * so a catalogue regression cannot silently self-validate.
 */
import { describe, it, expect } from 'vitest';
import { PYTH_FEED_IDS } from '@call-it/shared';
import { resolveAssetToFeedId, UNKNOWN_ASSET_MESSAGE } from '@/app/new/lib/resolve-asset';

describe('resolveAssetToFeedId', () => {
  it('hardcoded cross-check: shared ETH feed id is the known Pyth ETH/USD id', () => {
    expect(PYTH_FEED_IDS.ETH).toBe(
      '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    );
  });

  it("resolves 'ETH' to PYTH_FEED_IDS.ETH", () => {
    expect(resolveAssetToFeedId('ETH')).toBe(PYTH_FEED_IDS.ETH);
  });

  it("resolves lowercase 'eth' (case-insensitive)", () => {
    expect(resolveAssetToFeedId('eth')).toBe(PYTH_FEED_IDS.ETH);
  });

  it("resolves padded ' btc ' (trimmed)", () => {
    expect(resolveAssetToFeedId(' btc ')).toBe(PYTH_FEED_IDS.BTC);
  });

  it('passes through a full 0x 64-hex feed id unchanged', () => {
    expect(resolveAssetToFeedId(PYTH_FEED_IDS.ETH)).toBe(PYTH_FEED_IDS.ETH);
  });

  it('lowercases a mixed-case 0x 64-hex feed id', () => {
    const mixed = '0x' + PYTH_FEED_IDS.ETH.slice(2).toUpperCase();
    expect(resolveAssetToFeedId(mixed)).toBe(PYTH_FEED_IDS.ETH);
  });

  it("returns null for short hex '0x1234' (fails the 64-hex regex)", () => {
    expect(resolveAssetToFeedId('0x1234')).toBeNull();
  });

  it("returns null for unknown symbol 'DOGECOIN'", () => {
    expect(resolveAssetToFeedId('DOGECOIN')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveAssetToFeedId('')).toBeNull();
  });

  it('exports the exact UNKNOWN_ASSET_MESSAGE copy', () => {
    expect(UNKNOWN_ASSET_MESSAGE).toBe(
      'Unknown asset — use a listed symbol (BTC, ETH, SOL…) or a Pyth feed id',
    );
  });
});
