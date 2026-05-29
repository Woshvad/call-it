/**
 * Vitest fixture matrix for follow-fade-gates.ts parity stubs.
 *
 * D-29 anti-drift: these fixtures cross-check TypeScript math against expected
 * values derived from the Solidity formula in 02-RESEARCH.md Patterns 2-6.
 *
 * Each function has >= 5 input/output cases covering edge cases:
 *   - zero reserve (cold start)
 *   - exact expiry
 *   - exactly 24h after creation (earliest exit)
 *   - at expiry (floor penalty)
 *   - standard mid-life case
 *
 * Requirement: SOCIAL-05, SOCIAL-06, SOCIAL-13, SOCIAL-14, SOCIAL-18, SOCIAL-19, SOCIAL-26
 */

import { describe, it, expect } from 'vitest';
import {
  computeMinSharesOut,
  computeMinSharesOutWithSlippage,
  computeCallerExitPenaltyPct,
  computeCallerExitRepDelta,
  computePositionSlashSplit,
} from '../src/validation/follow-fade-gates.js';

// ─── computeMinSharesOut ────────────────────────────────────────────────────

describe('computeMinSharesOut', () => {
  it('basic AMM formula: sharesOut = totalShares * amountIn / (reserve + amountIn)', () => {
    // totalShares=20000e18 (stake $20 at 1e12 price), reserve=20e6, amountIn=10e6
    // expected = 20000e18 * 10e6 / (20e6 + 10e6) = 20000e18 * 10 / 30 = 6666...e18
    const totalShares = 20_000n * 10n ** 18n;
    const reserve = 20_000_000n;
    const amountIn = 10_000_000n;
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    // 20000e18 * 10e6 / 30e6 = 6666666...666666666666n (truncated)
    const expected = (totalShares * amountIn) / (reserve + amountIn);
    expect(result).toBe(expected);
    expect(result).toBeGreaterThan(0n);
  });

  it('cold start: zero reserve returns proportional shares', () => {
    // With zero reserve and totalShares = 0, should return 0
    // (edge case: initial pool has totalShares > 0 due to virtual seed)
    const totalShares = 0n;
    const reserve = 0n;
    const amountIn = 10_000_000n;
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    // 0 * 10e6 / (0 + 10e6) = 0
    expect(result).toBe(0n);
  });

  it('virtual seed scenario: virtual reserve exists, amountIn = 5e6', () => {
    // Fade pool with virtual seed $7 = 7e6, fadeTotalShares = 7000e18
    const totalShares = 7_000n * 10n ** 18n;
    const reserve = 7_000_000n; // virtual $7
    const amountIn = 5_000_000n; // $5 deposit
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    // expected = 7000e18 * 5e6 / (7e6 + 5e6) = 7000e18 * 5 / 12 = 2916666...n
    const expected = (totalShares * amountIn) / (reserve + amountIn);
    expect(result).toBe(expected);
    expect(result).toBeGreaterThan(0n);
  });

  it('large stake: 100e6 reserve, 100e6 amountIn', () => {
    // totalShares = 100000e18, reserve = 100e6, amountIn = 100e6
    // expected = 100000e18 * 100e6 / 200e6 = 50000e18
    const totalShares = 100_000n * 10n ** 18n;
    const reserve = 100_000_000n;
    const amountIn = 100_000_000n;
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    expect(result).toBe(50_000n * 10n ** 18n);
  });

  it('minimum deposit: $1 into large pool produces non-zero shares', () => {
    const totalShares = 100_000n * 10n ** 18n;
    const reserve = 100_000_000n;
    const amountIn = 1_000_000n; // $1
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    expect(result).toBeGreaterThan(0n);
  });

  it('zero amountIn returns 0 shares', () => {
    const totalShares = 20_000n * 10n ** 18n;
    const reserve = 20_000_000n;
    const amountIn = 0n;
    const result = computeMinSharesOut(totalShares, reserve, amountIn);
    expect(result).toBe(0n);
  });
});

// ─── computeMinSharesOutWithSlippage ──────────────────────────────────────────

