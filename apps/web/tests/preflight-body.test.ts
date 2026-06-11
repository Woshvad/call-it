/**
 * preflight-body.test.ts — unit tests for buildPreflightBody (quick-260611-bf2).
 *
 * BUG 1 regression pins: marketType/eventSubtype/category MUST be STRING enums
 * in the preflight body (the relayer 422'd "Expected string, received number"
 * on the old numeric payload).
 *
 * BUG 2 regression pins: typed symbols resolve to Pyth feed ids and the SAME
 * resolved id drives BOTH body.assetA/assetB AND the calldata assetAUint /
 * assetBUint — the dup-hash consistency invariant (relayer assetToUint256
 * recomputes the uint from the body string; calldata must match).
 */
import { describe, it, expect } from 'vitest';
import type { CreateCallInput } from '@call-it/shared';
import { PYTH_FEED_IDS } from '@call-it/shared';
import { buildPreflightBody } from '@/app/new/lib/preflight-body';
import { UNKNOWN_ASSET_MESSAGE } from '@/app/new/lib/resolve-asset';

const CALLER = '0x73047a8854a1A55C28464614c8DBfcd5c4b2E416' as `0x${string}`;

/** Representative valid priceTarget fixture (mirrors the live-proven payload shape). */
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

describe('buildPreflightBody', () => {
  it("priceTarget + 'ETH': string enums + resolved assetA in body AND calldata uint", () => {
    const result = buildPreflightBody(fixture(), CALLER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // BUG 1 regression pin — STRING enums on the wire
    expect(result.body.marketType).toBe('priceTarget');
    expect(typeof result.body.marketType).toBe('string');
    expect(result.body.eventSubtype).toBe('none');
    expect(result.body.category).toBe('majors');

    // BUG 2 regression pin — resolved feed id, consistent body/calldata
    expect(result.body.assetA).toBe(PYTH_FEED_IDS.ETH);
    expect(result.assetAUint).toBe(BigInt(PYTH_FEED_IDS.ETH));
    expect(result.assetBUint).toBe(0n);

    // Scalar passthrough
    expect(result.body.targetValue).toBe('420000000000');
    expect(result.body.stake).toBe('5000000');
    expect(typeof result.body.expiry).toBe('number');
    expect(result.body.callerAddress).toBe(CALLER);
  });

  it("priceTarget + unknown 'DOGECOIN': ok:false on assetA with the exact message", () => {
    const result = buildPreflightBody(fixture({ assetA: 'DOGECOIN' }), CALLER);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('assetA');
    expect(result.message).toBe(UNKNOWN_ASSET_MESSAGE);
  });

  it("spreadVs + 'BTC'/'eth': both assets resolved, assetBUint from resolved assetB", () => {
    const result = buildPreflightBody(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: 'eth' }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.assetA).toBe(PYTH_FEED_IDS.BTC);
    expect(result.body.assetB).toBe(PYTH_FEED_IDS.ETH);
    expect(result.assetAUint).toBe(BigInt(PYTH_FEED_IDS.BTC));
    expect(result.assetBUint).toBe(BigInt(PYTH_FEED_IDS.ETH));
  });

  it('spreadVs + assetB undefined: ok:false on assetB', () => {
    const result = buildPreflightBody(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: undefined }),
      CALLER,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('assetB');
    expect(result.message).toBe(UNKNOWN_ASSET_MESSAGE);
  });

  it("spreadVs + unresolvable assetB 'DOGECOIN': ok:false on assetB", () => {
    const result = buildPreflightBody(
      fixture({ marketType: 'spreadVs', assetA: 'BTC', assetB: 'DOGECOIN' }),
      CALLER,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.field).toBe('assetB');
  });

  it("event + non-feed asset 'SomeNewToken': raw passthrough, assetAUint 0n (relayer parity)", () => {
    const result = buildPreflightBody(
      fixture({
        marketType: 'event',
        eventSubtype: 'cexListing',
        assetA: 'SomeNewToken',
        criteriaText:
          'Resolves YES if SomeNewToken is listed for spot trading on Binance before expiry.',
      }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.assetA).toBe('SomeNewToken');
    expect(result.assetAUint).toBe(0n);
    expect(result.body.eventSubtype).toBe('cexListing');
  });

  it("event + NFT collection address (0x 40-hex): raw passthrough, assetAUint = BigInt(address) (CR-01 relayer parity)", () => {
    const nftAddress = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
    const result = buildPreflightBody(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: nftAddress,
      }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 40-hex is NOT a feed id (64-hex) — raw passthrough on the wire...
    expect(result.body.assetA).toBe(nftAddress);
    // ...and the calldata uint mirrors relayer assetToUint256 (0x → BigInt),
    // NOT 0n — address(0) is never allowlisted; the prior 0n fallback was a
    // guaranteed AssetNotAllowlisted revert for allowlisted collections.
    expect(result.assetAUint).toBe(BigInt(nftAddress));
    expect(result.assetAUint).not.toBe(0n);
  });

  it("event + numeric string '12345': assetAUint 12345n (CR-01 relayer parity)", () => {
    const result = buildPreflightBody(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: '12345',
      }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.assetA).toBe('12345');
    expect(result.assetAUint).toBe(12345n);
  });

  it("event + malformed hex '0xNotHex': assetAUint 0n WITHOUT throwing (web-side hex validation)", () => {
    // Deliberate divergence from the relayer (whose bare BigInt('0xNotHex')
    // throws → 500 server-side): the web validates hex chars first.
    const result = buildPreflightBody(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: '0xNotHex',
      }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.assetA).toBe('0xNotHex');
    expect(result.assetAUint).toBe(0n);
  });

  it("event + resolvable asset 'ETH': best-effort resolution to the feed id", () => {
    const result = buildPreflightBody(
      fixture({
        marketType: 'event',
        eventSubtype: 'tvlMilestone',
        assetA: 'ETH',
      }),
      CALLER,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body.assetA).toBe(PYTH_FEED_IDS.ETH);
    expect(result.assetAUint).toBe(BigInt(PYTH_FEED_IDS.ETH));
  });

  it("parentCallId 5n → '5'; undefined stays undefined", () => {
    const withParent = buildPreflightBody(fixture({ parentCallId: 5n }), CALLER);
    expect(withParent.ok).toBe(true);
    if (withParent.ok) {
      expect(withParent.body.parentCallId).toBe('5');
    }

    const withoutParent = buildPreflightBody(fixture(), CALLER);
    expect(withoutParent.ok).toBe(true);
    if (withoutParent.ok) {
      expect(withoutParent.body.parentCallId).toBeUndefined();
    }
  });
});
