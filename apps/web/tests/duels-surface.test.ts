/**
 * Duels-surface pins — quick-260611-ust.
 *
 * Pins the rich duels surface (user request 2026-06-11): shared duels-client
 * wire source, the at-a-glance DuelCard (honesty gates per D-07), the tabbed
 * /duels page (Live/Settled + DUEL KING banner), the feed Duels-tab rewiring,
 * and the one-shot capped enrichment hook (zero polling).
 *
 * Source-assertion style mirrors presentation-sweep.test.ts (node env, no DOM;
 * vitest cwd = apps/web) plus real-module unit pins for the lifted helpers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatUsdc, truncateAddress, gradFor } from '../lib/duels-client';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

const client = () => read('lib', 'duels-client.ts');
const card = () => read('components', 'DuelCard.tsx');
const duelsPage = () => read('app', 'duels', 'page.tsx');
const feedPage = () => read('app', 'page.tsx');
const hook = () => read('hooks', 'useDuelEnrichment.ts');

describe('(i) duels-client — single wire source', () => {
  it('hits the real /api/duels list endpoint with the optional status filter', () => {
    const src = client();
    expect(src).toContain('/api/duels');
    expect(src).toContain('?status=');
  });

  it('enriches per duel from /api/duels/:id/live-state', () => {
    const src = client();
    expect(src).toContain('live-state');
    expect(src).toContain('fetchDuelEnrichment');
  });

  it('merges the existing getMarketLine helper (no client-side line builder)', () => {
    expect(client()).toContain('getMarketLine');
    expect(client()).toMatch(/from ['"]\.\/relayer-client['"]/);
  });

  it('maps wire fields defensively (String/Boolean per field)', () => {
    const src = client();
    expect(src).toContain('String(');
    expect(src).toContain('Boolean(');
  });

  it('never throws — fetchDuels and fetchDuelEnrichment both degrade to null', () => {
    const src = client();
    const fetchDuelsRegion = src.slice(src.indexOf('export async function fetchDuels'), src.indexOf('export type DuelEnrichment'));
    const enrichmentRegion = src.slice(src.indexOf('export async function fetchDuelEnrichment'));
    expect(fetchDuelsRegion).toContain('catch');
    expect(enrichmentRegion).toContain('catch');
  });
});

describe('(ii) DuelCard — at-a-glance card with honest gating (D-07)', () => {
  it('whole card links to /duel/:challengeId (template literal)', () => {
    expect(card()).toMatch(/\/duel\/\$\{/);
  });

  it('WINNER row is gated behind the Settled status (index-order pin)', () => {
    const src = card();
    // The showWinner gate (Settled + non-zero winner) must precede the rendered
    // WINNER pill — index over CODE anchors, not the header comment.
    const gateIdx = src.indexOf('const showWinner =');
    expect(gateIdx).toBeGreaterThan(-1);
    const settledGateIdx = src.indexOf("duel.status === 'Settled'", gateIdx);
    const winnerRenderIdx = src.indexOf('pill win">WINNER');
    expect(settledGateIdx).toBeGreaterThan(-1);
    expect(winnerRenderIdx).toBeGreaterThan(-1);
    expect(settledGateIdx).toBeLessThan(winnerRenderIdx);
  });

  it('accept window is 24h citing ChallengeEscrow.sol', () => {
    const src = card();
    expect(src).toContain('24 * 60 * 60');
    expect(src).toContain('ChallengeEscrow');
  });

  it('renders all three status-dependent clock states', () => {
    const src = card();
    expect(src).toContain('ACCEPT WINDOW');
    expect(src).toContain('CALL CLOSES IN');
    expect(src).toContain('AWAITING SETTLEMENT');
  });

  it('consensus bar uses the duel-variant split children with the 0n guard', () => {
    const src = card();
    expect(src).toContain('className="caller"');
    expect(src).toContain('className="challenger"');
    expect(src).toMatch(/===\s*0n\s*\?\s*50/);
  });

  it('no hardcoded handles, no fake counts (D-07 honesty)', () => {
    const src = card();
    // No @-handle literals baked into the card source.
    expect(src).not.toMatch(/['"`]@\w+['"`]/);
    // No prototype-style fake count literals (e.g. 'FOLLOW · 142').
    expect(src).not.toMatch(/FOLLOW · \d/);
    expect(src).not.toMatch(/· \d+ ?<\//);
  });
});

describe('(iii) /duels page — tabs, DUEL KING banner, card lists', () => {
  it('imports the shared duels-client and DuelCard modules', () => {
    const src = duelsPage();
    expect(src).toContain('duels-client');
    expect(src).toContain('DuelCard');
  });

  it('has tape-parity Live/Settled tabs with count chips', () => {
    const src = duelsPage();
    expect(src).toContain('Live duels');
    expect(src).toContain('Settled duels');
    expect(src).toContain('className="count"');
  });

  it('feeds the settled tab from a SEPARATE fetchDuels(Settled) call', () => {
    expect(duelsPage()).toMatch(/fetchDuels\(\s*'Settled'\s*\)/);
  });

  it('surfaces the duelKing wire field as a null-gated DUEL KING banner', () => {
    const src = duelsPage();
    expect(src).toContain('DUEL KING');
    expect(src).toMatch(/duelKing\s*(&&|\?)/);
  });

  it('keeps the live-tab NO DUELS YET copy and adds the settled empty state', () => {
    const src = duelsPage();
    expect(src).toContain('NO DUELS YET');
    expect(src).toContain('NO SETTLED DUELS YET.');
  });
});

describe('(iv) feed Duels tab — shared modules, preserved empty state', () => {
  it('imports DuelCard and duels-client (local copies deleted)', () => {
    const src = feedPage();
    expect(src).toContain('DuelCard');
    expect(src).toContain('duels-client');
    expect(src).not.toContain('DuelRowLink({');
    expect(src).not.toContain('type DuelTabRow =');
  });

  it("keeps the dashed 'NO LIVE DUELS IN YOUR GRAPH.' empty block", () => {
    expect(feedPage()).toContain('NO LIVE DUELS IN YOUR GRAPH.');
  });
});

describe('(v) useDuelEnrichment — one-shot, capped, zero polling', () => {
  it('caps the enrichment burst at 20 with a documenting comment', () => {
    const src = hook();
    expect(src).toMatch(/\b20\b/);
    expect(src).toContain('ENRICHMENT_CAP');
    // The cap comment documents the bound + the D-07 degrade contract.
    expect(src).toMatch(/first 20|≤50|bounded/);
  });

  it('has NO polling primitives (the only interval timer is DuelCard countdown)', () => {
    const src = hook();
    expect(src).not.toContain('refetchInterval');
    expect(src).not.toContain('setInterval');
  });
});

describe('(vi) lifted helpers — real-module unit pins', () => {
  it('formatUsdc renders 6dp USDC base units as dollars', () => {
    expect(formatUsdc('10000000')).toBe('$10');
    expect(formatUsdc('1500000')).toBe('$1.5');
    expect(formatUsdc('not-a-number')).toBe('—');
  });

  it('truncateAddress falls back to first-6…last-4', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678')).toBe('0x1234…5678');
    expect(truncateAddress('')).toBe('—');
  });

  it('gradFor returns a deterministic avatar-grad class', () => {
    const a = gradFor('someone');
    expect(a).toMatch(/^avatar-grad-[a-f]$/);
    expect(gradFor('someone')).toBe(a);
  });
});
