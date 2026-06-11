/**
 * web-call-schema.test.ts — webCreateCallSchema event-asset gate (WR-02,
 * quick-260611-bf2 review fixes).
 *
 * Contract-verified premise: CallRegistry._assertAllowlisted
 * (CallRegistry.sol:492-506) runs for ALL market types — for Event, assetA
 * must derive to an allowlisted NFT collection address or feed key, so a
 * freeform event asset (uint derivation 0) is a GUARANTEED on-chain
 * AssetNotAllowlisted revert. The schema gates event assetA to
 * resolvable-or-0x/numeric (the input classes that produce a non-zero uint).
 */
import { describe, it, expect } from 'vitest';
import type { CreateCallInput } from '@call-it/shared';
import { PYTH_FEED_IDS } from '@call-it/shared';
import {
  webCreateCallSchema,
  EVENT_ASSET_MESSAGE,
} from '@/app/new/lib/web-call-schema';
import { UNKNOWN_ASSET_MESSAGE } from '@/app/new/lib/resolve-asset';

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

describe('webCreateCallSchema — event asset gate (WR-02)', () => {
  it("event + resolvable symbol 'ETH' passes", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: 'ETH' }),
    );
    expect(result.success).toBe(true);
  });

  it('event + 0x 40-hex collection address passes (non-zero uint derivation)', () => {
    const result = webCreateCallSchema.safeParse(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
      }),
    );
    expect(result.success).toBe(true);
  });

  it("event + numeric string '12345' passes (non-zero uint derivation)", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: '12345' }),
    );
    expect(result.success).toBe(true);
  });

  it("event + freeform 'SomeNewToken' FAILS on assetA with the exact event copy", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: 'SomeNewToken',
      }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(EVENT_ASSET_MESSAGE);
  });

  it("event + malformed hex '0xNotHex' FAILS (derives to 0n — would revert on-chain)", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'event', eventSubtype: 'tvlMilestone', assetA: '0xNotHex' }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(EVENT_ASSET_MESSAGE);
  });

  it('exports the exact EVENT_ASSET_MESSAGE copy', () => {
    expect(EVENT_ASSET_MESSAGE).toBe('Use a listed asset (BTC, ETH, SOL…)');
  });
});

describe('webCreateCallSchema — pre-existing priceTarget/spreadVs gate still holds', () => {
  it("priceTarget + 'ETH' passes and resolves nothing away (input untouched)", () => {
    const result = webCreateCallSchema.safeParse(fixture());
    expect(result.success).toBe(true);
  });

  it("priceTarget + unknown 'DOGECOIN' fails on assetA with UNKNOWN_ASSET_MESSAGE", () => {
    const result = webCreateCallSchema.safeParse(fixture({ assetA: 'DOGECOIN' }));
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetA')?.message).toBe(UNKNOWN_ASSET_MESSAGE);
  });

  it("spreadVs + unresolvable assetB fails on assetB", () => {
    const result = webCreateCallSchema.safeParse(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: 'DOGECOIN' }),
    );
    expect(result.success).toBe(false);
    expect(issueOn(result, 'assetB')?.message).toBe(UNKNOWN_ASSET_MESSAGE);
  });

  it('hardcoded cross-check: ETH feed id catalogue entry unchanged', () => {
    expect(PYTH_FEED_IDS.ETH).toBe(
      '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
    );
  });
});
