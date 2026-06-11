/**
 * settled-tape-card.test.ts — quick-260611-tbc (Settled-tab tape card redesign).
 *
 * Source-assert style (live-call-share.test.ts convention — node env, no DOM)
 * pinning the web wiring for the prototype settled treatment:
 *   1. Wire contract: FeedItem carries the ADDITIVE optional settledAt /
 *      repDelta / finalPct fields (absent until the relayer Fly redeploy).
 *   2. Mapping pass-through: FeedList maps the fields into CallCardData and
 *      computes finalNA ONLY when the enrichment is live (settledAt present)
 *      AND the market type semantically has no final price (1/2) — a
 *      marketType-0 item missing finalPct omits the block (absent ≠ N/A, D-07).
 *   3. Share-path parity: the EXACT /call/[id] settled share recipe
 *      (page.tsx:1867-1882) — env-gated NEXT_PUBLIC_OG_BASE_URL +
 *      twitterIntentUrl + buildShareText from '@call-it/shared', with the RAW
 *      handle candidate (never truncateAddress output) so isRealHandle can
 *      filter 0x/#N fakes.
 *   4. Degradation honesty (real import): buildShareText never emits a fake
 *      @0x mention for the feed card's inputs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShareText } from '../lib/share-text.js';

const relayerClientSrc = readFileSync(
  join(process.cwd(), 'lib', 'relayer-client.ts'),
  'utf-8',
);
const feedListSrc = readFileSync(
  join(process.cwd(), 'components', 'FeedList.tsx'),
  'utf-8',
);

describe('quick-260611-tbc — Test 1: FeedItem wire contract (additive settled fields)', () => {
  it('FeedItem declares optional settledAt, repDelta, finalPct', () => {
    const ifaceStart = relayerClientSrc.indexOf('export interface FeedItem');
    expect(ifaceStart).toBeGreaterThan(-1);
    // The interface block ends at the next top-level interface/export.
    const ifaceEnd = relayerClientSrc.indexOf('export interface', ifaceStart + 1);
    const iface = relayerClientSrc.slice(ifaceStart, ifaceEnd);
    expect(iface).toMatch(/settledAt\?:\s*number/);
    expect(iface).toMatch(/repDelta\?:\s*number/);
    expect(iface).toMatch(/finalPct\?:\s*number/);
  });
});

describe('quick-260611-tbc — Test 2: FeedList mapping pass-through', () => {
  it('passes settledAt/repDelta/finalPct/finalNA into the card data', () => {
    expect(feedListSrc).toMatch(/settledAt:/);
    expect(feedListSrc).toMatch(/repDelta:/);
    expect(feedListSrc).toMatch(/finalPct:/);
    expect(feedListSrc).toMatch(/finalNA:/);
  });

  it('computes finalNA only when settledAt is present AND marketType is 1 or 2', () => {
    // Pin the guarded expression: the finalNA derivation must reference BOTH
    // the live-enrichment signal (settledAt) and the semantic market types.
    const idx = feedListSrc.indexOf('finalNA:');
    expect(idx).toBeGreaterThan(-1);
    const expr = feedListSrc.slice(idx, idx + 400);
    expect(expr).toContain('settledAt');
    expect(expr).toMatch(/marketType\s*===\s*1/);
    expect(expr).toMatch(/marketType\s*===\s*2/);
  });
});

describe('quick-260611-tbc — Test 3: share-path parity with /call/[id] (D-08 env gate)', () => {
  it('builds the share intent via the shared pure builders, env-gated', () => {
    expect(feedListSrc).toContain('NEXT_PUBLIC_OG_BASE_URL');
    expect(feedListSrc).toContain('twitterIntentUrl(');
    expect(feedListSrc).toContain('buildShareText(');
    // Receipt URL construction: `${ogBase}/call/${item.id}` template form.
    expect(feedListSrc).toMatch(/\/call\/\$\{/);
  });

  it("imports the builders from '@call-it/shared'", () => {
    expect(feedListSrc).toMatch(
      /import\s*\{[^}]*twitterIntentUrl[^}]*\}\s*from\s*'@call-it\/shared'/s,
    );
    expect(feedListSrc).toMatch(
      /import\s*\{[^}]*buildShareText[^}]*\}\s*from\s*'@call-it\/shared'/s,
    );
  });

  it('the RAW handle candidate (displayHandle ?? handle) reaches buildShareText — never truncateAddress output', () => {
    // Locate the CALL site (skip the import specifier match).
    const callIdx = feedListSrc.indexOf('buildShareText({');
    expect(callIdx).toBeGreaterThan(-1);
    const callEnd = feedListSrc.indexOf('})', callIdx);
    expect(callEnd).toBeGreaterThan(callIdx);
    const callExpr = feedListSrc.slice(callIdx, callEnd + 2);
    expect(callExpr).toMatch(/displayHandle\s*\?\?/);
    expect(callExpr).not.toContain('truncateAddress');
  });
});

describe('quick-260611-tbc — Test 4: degradation honesty (real builder import)', () => {
  it('an address-only caller never becomes a fake @0x mention', () => {
    const text = buildShareText({
      outcomeWord: 'LOUD AND WRONG',
      handle: '0x73047a88…ced',
      statement: 'ETH ≥ $1,000,000',
    });
    expect(text).toContain('LOUD AND WRONG');
    expect(text).not.toContain('@0x');
  });
});
