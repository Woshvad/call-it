/**
 * Feed tabs + chips pins — quick-260611-t7h.
 *
 * Pins the restored Following/Duels tabs and the asset-class chip row on the
 * home feed (prototype parity, honestly wired):
 *   - 4 tabs with prototype `.count` badge markup
 *   - Duels tab fetches the REAL `GET /api/duels` and links to /duel/:id
 *   - Following tab hosts FromYourNetworkSections with the QUIET HERE fallback
 *     (and the old Live-tab render is gone)
 *   - Chip row gated to Live/Settled only, filtering via lib/asset-class
 *   - Honesty pins (D-07): no fake counts (the prototype's `count: 12` on
 *     Following stays dead), NFTs/Macro chips stay cut (D-08)
 *
 * Source-assertion style mirrors presentation-sweep.test.ts (node env, no
 * DOM; vitest cwd = apps/web) plus real-module unit pins for asset-class.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSET_CLASS_CHIPS, assetMatchesChip } from '../lib/asset-class';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');
const page = () => read('app', 'page.tsx');

describe('(i) tabs — 4 tabs with prototype count markup', () => {
  it('renders all four tab labels', () => {
    const src = page();
    expect(src).toContain('Live calls');
    expect(src).toContain('Settled');
    expect(src).toContain('Following');
    expect(src).toContain('Duels');
  });

  it('uses the prototype .count badge span (components.jsx ~183)', () => {
    expect(page()).toContain('className="count"');
  });
});

describe('(ii) duels wiring — real endpoint, real links, honest empty', () => {
  it('fetches the real relayer /api/duels endpoint', () => {
    expect(page()).toContain('/api/duels');
  });

  it('rows link to /duel/:challengeId (template literal)', () => {
    expect(page()).toMatch(/\/duel\/\$\{/);
  });

  it('renders the prototype dashed empty block copy', () => {
    expect(page()).toContain('NO LIVE DUELS IN YOUR GRAPH.');
  });
});

describe('(iii) following wiring — network sections moved off the Live tab', () => {
  it('renders FromYourNetworkSections with the fallback prop', () => {
    const src = page();
    expect(src).toContain('FromYourNetworkSections');
    expect(src).toMatch(/<FromYourNetworkSections[\s\S]{0,200}fallback=/);
  });

  it('carries the honest QUIET HERE fallback copy', () => {
    expect(page()).toContain('QUIET HERE.');
  });

  it('no longer renders the sections on the Live tab (09.2 layout superseded)', () => {
    expect(page()).not.toMatch(/activeTab === 'Live' && <FromYourNetworkSections/);
  });
});

describe('(iv) chips — asset-class row gated to Live/Settled', () => {
  it('imports the asset-class lib', () => {
    expect(page()).toMatch(/from ['"](@\/lib\/asset-class|\.\.?\/.*asset-class)['"]/);
  });

  it('renders the prototype chip-row', () => {
    expect(page()).toContain('chip-row');
  });

  it('gates the chip row on the Live/Settled tabs only (co-location pin)', () => {
    expect(page()).toMatch(
      /\(activeTab === 'Live' \|\| activeTab === 'Settled'\)[\s\S]{0,300}chip-row/,
    );
  });
});

describe('(v) asset-class unit pins (real module import)', () => {
  it('membership table behaves per the catalogue', () => {
    expect(assetMatchesChip('BTC', 'Majors')).toBe(true);
    expect(assetMatchesChip('PEPE', 'Memecoins')).toBe(true);
    expect(assetMatchesChip('EIGEN', 'Restaking')).toBe(true);
  });

  it('ARB belongs to BOTH L2s and Arbitrum Eco (membership, not partition)', () => {
    expect(assetMatchesChip('ARB', 'L2s')).toBe(true);
    expect(assetMatchesChip('ARB', 'Arbitrum Eco')).toBe(true);
  });

  it('missing symbol: false for every non-All chip, true for All', () => {
    expect(assetMatchesChip(undefined, 'Majors')).toBe(false);
    expect(assetMatchesChip(undefined, 'All')).toBe(true);
  });

  it('is case-insensitive on the symbol', () => {
    expect(assetMatchesChip('btc', 'Majors')).toBe(true);
  });

  it('catalogue is exactly 7 chips with NFTs/Macro cut (D-08)', () => {
    expect(ASSET_CLASS_CHIPS.length).toBe(7);
    expect(ASSET_CLASS_CHIPS as readonly string[]).not.toContain('NFTs');
    expect(ASSET_CLASS_CHIPS as readonly string[]).not.toContain('Macro');
  });
});

describe('(vi) honesty pin — Following never renders a count (D-07)', () => {
  it("the prototype's fake `count: 12` stays dead", () => {
    expect(page()).not.toContain('count: 12');
  });

  it('tabCount maps Following → null on one greppable line', () => {
    // Pins the literal `'Following'` → null branch from the tabCount helper:
    // Following has no real count source, so the badge span is never rendered.
    expect(page()).toMatch(/'Following'[^\n]*null/);
  });
});
