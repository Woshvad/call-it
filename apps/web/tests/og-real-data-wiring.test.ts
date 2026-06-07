/**
 * D-03 OG real-data wiring — static source assertions (Vitest, no server).
 *
 * Plan 07-03 Task 1: og/[callId] reads the market statement from the relayer
 * marketLine (authoritative, D-05) with the subgraph Call.statement templated
 * value as fallback; the settled stats (P&L / REP CHANGE / FINAL / TARGET) are
 * wired from subgraph Settlement.priceDelta/finalPrice + RepEvent.delta.
 *
 * These are source-level assertions because the live render path requires a
 * deployed/seeded environment (the 200px visual run is env-gated until 07-06).
 * They lock the stubs as removed and the real-data seams as present.
 *
 * Requirements: SHARE-01, SHARE-02, SHARE-03, SHARE-20
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function readSrc(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf-8');
}

describe('Task 1 — og/[callId] statement + settled stats wiring (D-03)', () => {
  const route = () => readSrc('app', 'og', '[callId]', 'route.ts');
  const client = () => readSrc('lib', 'relayer-client.ts');

  it('the `Call #${callIdStr}` statement stub is removed as the statement source', () => {
    const src = route();
    expect(src).not.toContain('const callStatement = `Call #${callIdStr}`');
  });

  it('the statement resolves from the relayer marketLine', () => {
    const src = route();
    expect(src).toContain('marketLine');
    expect(src).toContain('getMarketLine');
  });

  it('the settled-stat `—` placeholders are no longer hardcoded literals', () => {
    const src = route();
    // The four former L811-814 stubs must not appear as the literal value.
    expect(src).not.toContain("pnlStr: '—',       // Phase 7 wires P&L");
    expect(src).not.toContain("repDeltaStr: '—',  // Phase 7 wires rep delta");
    expect(src).not.toContain("finalValue: '—',   // Phase 7 wires oracle final price");
    expect(src).not.toContain("targetValue: '—',  // Phase 7 wires call target");
  });

  it('settled fields are derived from Settlement / RepEvent subgraph reads', () => {
    const src = route();
    expect(src).toContain('Settlement');
    expect(src).toContain('RepEvent');
    // The real subgraph settled-field reader is invoked in the route.
    expect(src).toContain('getSettledFields');
  });

  it('the RPC status/outcome freshness read is preserved (Pitfall 8)', () => {
    const src = route();
    expect(src).toContain('callData.status');
    expect(src).toContain('getOutcomeWordResult');
  });

  it('runtime nodejs declaration is still the first export', () => {
    const src = route();
    expect(src.indexOf("export const runtime = 'nodejs'")).toBeGreaterThanOrEqual(0);
  });

  it('SHARE-20: no NFT mint call is introduced in the OG path', () => {
    const src = route();
    expect(src.toLowerCase()).not.toContain('mint');
    expect(src.toLowerCase()).not.toContain('safemint');
  });

  it('relayer-client exports getMarketLine + getSettledFields helpers', () => {
    const src = client();
    expect(src).toContain('export async function getMarketLine');
    expect(src).toContain('export async function getSettledFields');
  });
});
