/**
 * duel-page-data.test.ts — quick-260611-vob source-assertion + real-module pins.
 *
 * The duel page's prototype markup is wired to REAL data sources:
 *   - duelist profiles ×2 (useProfile — handles AS STORED, rep, accuracy, verified)
 *   - call live-state reuse (marketLine/assetSymbol from the SAME riders fetch)
 *   - on-chain CallRegistry.getCall (chainId-pinned) → PYTH_FEED_IDS inversion
 * User constraint 2026-06-11: win-streak and in-category surfaces REMOVED.
 * D-07: every slot real or hidden — never faked ('—/—' pair, 0% accuracy).
 *
 * Style matches presentation-sweep.test.ts (source-assert, node env, no DOM)
 * plus real-module unit pins for lib/feed-symbols.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedIdToSymbol } from '../lib/feed-symbols';
import { PYTH_FEED_IDS } from '@call-it/shared';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

const pageSrc = () => read('app', 'duel', '[challengeId]', 'page.tsx');
const abiSrc = () => read('lib', 'abis', 'CallRegistry.ts');
const feedSymbolsSrc = () => read('lib', 'feed-symbols.ts');

describe('wiring — real data sources reach the duel page', () => {
  it('page calls useProfile for BOTH duelists (caller + challenger)', () => {
    const src = pageSrc();
    expect(src).toContain("from '@/hooks/useProfile'");
    expect(src).toContain('useProfile(callerAddrForProfile)');
    expect(src).toContain('useProfile(challengerAddrForProfile)');
  });

  it("page imports '@/lib/feed-symbols' and derives both symbols", () => {
    const src = pageSrc();
    expect(src).toContain("from '@/lib/feed-symbols'");
    expect(src).toContain('feedIdToSymbol(onChainCall.assetA)');
    expect(src).toContain('feedIdToSymbol(onChainCall.assetB)');
  });

  it('getCall read is chainId-pinned, gated on callId > 0n, staleTime 60s, in ONE callsite region', () => {
    const src = pageSrc();
    const callsiteStart = src.indexOf("functionName: 'getCall'");
    expect(callsiteStart).toBeGreaterThan(-1);
    // Inspect the surrounding useReadContract block (±600 chars covers it)
    const region = src.slice(Math.max(0, callsiteStart - 600), callsiteStart + 600);
    expect(region).toContain('chainId: ACTIVE_CHAIN_ID');
    expect(region).toContain('CALL_REGISTRY_ADDRESS');
    expect(region).toContain('enabled: callId > 0n');
    expect(region).toContain('staleTime: 60_000');
    // No polling on an immutable post-creation read
    expect(region).not.toContain('refetchInterval');
  });

  it('lib/abis/CallRegistry.ts carries the getCall fragment mirroring the relayer canon', () => {
    const src = abiSrc();
    expect(src).toContain("name: 'getCall'");
    expect(src).toContain("{ name: 'assetA', type: 'uint256' }");
    expect(src).toContain("{ name: 'assetB', type: 'uint256' }");
    expect(src).toContain("{ name: 'parentCallId', type: 'uint256' }");
    expect(src).toContain('call-enrichment.ts:40-74');
  });

  it('marketLine + assetSymbol ride the EXISTING call live-state fetch (zero new requests)', () => {
    const src = pageSrc();
    expect(src).toContain('marketLine');
    expect(src).toContain('assetSymbol');
    // Exactly one /api/calls/:id/live-state fetch exists in the page
    const matches = src.match(/\/api\/calls\/\$\{callId\}\/live-state/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe('user constraint 2026-06-11 — win-streak + in-category are GONE', () => {
  it("no 'win streak' rendering or fields anywhere (case-insensitive)", () => {
    const src = pageSrc();
    expect(src).not.toMatch(/win streak/i);
    expect(src).not.toContain('callerStreak');
    expect(src).not.toContain('challengerStreak');
  });

  it('no IN CATEGORY column or category-accuracy fields', () => {
    const src = pageSrc();
    expect(src).not.toContain('In category');
    expect(src).not.toContain('IN CATEGORY');
    expect(src).not.toContain('callerCategoryAccuracy');
    expect(src).not.toContain('challengerCategoryAccuracy');
  });
});

describe('honesty gates (D-07) — real or hidden, never faked', () => {
  it('ACCURACY renders only when settledCalls > 0 (never 0% from no data)', () => {
    expect(pageSrc()).toMatch(/settledCalls\s*>\s*0/);
  });

  it("challenger POSITION is the literal duel semantic 'TAKES THE OTHER SIDE.'", () => {
    expect(pageSrc()).toContain('TAKES THE OTHER SIDE.');
  });

  it("the '—/—' wire-pair fallback is dead — no liveState.assetA/assetB renders", () => {
    const src = pageSrc();
    expect(src).not.toContain('liveState.assetA');
    expect(src).not.toContain('liveState.assetB');
  });

  it('LIVE SPREAD stat stays unrendered (D-07 comment may mention it, JSX must not)', () => {
    expect(pageSrc()).not.toContain('>LIVE SPREAD<');
  });

  it('SETTLES IN carries the honest oracle sub for both Pyth and Event markets', () => {
    const src = pageSrc();
    expect(src).toContain('PYTH ORACLE');
    expect(src).toContain('ATTESTED EVENT');
  });
});

describe('identity — profile-backed handles, pills, rep chips (D-14/AUTH-44)', () => {
  it('verified pills gated on profile.verifiedX / profile.verifiedFc', () => {
    const src = pageSrc();
    expect(src).toContain('verifiedX');
    expect(src).toContain('verifiedFc');
    expect(src).toContain('VERIFIED · X');
    expect(src).toContain('VERIFIED · FC');
  });

  it('rep chip + REP stat gated on Number.isFinite(globalRep)', () => {
    const src = pageSrc();
    expect(src).toContain('Number.isFinite(callerProfile.globalRep)');
    expect(src).toContain('Number.isFinite(challengerProfile.globalRep)');
  });

  it("handles render AS STORED — the profile-backed display handle gates on source !== 'truncated'", () => {
    expect(pageSrc()).toMatch(/source\s*!==\s*'truncated'/);
  });
});

describe('feed-symbols.ts — real-module unit pins (canon replica)', () => {
  it('module cites the relayer canon and inverts PYTH_FEED_IDS', () => {
    const src = feedSymbolsSrc();
    expect(src).toContain('call-enrichment');
    expect(src).toContain('PYTH_FEED_IDS');
    expect(src).toContain("padStart(64, '0')");
  });

  it('the BTC feed id (as on-chain bigint) maps back to BTC', () => {
    expect(feedIdToSymbol(BigInt(PYTH_FEED_IDS.BTC))).toBe('BTC');
  });

  it('the ARB and OP feed ids resolve (the duel hero pair path)', () => {
    expect(feedIdToSymbol(BigInt(PYTH_FEED_IDS.ARB))).toBe('ARB');
    expect(feedIdToSymbol(BigInt(PYTH_FEED_IDS.OP))).toBe('OP');
  });

  it('0n → undefined (no asset)', () => {
    expect(feedIdToSymbol(0n)).toBeUndefined();
  });

  it('unknown id → undefined — degrade, never guess (D-07)', () => {
    expect(feedIdToSymbol(1n)).toBeUndefined();
  });
});
