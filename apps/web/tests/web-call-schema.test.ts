/**
 * web-call-schema.test.ts — webCreateCallSchema ticker-only form gate
 * (quick-260611-if0, closing the quick-260611-hog finding (2)).
 *
 * Since the AssetSelect dropdown landed (quick-260611-hog), the ONLY
 * UI-producible asset values are the 24 PYTH_FEED_IDS tickers — the form
 * schema now rejects every non-ticker string (0x-64-hex feed id, 0x-40-hex
 * address, numeric, freeform) with LISTED_ASSET_MESSAGE BEFORE preflight.
 *
 * The resolution/parity layer is UNCHANGED: resolveAssetToFeedId's 0x-64-hex
 * passthrough stays intact (pinned in tests/resolve-asset.test.ts) — these
 * tests pin that the FORM gate sits in front of it and rejects the dead path.
 */
import { describe, it, expect } from 'vitest';
import type { CreateCallInput } from '@call-it/shared';
import { PYTH_FEED_IDS } from '@call-it/shared';
import {
  webCreateCallSchema,
  LISTED_ASSET_MESSAGE,
} from '@/app/new/lib/web-call-schema';
import { resolveAssetToFeedId } from '@/app/new/lib/resolve-asset';

/** Valid fixture mirroring the preflight-body tests (expiry in the future). */
function fixture(overrides: Partial<CreateCallInput> = {}): CreateCallInput {
  return {
    marketType: 'priceTarget',
    eventSubtype: 'none',
    category: 'majors',
    assetA: 'ETH',
    assetB: undefined,
    targetValue: 420000000000n,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
    stake: 5000000n,
    conviction: 50,
    criteriaText: '',
    openToChallenges: true,
    parentCallId: undefined,
    callerSettledCalls: 0,
    ...overrides,
  };
}

/** First issue on a given path, or undefined. */
function issueOn(result: ReturnType<typeof webCreateCallSchema.safeParse>, path: string) {
  if (result.success) return undefined;
  return result.error.issues.find((i) => i.path[0] === path);
}

describe('webCreateCallSchema — ticker-only gate (priceTarget/spreadVs)', () => {
  it("priceTarget + 'ETH' passes", () => {
    const result = webCreateCallSchema.safeParse(fixture());
    expect(result.success).toBe(true);
  });

  it("priceTarget + ' eth ' passes (case/trim-insensitive ticker membership)", () => {
    const result = webCreateCallSchema.safeParse(fixture({ assetA: ' eth ' }));
    expect(result.success).toBe(true);
  });

  it('priceTarget + full 0x-64-hex ETH feed id FAILS at the form gate (dead-path pin) while resolveAssetToFeedId still resolves it (lib passthrough intact)', () => {
    const feedId = PYTH_FEED_IDS.ETH;
    // The resolution/parity layer still resolves the raw feed id…
    expect(resolveAssetToFeedId(feedId)).toBe(feedId);
    // …but the FORM gate rejects it: no UI flow produces this input class.
    const result = webCreateCallSchema.safeParse(fixture({ assetA: feedId }));
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it("priceTarget + unknown 'DOGECOIN' fails on assetA with LISTED_ASSET_MESSAGE", () => {
    const result = webCreateCallSchema.safeParse(fixture({ assetA: 'DOGECOIN' }));
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it('spreadVs + unresolvable assetB fails on assetB with LISTED_ASSET_MESSAGE', () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: 'DOGECOIN' }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetB')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it('spreadVs + missing assetB fails on assetB with LISTED_ASSET_MESSAGE', () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: undefined }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetB')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it('hardcoded cross-check: ETH feed id catalogue entry unchanged', () => {
    expect(PYTH_FEED_IDS.ETH).toBe(
      '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    );
  });
});

describe('webCreateCallSchema — ticker-only gate (event)', () => {
  it("event + resolvable symbol 'ETH' passes", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: 'ETH' }),
    );
    expect(result.success).toBe(true);
  });

  it('event + 0x 40-hex collection address FAILS (FLIPPED — no UI flow produces it)', () => {
    const result = webCreateCallSchema.safeParse(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
      }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it("event + numeric string '12345' FAILS (FLIPPED — no UI flow produces it)", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: '12345' }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it("event + freeform 'SomeNewToken' FAILS on assetA with LISTED_ASSET_MESSAGE", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: 'SomeNewToken',
      }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });

  it("event + malformed hex '0xNotHex' FAILS with LISTED_ASSET_MESSAGE", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: '0xNotHex' }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(LISTED_ASSET_MESSAGE);
  });
});

describe('webCreateCallSchema — exported copy', () => {
  it('exports the exact LISTED_ASSET_MESSAGE copy', () => {
    expect(LISTED_ASSET_MESSAGE).toBe('Use a listed asset (BTC, ETH, SOL…)');
  });
});
