/**
 * hermes-spot.ts — live Hermes spot price + trivially-true target guard
 * (quick-260611-uf9). Used by the POST /api/calls/preflight route.
 *
 * V1 settles >= ONLY (SettlementManager.sol:718 — no direction field), so a
 * priceTarget call with targetValue at/below the live current price is a
 * guaranteed CALLED IT = free rep farming. The preflight gate requires
 * targetValue STRICTLY above the live Hermes spot price (equality rejects).
 *
 * FAIL-CLOSED is deliberate: when Hermes is unreachable/malformed/times out,
 * the guard rejects with 'price_unverifiable' rather than letting the call
 * through — fail-open would let users farm guaranteed CALLED ITs whenever
 * Hermes blips, defeating the integrity guard entirely.
 *
 * Hermes is an UNTRUSTED boundary: getSpotPrice1e8 parses defensively and
 * NEVER throws — any failure/malformed/non-positive value degrades to null
 * (which the guard then fail-closes on).
 */

import { HermesClient } from '@pythnetwork/hermes-client';

/**
 * Normalize a Pyth (mantissa, expo) pair to the canonical 1e8 integer scale
 * (the same scale as on-chain targetValue — SettlementManager.sol:714).
 *
 * Pyth expo is TYPICALLY -8 but must never be assumed. Exact integer math:
 *   shift = expo + 8
 *   shift >= 0 → mantissa * 10^shift   (exact multiply)
 *   shift <  0 → mantissa / 10^(-shift) (floor divide)
 *
 * Floor is EXACT for the strict-above rule at integer 1e8 granularity: for an
 * integer target T, T > floor(spot) ⟺ T > spot — the fractional remainder
 * below 1e-8 dollars can never flip the comparison, so no precision is lost
 * at the boundary.
 */
export function normalizePythPriceTo1e8(mantissa: bigint, expo: number): bigint {
  const shift = expo + 8;
  if (shift >= 0) {
    return mantissa * 10n ** BigInt(shift);
  }
  return mantissa / 10n ** BigInt(-shift);
}

export type TargetGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: 'price_unverifiable' | 'target_not_above_current';
      message: string;
    };

/**
 * Evaluate the strict-above target guard against a 1e8-scaled spot price.
 *
 *   spot null            → price_unverifiable (FAIL-CLOSED — see module doc)
 *   target <= spot       → target_not_above_current (equality rejects: a
 *                          target equal to current is already at-or-above
 *                          per the v1 settlement rule)
 *   target >  spot       → ok (no margin band — barely-above is a legitimate
 *                          coin-flip by design)
 */
export function evaluateTargetGuard(
  targetValue: bigint,
  spot1e8: bigint | null,
): TargetGuardResult {
  if (spot1e8 === null) {
    return {
      ok: false,
      code: 'price_unverifiable',
      message: 'Could not verify current price — try again shortly.',
    };
  }
  if (targetValue <= spot1e8) {
    const usd = Number(spot1e8) / 1e8;
    // >= $1: 2 decimals; sub-$1 (PEPE/BONK class): 8 decimals so the price
    // is not formatted away to "0".
    const formatted =
      usd >= 1
        ? usd.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : usd.toLocaleString('en-US', { maximumFractionDigits: 8 });
    return {
      ok: false,
      code: 'target_not_above_current',
      message: `Target must be above the current price ($${formatted}) — calls settle at-or-above target.`,
    };
  }
  return { ok: true };
}

// Lazy module-level singleton — same construction as the settlement workers
// (workers/settlement-watcher.ts: `new HermesClient(url, {})`).
let defaultClient: HermesClient | null = null;

function getDefaultClient(): HermesClient {
  if (!defaultClient) {
    defaultClient = new HermesClient(
      process.env['HERMES_URL'] ?? 'https://hermes.pyth.network',
      {},
    );
  }
  return defaultClient;
}

/**
 * Fetch the live spot price for a Pyth feed, normalized to the 1e8 scale.
 *
 * feedId arrives 0x-prefixed from the composer (Hermes accepts that form —
 * same as the web's hermes-price.ts). Defensive parse mirrors
 * workers/oracle-adapters/pyth-adapter.ts: string mantissa + number expo
 * required; mantissa must be > 0. Returns null on ANY failure — NEVER throws.
 *
 * @param client optional injected HermesClient (unit tests); defaults to the
 *               lazy module singleton.
 */
export async function getSpotPrice1e8(
  feedId: string,
  client?: HermesClient,
): Promise<bigint | null> {
  try {
    const hermes = client ?? getDefaultClient();
    const updates = await hermes.getLatestPriceUpdates([feedId]);
    const parsedPrice = (
      updates as { parsed?: Array<{ price?: unknown } | null | undefined> | null }
    ).parsed?.[0]?.price;
    if (typeof parsedPrice !== 'object' || parsedPrice === null) return null;
    const { price: raw, expo } = parsedPrice as { price?: unknown; expo?: unknown };
    if (typeof raw !== 'string' || raw.length === 0) return null;
    if (typeof expo !== 'number' || !Number.isInteger(expo)) return null;
    let mantissa: bigint;
    try {
      mantissa = BigInt(raw);
    } catch {
      return null; // non-numeric mantissa string
    }
    if (mantissa <= 0n) return null;
    return normalizePythPriceTo1e8(mantissa, expo);
  } catch {
    // Network failure, Hermes 5xx, malformed JSON — all degrade to null
    // (the route's guard then fail-closes with price_unverifiable).
    return null;
  }
}