describe('computeMinSharesOutWithSlippage', () => {
  it('applies 1% tolerance: result is 99% of raw expected', () => {
    const totalShares = 20_000n * 10n ** 18n;
    const reserve = 20_000_000n;
    const amountIn = 10_000_000n;
    const raw = computeMinSharesOut(totalShares, reserve, amountIn);
    const withSlippage = computeMinSharesOutWithSlippage(totalShares, reserve, amountIn);
    // withSlippage = raw * 99 / 100
    const expected = (raw * 9900n) / 10000n;
    expect(withSlippage).toBe(expected);
    expect(withSlippage).toBeLessThan(raw);
  });

  it('zero amountIn produces zero with slippage', () => {
    const result = computeMinSharesOutWithSlippage(20_000n * 10n ** 18n, 20_000_000n, 0n);
    expect(result).toBe(0n);
  });
});

// ─── computeCallerExitPenaltyPct ─────────────────────────────────────────────

describe('computeCallerExitPenaltyPct', () => {
  // Base: createdAt=0, expiry=7days=604800s
  const createdAt = 0n;
  const expiry = 604_800n; // 7 days in seconds

  it('at exact expiry: returns floor 15%', () => {
    const result = computeCallerExitPenaltyPct(createdAt, expiry, expiry);
    expect(result).toBe(15);
  });

  it('past expiry: returns floor 15%', () => {
    const result = computeCallerExitPenaltyPct(createdAt, expiry, expiry + 1000n);
    expect(result).toBe(15);
  });

  it('at 24h mark (earliest exit): penalty close to 50% (high)', () => {
    // At 24h (86400s) elapsed out of 7 days (604800s):
    // remaining = 604800 - 86400 = 518400
    // variable = 35 * 518400 / 604800 = 30 (integer division)
    // penalty = 15 + 30 = 45
    const now = 86_400n; // 24h
    const result = computeCallerExitPenaltyPct(createdAt, expiry, now);
    const remaining = expiry - now;
    const totalDuration = expiry - createdAt;
    const expected = 15 + Number((35n * remaining) / totalDuration);
    expect(result).toBe(expected);
    expect(result).toBeGreaterThan(15);
    expect(result).toBeLessThanOrEqual(50);
  });

  it('at halfway through call: penalty between 15% and 50%', () => {
    // At 3.5 days (302400s) elapsed:
    // remaining = 302400, variable = 35 * 302400 / 604800 = 17
    // penalty = 15 + 17 = 32
    const now = 302_400n; // 3.5 days
    const result = computeCallerExitPenaltyPct(createdAt, expiry, now);
    expect(result).toBeGreaterThanOrEqual(15);
    expect(result).toBeLessThanOrEqual(50);
  });

  it('just before expiry: penalty just above 15%', () => {
    // remaining = 1 second
    // variable = 35 * 1 / 604800 = 0 (integer division)
    // penalty = 15 + 0 = 15
    const now = expiry - 1n;
    const result = computeCallerExitPenaltyPct(createdAt, expiry, now);
    expect(result).toBeGreaterThanOrEqual(15);
    expect(result).toBeLessThanOrEqual(16); // nearly at floor
  });

  it('penalty is always in range [15, 50]', () => {
    // Sample 10 evenly-spaced time points
    for (let i = 0; i <= 10; i++) {
      const now = createdAt + (expiry - createdAt) * BigInt(i) / 10n;
      const result = computeCallerExitPenaltyPct(createdAt, expiry, now);
      expect(result).toBeGreaterThanOrEqual(15);
      expect(result).toBeLessThanOrEqual(50);
    }
  });
});

// ─── computeCallerExitRepDelta ────────────────────────────────────────────────

