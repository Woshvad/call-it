/**
 * live-call-card pins — quick-260611-u1l.
 *
 * Pins the prototype-parity LIVE feed card (LiveCallCard) and its real-data
 * wiring (FollowFadeMarket reserves + ProfileRegistry handle fallback):
 *   - USER CONSTRAINTS 2026-06-11: no stake amount, no verified-criteria
 *     badge anywhere on the live card (grep-proven)
 *   - Honesty pins (D-07): no rep badge artifacts, no fake button counts,
 *     no block-number footer, no challenge counts
 *   - Wiring: /call/:id + /new?quote=:id Links; batched chainId-pinned reads
 *     with zero refetchInterval (Alchemy CU discipline, commit 065729c)
 *   - Odds math: total === 0n ? 50 (exact call-page formula)
 *   - Handle precedence (AUTH-44): displayHandle → handle → on-chain →
 *     truncated address
 *
 * Source-assertion style mirrors presentation-sweep.test.ts (node env, no
 * DOM; vitest cwd = apps/web) plus real-module unit pins for asset-class.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetClassesFor } from '../lib/asset-class';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

const card = () => read('components', 'LiveCallCard.tsx');
const feedList = () => read('components', 'FeedList.tsx');
const hooks = () => read('hooks', 'useFeedMarketData.ts');

describe('(i) existence + routing', () => {
  it('LiveCallCard.tsx exists', () => {
    expect(card().length).toBeGreaterThan(0);
  });

  it('FeedList imports + renders LiveCallCard and keeps the card-enter wrapper', () => {
    const src = feedList();
    expect(src).toContain('LiveCallCard');
    expect(src).toContain('card-enter');
  });
});

describe('(ii) user constraints 2026-06-11 — grep-proven', () => {
  it('no stake amount anywhere on the live card (no uppercase STAKE)', () => {
    expect(card()).not.toMatch(/STAKE/);
  });

  it('no verified-criteria badge (no CRITERIA in any case)', () => {
    expect(card()).not.toMatch(/CRITERIA/i);
  });
});

describe('(iii) honesty pins (D-07) — omitted elements stay omitted', () => {
  it('no rep badge artifacts', () => {
    const src = card();
    expect(src).not.toContain('2,847');
    expect(src).not.toMatch(/REP\s/);
  });

  it('no hardcoded button counts (prototype ·142/·67 were demo data)', () => {
    const src = card();
    expect(src).not.toMatch(/FOLLOW · \d/);
    expect(src).not.toMatch(/FADE · \d/);
  });

  it('no block-number footer literal and no challenge counts', () => {
    const src = card();
    expect(src).not.toContain('block ');
    expect(src).not.toMatch(/challenges/i);
  });
});

describe('(iv) wiring pins — navigation + on-chain reads', () => {
  it('card links to /call/:id and /new?quote=:id', () => {
    const src = card();
    expect(src).toContain('/call/${');
    expect(src).toContain('/new?quote=${');
  });

  it('hooks read real FollowFadeMarket reserves + ProfileRegistry handles', () => {
    const src = hooks();
    expect(src).toContain('followReserve');
    expect(src).toContain('fadeReserve');
    expect(src).toContain('displayHandle');
    expect(src).toContain('FOLLOW_FADE_MARKET_ADDRESS');
    expect(src).toContain('PROFILE_REGISTRY_ADDRESS');
  });

  it('every read is chainId-pinned (RC1) — at least both hook batches', () => {
    expect((hooks().match(/chainId: ACTIVE_CHAIN_ID/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('zero refetchInterval (Alchemy CU discipline — staleTime only)', () => {
    expect(hooks()).not.toMatch(/refetchInterval:\s*\d/);
  });
});

describe('(v) odds math — exact call-page formula', () => {
  it('empty pools render a 50/50 split (total === 0n ? 50)', () => {
    expect(card()).toMatch(/===\s*0n\s*\?\s*50/);
  });
});

describe('(vi) handle precedence (AUTH-44)', () => {
  it('displayHandle → handle → onchainHandle → truncated address, in order', () => {
    expect(card()).toMatch(
      /displayHandle[\s\S]{0,60}\?\?[\s\S]{0,60}onchainHandle[\s\S]{0,60}\?\?[\s\S]{0,60}truncateAddress/,
    );
  });
});

describe('(vii) D-07 gating — odds/pools block hidden without reserves', () => {
  it('the reserves gate precedes the brutal-bar markup', () => {
    const src = card();
    const gateIdx = src.indexOf('reserves &&');
    const barIdx = src.indexOf('brutal-bar split');
    expect(gateIdx).not.toBe(-1);
    expect(barIdx).not.toBe(-1);
    expect(gateIdx).toBeLessThan(barIdx);
  });
});

describe('(viii) assetClassesFor — real-module unit pins', () => {
  it('ARB belongs to both L2s and Arbitrum Eco, in ASSET_CLASS_CHIPS order', () => {
    expect(assetClassesFor('ARB')).toEqual(['L2s', 'Arbitrum Eco']);
  });

  it('BTC → Majors', () => {
    expect(assetClassesFor('BTC')).toEqual(['Majors']);
  });

  it('lowercase btc → Majors (case-insensitive)', () => {
    expect(assetClassesFor('btc')).toEqual(['Majors']);
  });

  it('missing symbol → []', () => {
    expect(assetClassesFor(undefined)).toEqual([]);
  });

  it('unmapped symbol (FET) → []', () => {
    expect(assetClassesFor('FET')).toEqual([]);
  });
});

describe('(ix) C2 parity — expired live card awaits settlement', () => {
  it('renders the amber AWAITING SETTLEMENT state', () => {
    expect(card()).toContain('AWAITING SETTLEMENT');
  });
});

describe('(x) D-08 — no dead controls on awaiting-settlement cards (user 2026-06-11)', () => {
  it('FOLLOW/FADE/CHALLENGE links sit inside the !isAwaitingSettlement gate', () => {
    const src = card();
    const gateIdx = src.indexOf('{!isAwaitingSettlement && (');
    const followIdx = src.indexOf('btn cream');
    const fadeIdx = src.indexOf('btn fade');
    const duelIdx = src.indexOf('btn duel');
    expect(gateIdx).not.toBe(-1);
    expect(gateIdx).toBeLessThan(followIdx);
    expect(followIdx).toBeLessThan(fadeIdx);
    expect(fadeIdx).toBeLessThan(duelIdx);
  });

  it('the quote link stays OUTSIDE the gate (fragment closes between CHALLENGE and quote)', () => {
    const src = card();
    const duelIdx = src.indexOf('btn duel');
    const quoteIdx = src.indexOf('/new?quote=${');
    const fragmentClose = src.indexOf('</>', duelIdx);
    expect(fragmentClose).not.toBe(-1);
    expect(fragmentClose).toBeLessThan(quoteIdx);
  });
});
