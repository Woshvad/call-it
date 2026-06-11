/**
 * target-guard.ts — trivially-true price-target guard (quick-260611-uf9).
 *
 * STRICT-ABOVE RULE: marketType 'priceTarget' requires targetValue STRICTLY
 * above the current live Pyth price at creation. V1 settles >= ONLY
 * (SettlementManager.sol:718 — no direction field), so a target at/below the
 * current price is a guaranteed CALLED IT = free rep farming. Equality is a
 * violation too (a target equal to current is already at-or-above). No margin
 * band — a target barely above current is a legitimate coin-flip.
 *
 * D-07 skip-on-missing-price contract: when the live price is unavailable
 * (usePythPrice error/null) the CLIENT-side check is SKIPPED — publish
 * proceeds and the relayer preflight layer enforces (fail-closed there). No
 * price is ever fabricated and publish is never blocked client-side on
 * missing data.
 *
 * PURE MODULE — no React; importable in node-env vitest.
 */

import { usdToTargetValue } from './target-scale';
import { formatUsdPrice } from './hermes-price';

/**
 * True when the entered target is at or below the live current price
 * (strict > rule violated). Compares in 1e8 bigint space — NEVER
 * float-compares. Returns false (no violation = check skipped) when:
 *   - targetValue is undefined (empty field — zod-required handles that), or
 *   - priceUsd is null (D-07: no live price → relayer layer enforces), or
 *   - the price fails to scale (NaN/Infinity → treated as "no price").
 */
export function targetGuardViolation(
  targetValue: bigint | undefined,
  priceUsd: number | null,
): boolean {
  if (targetValue === undefined || priceUsd === null) return false;
  const scaled = usdToTargetValue(priceUsd);
  if (scaled === undefined) return false;
  return targetValue <= scaled;
}

/** Inline error copy for the targetValue field while the violation holds. */
export function targetGuardMessage(priceUsd: number): string {
  return `Target must be above the current price ($${formatUsdPrice(priceUsd)}) — calls settle at-or-above target`;
}