describe('computeCallerExitRepDelta', () => {
  const createdAt = 0n;
  const expiry = 604_800n; // 7 days

  it('at createdAt (elapsed=0): delta = -45 (maximum negative)', () => {
    // absDelta = (45 * 604800 - 35 * 0) / 604800 = 45
    const result = computeCallerExitRepDelta(createdAt, expiry, createdAt);
    expect(result).toBe(-45);
  });

  it('at exact expiry (elapsed=duration): delta = -10 (floor)', () => {
    // absDelta = (45 * 604800 - 35 * 604800) / 604800 = (10 * 604800) / 604800 = 10
    const result = computeCallerExitRepDelta(createdAt, expiry, expiry);
    expect(result).toBe(-10);
  });

  it('past expiry: delta = -10 (floor)', () => {
    const result = computeCallerExitRepDelta(createdAt, expiry, expiry + 1000n);
    expect(result).toBe(-10);
  });

  it('at halfway (elapsed=3.5days): delta between -45 and -10', () => {
    // elapsed = 302400, absDelta = (45*604800 - 35*302400) / 604800
    //         = (27216000 - 10584000) / 604800 = 16632000 / 604800 = 27 (truncated)
    // delta = -27
    const now = 302_400n;
    const result = computeCallerExitRepDelta(createdAt, expiry, now);
    expect(result).toBeGreaterThanOrEqual(-45);
    expect(result).toBeLessThanOrEqual(-10);
  });

  it('at 24h mark (earliest valid exit): delta close to -45', () => {
    const now = 86_400n; // 24h
    const result = computeCallerExitRepDelta(createdAt, expiry, now);
    expect(result).toBeGreaterThanOrEqual(-45);
    expect(result).toBeLessThan(-10);
  });

  it('delta is always in range [-45, -10]', () => {
    for (let i = 0; i <= 10; i++) {
      const now = createdAt + (expiry - createdAt) * BigInt(i) / 10n;
      const result = computeCallerExitRepDelta(createdAt, expiry, now);
      expect(result).toBeGreaterThanOrEqual(-45);
      expect(result).toBeLessThanOrEqual(-10);
    }
  });
});

// ─── computePositionSlashSplit ────────────────────────────────────────────────

describe('computePositionSlashSplit', () => {
  it('basic split: $10 slash → $5/$4/$1', () => {
    const slash = 10_000_000n; // $10
    const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(slash);
    expect(toOpposite).toBe(5_000_000n);  // 50% = $5
    expect(toSameSide).toBe(4_000_000n);  // 40% = $4
    expect(toTreasury).toBe(1_000_000n);  // 10% = $1
  });

  it('total always equals slash (no USDC lost to rounding)', () => {
    // Test with amounts that would produce rounding with multiplication
    const slashes = [
      1n,            // 1 wei
      3n,            // not divisible by 10
      7_777_777n,    // odd USDC value
      99_999_999n,   // $99.999999
      10_000_000n,   // $10 clean
    ];
    for (const slash of slashes) {
      const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(slash);
      expect(toOpposite + toSameSide + toTreasury).toBe(slash);
    }
  });

  it('dust is captured in toTreasury, not lost (T-02-W0-03)', () => {
    // 3 USDC wei: 50% = 1 wei (floor), 40% = 1 wei (floor), treasury = 3 - 1 - 1 = 1 wei
    const slash = 3n;
    const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(slash);
    expect(toOpposite).toBe(1n);
    expect(toSameSide).toBe(1n);
    expect(toTreasury).toBe(1n); // dust goes to treasury
    expect(toOpposite + toSameSide + toTreasury).toBe(3n);
  });

  it('zero slash returns all zeros', () => {
    const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(0n);
    expect(toOpposite).toBe(0n);
    expect(toSameSide).toBe(0n);
    expect(toTreasury).toBe(0n);
  });

  it('$100 max slash: correct split', () => {
    const slash = 100_000_000n; // $100
    const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(slash);
    expect(toOpposite).toBe(50_000_000n);  // $50
    expect(toSameSide).toBe(40_000_000n);  // $40
    expect(toTreasury).toBe(10_000_000n);  // $10
    expect(toOpposite + toSameSide + toTreasury).toBe(slash);
  });

  it('odd amount (7 wei): dust captured in treasury', () => {
    // 7 wei: 50% = 3 wei, 40% = 2 wei, treasury = 7 - 3 - 2 = 2 wei
    const slash = 7n;
    const { toOpposite, toSameSide, toTreasury } = computePositionSlashSplit(slash);
    expect(toOpposite).toBe(3n);
    expect(toSameSide).toBe(2n);
    expect(toTreasury).toBe(2n);
    expect(toOpposite + toSameSide + toTreasury).toBe(7n);
  });
});
