/**
 * target-guard.test.ts — quick-260611-uf9 trivially-true call guard (web layer).
 *
 * V1 settles >= ONLY (SettlementManager.sol:718 — no direction field), so a
 * priceTarget call with targetValue at/below the live current price is a
 * guaranteed CALLED IT = free rep farming. Rule: targetValue STRICTLY ABOVE
 * the current live Pyth price (equality blocked — at-or-above settles a win).
 *
 * D-07 contract: a missing live price (null) SKIPS the client-side check —
 * publish proceeds and the relayer preflight layer enforces. The client never
 * fabricates a price and never blocks on missing data.
 *
 * Source pins (precedent: target-scale.test.ts / chain-pinning.test.ts) lock
 * the wiring: page.tsx lifts usePythPrice + gates onPublish via
 * targetGuardViolation; PriceTargetFields takes price as a PROP (hook removed)
 * and renders the derived targetGuardMessage error.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  targetGuardViolation,
  targetGuardMessage,
} from '../app/new/lib/target-guard';
import { usdToTargetValue } from '../app/new/lib/target-scale';

const WEB_ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(WEB_ROOT, p), 'utf-8');

describe('targetGuardViolation — strict-above rule in 1e8 bigint space', () => {
  test('target BELOW current price violates (guaranteed-win farming)', () => {
    // ETH at $2,500 — "ETH ≥ $37" is a guaranteed CALLED IT
    expect(targetGuardViolation(usdToTargetValue(37), 2500)).toBe(true);
    expect(targetGuardViolation(usdToTargetValue(2000), 2500)).toBe(true);
  });

  test('target EQUAL to current price violates (equality boundary — settles at-or-above)', () => {
    // $2,500 target vs $2,500 live price → already at-or-above → blocked
    expect(targetGuardViolation(250_000_000_000n, 2500)).toBe(true);
  });

  test('target STRICTLY above current price passes (barely-above is a legit coin-flip)', () => {
    // $2,500.01 vs $2,500 — no margin band by design
    expect(targetGuardViolation(usdToTargetValue(2500.01), 2500)).toBe(false);
    expect(targetGuardViolation(usdToTargetValue(5000), 2500)).toBe(false);
  });

  test('null price SKIPS the check (D-07 — relayer layer enforces; never block on missing data)', () => {
    expect(targetGuardViolation(usdToTargetValue(37), null)).toBe(false);
  });

  test('undefined targetValue never violates (empty field is the zod-required path)', () => {
    expect(targetGuardViolation(undefined, 2500)).toBe(false);
  });

  test('comparison happens in 1e8 bigint space (sub-dollar asset precision)', () => {
    // PEPE-class: price $0.00001234 — target $0.00001233 (below) violates,
    // $0.00001235 (above) passes
    expect(targetGuardViolation(1233n, 0.00001234)).toBe(true);
    expect(targetGuardViolation(1235n, 0.00001234)).toBe(false);
  });
});

describe('targetGuardMessage — copy + formatted live price', () => {
  test('contains the formatted price and the strict-above copy', () => {
    const msg = targetGuardMessage(2500);
    expect(msg).toContain('2,500.00');
    expect(msg).toContain('Target must be above the current price');
    expect(msg).toContain('calls settle at-or-above target');
  });
});

describe('composer wiring pins (lifted hook + modal gate + derived inline error)', () => {
  test('page.tsx lifts usePythPrice and gates onPublish via targetGuardViolation', () => {
    const source = read('app/new/page.tsx');
    expect(source).toContain('targetGuardViolation');
    expect(source).toContain('usePythPrice');
  });

  test('PriceTargetFields renders targetGuardMessage and no longer owns the price hook', () => {
    const source = read('app/new/components/PriceTargetFields.tsx');
    expect(source).toContain('targetGuardMessage');
    expect(source).not.toContain('usePythPrice');
  });
});
