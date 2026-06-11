/**
 * target-scale.ts — canonical targetValue scale helpers (quick-260611-5mh RC3).
 *
 * CANONICAL SCALE: 1e8. Per SettlementManager.sol:714 the on-chain targetValue
 * is "stored in same units as Pyth price (8-decimal form, expo=-8)". The
 * composer previously converted dollars at 1e6 (USDC micro-units) — a user
 * typing $4,200 created a $42.00 target on-chain (100x wrong). Reference: the
 * real call #14 has targetValue=100000000000000 (1e14 raw = $1,000,000 @ 1e8).
 *
 * Scope: TARGET values only. Stake/position fields stay 1e6 (USDC micro —
 * already correct). Event-market milestone targets are RAW integers (e.g. TVL
 * dollars) and are NOT scaled — see formatTargetForDisplay.
 */

import type { MarketType } from '@call-it/shared';

/** Canonical target scale: Pyth 8-decimal form (SettlementManager.sol:714). */
export const TARGET_SCALE = 100_000_000; // 1e8

/**
 * Convert a user-entered USD number (or ratio for spreadVs) to the on-chain
 * 1e8-scaled bigint. Returns undefined for empty/invalid input so the form
 * field goes back to "required" state instead of keeping a stale value.
 */
export function usdToTargetValue(usd: number): bigint | undefined {
  if (Number.isNaN(usd) || !Number.isFinite(usd)) return undefined;
  return BigInt(Math.round(usd * TARGET_SCALE));
}

/** Convert a 1e8-scaled on-chain targetValue back to the display number. */
export function targetValueToUsd(targetValue: bigint): number {
  return Number(targetValue) / TARGET_SCALE;
}

/**
 * Market-type-aware display formatting for previews/confirm modals.
 *
 * - priceTarget / spreadVs: 1e8-scaled → divide.
 * - event: milestone targets are stored RAW (EventFields writes the integer
 *   as-is, e.g. "1000000" for $1M TVL) — display unscaled. The previous flat
 *   ÷1e6 display was wrong for events too.
 */
export function formatTargetForDisplay(
  marketType: MarketType | undefined,
  targetValue: bigint,
): string {
  if (marketType === 'event') {
    return Number(targetValue).toLocaleString();
  }
  return targetValueToUsd(targetValue).toLocaleString();
}
