/**
 * resolve-asset.ts — typed asset input → Pyth feed id resolution (quick-260611-bf2, BUG 2).
 *
 * The /new composer placeholder promises "BTC, ETH, SOL... (Pyth feed or symbol)".
 * Before this helper existed, a typed symbol landed on-chain as assetA=0 —
 * UNSETTLEABLE (no Pyth feed at settlement).
 *
 * Resolution order:
 *   1. trim
 *   2. full 0x 64-hex feed id → lowercased passthrough
 *   3. uppercase symbol lookup in the shared PYTH_FEED_IDS catalogue (24 assets)
 *   4. null (unknown)
 *
 * PURE MODULE — no React, no network. Importable in node-env vitest.
 *
 * Requirement: QUICK-260611-BF2, CALL-13
 */

import { PYTH_FEED_IDS } from '@call-it/shared';

/** Full 0x-prefixed bytes32 feed id (64 hex chars). */
const FEED_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

/**
 * Exact unknown-asset copy — reused by the publish-time abort (usePublishCall)
 * and the pre-modal schema refine (web-call-schema) so the message is identical
 * everywhere it can surface.
 */
export const UNKNOWN_ASSET_MESSAGE =
  'Unknown asset — use a listed symbol (BTC, ETH, SOL…) or a Pyth feed id';

/**
 * Resolve a user-typed asset input to a canonical lowercase Pyth feed id.
 *
 * @returns the 0x-prefixed lowercase bytes32 feed id, or null when unresolvable.
 */
export function resolveAssetToFeedId(input: string): `0x${string}` | null {
  const trimmed = input.trim();
  if (FEED_ID_REGEX.test(trimmed)) {
    return trimmed.toLowerCase() as `0x${string}`;
  }
  const symbol = trimmed.toUpperCase();
  if (symbol in PYTH_FEED_IDS) {
    return PYTH_FEED_IDS[symbol as keyof typeof PYTH_FEED_IDS];
  }
  return null;
}
