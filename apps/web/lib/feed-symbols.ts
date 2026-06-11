/**
 * feed-symbols.ts — Pyth feedId → ticker symbol inversion (web side).
 *
 * Web-side replica of apps/relayer/src/lib/call-enrichment.ts:119-136
 * (quick-260611-vob; duel-page hero asset resolution). Built by inverting the
 * shared PYTH_FEED_IDS constant (symbol → 0x-prefixed feedId). Keys are
 * lowercased 0x-prefixed feed ids so on-chain uint256 values can be matched
 * after canonical hex formatting.
 *
 * D-07: unknown feed ids resolve to undefined — degrade, never guess.
 */

import { PYTH_FEED_IDS } from '@call-it/shared';

const FEED_ID_TO_SYMBOL: ReadonlyMap<string, string> = new Map(
  Object.entries(PYTH_FEED_IDS).map(([symbol, feedId]) => [
    (feedId as string).toLowerCase(),
    symbol,
  ]),
);

/**
 * Resolve an on-chain Pyth feed id (uint256 as bigint) to its ticker symbol.
 * 0n → undefined (no asset); unknown id → undefined (D-07: never fabricate).
 */
export function feedIdToSymbol(feedId: bigint): string | undefined {
  if (feedId === 0n) return undefined;
  // toString(16) is already lowercase; pad to the full 32-byte width.
  return FEED_ID_TO_SYMBOL.get(`0x${feedId.toString(16).padStart(64, '0')}`);
}
