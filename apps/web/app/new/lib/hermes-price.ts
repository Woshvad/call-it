/**
 * hermes-price.ts — pure Pyth Hermes price helpers (quick-260611-hog).
 *
 * URL builder + defensive response parser + never-throwing fetch wrapper +
 * USD display formatter + percentage-chip target math. PURE MODULE — no
 * React; importable in node-env vitest with a stubbed fetch.
 *
 * Hermes is an UNTRUSTED boundary (T-hog-01): parsing narrows defensively and
 * returns null on any malformed/non-finite/non-positive value — never throws.
 * The price is DISPLAY + prefill only; it is never submitted on-chain directly
 * (chip targets flow through the same RHF -> zod -> preflight path as manual
 * entry).
 *
 * Requirement: CALL-06, UI-02
 */

const HERMES_LATEST_URL = 'https://hermes.pyth.network/v2/updates/price/latest';

/**
 * Build the Hermes latest-price URL for a single feed.
 * Feed ids from PYTH_FEED_IDS are 0x-prefixed; Hermes accepts that form.
 */
export function buildHermesLatestUrl(feedId: string): string {
  const url = new URL(HERMES_LATEST_URL);
  url.searchParams.append('ids[]', feedId);
  return url.toString();
}

/**
 * Parse a Hermes /v2/updates/price/latest response into a USD number.
 *
 * Expected shape: `{ parsed: [{ price: { price: '9743218000000', expo: -8 } }] }`
 * -> Number(price) * 10 ** expo.
 *
 * Returns null unless the result is finite and > 0. NEVER throws on malformed
 * input — Hermes JSON is untrusted (T-hog-01).
 */
export function parseHermesPriceResponse(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;
  const parsed = (json as { parsed?: unknown }).parsed;
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const first = parsed[0] as { price?: unknown } | null | undefined;
  if (typeof first !== 'object' || first === null) return null;
  const price = (first as { price?: unknown }).price;
  if (typeof price !== 'object' || price === null) return null;
  const { price: raw, expo } = price as { price?: unknown; expo?: unknown };
  if (typeof raw !== 'string' || raw.length === 0 || typeof expo !== 'number') return null;
  const mantissa = Number(raw);
  if (Number.isNaN(mantissa)) return null;
  const usd = mantissa * 10 ** expo;
  if (!Number.isFinite(usd) || usd <= 0) return null;
  return usd;
}

/**
 * Fetch the live USD price for a feed. Resolves to null on ANY failure —
 * non-ok status, malformed JSON, network error, abort/timeout. Never throws
 * (D-07 honesty: callers render nothing when this is null).
 */
export async function fetchHermesPrice(
  feedId: string,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const res = await fetch(buildHermesLatestUrl(feedId), { signal });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseHermesPriceResponse(json);
  } catch {
    // AbortError, network failure, JSON parse failure — all degrade to null.
    return null;
  }
}

/**
 * Format a USD price for display.
 * - sub-$1: 4 significant figures, exponent artifacts stripped ('0.00001234')
 * - >= $1: en-US grouping with exactly 2 decimals ('97,432.18')
 */
export function formatUsdPrice(usd: number): string {
  if (usd < 1) {
    return Number(usd.toPrecision(4)).toString();
  }
  return usd.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Round a computed chip target to a sensible entry precision:
 * sub-$1 -> 4 significant figures; >= $1 -> 2 decimals.
 */
export function roundForTarget(usd: number): number {
  if (usd < 1) {
    return Number(usd.toPrecision(4));
  }
  return Math.round(usd * 100) / 100;
}

/**
 * Compute the chip-prefilled target for a +pct% move from the current price.
 *
 * Direction default: ABOVE (+pct). CreateCallInput has NO direction field
 * (verified — call-gates.ts has no `direction`; the /new preview market line
 * hardcodes '>='), so all chips compute upside targets. Revisit if a
 * direction control ever ships in the composer.
 */
export function computeChipTarget(currentPrice: number, pct: number): number {
  return roundForTarget(currentPrice * (1 + pct / 100));
}
