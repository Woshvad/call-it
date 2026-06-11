/**
 * resolve-asset.ts — typed asset input → Pyth feed id resolution (quick-260611-bf2, BUG 2).
 *
 * The /new composer historically accepted free-text asset entry; before this
 * helper existed, a typed symbol landed on-chain as assetA=0 — UNSETTLEABLE
 * (no Pyth feed at settlement). As of quick-260611-hog the composer constrains
 * entry to the 24-symbol AssetSelect dropdown, but this resolver remains the
 * canonical symbol→feed-id path (preflight, dup-check, usePythPrice).
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

// ─── Relayer assetToUint256 parity (CR-01, quick-260611-bf2 review) ──────────
//
// The relayer recomputes uint256(assetA) from the wire string for its
// duplicateHash (apps/relayer/src/routes/calls-preflight.ts:150-158, mirrored
// in calls-dup-check.ts): trimmed input starting 0x/0X → BigInt(), pure-digit
// string → BigInt(), anything else → 0n. The calldata uint MUST match that
// derivation or preflight Gate 6.2 checks the wrong hash.
//
// ONE deliberate divergence: the web side validates hex chars before BigInt()
// so malformed input like '0xNotHex' returns 0n instead of throwing (the
// relayer's bare BigInt(trimmed) throws → 500 server-side on such input —
// relayer hardening is a noted follow-up, out of scope for apps/web).

/** 0x/0X-prefixed hex string of any length (BigInt-parseable). */
const HEX_UINT_REGEX = /^0[xX][0-9a-fA-F]+$/;

/** Pure-digit decimal string (BigInt-parseable). */
const DECIMAL_UINT_REGEX = /^\d+$/;

/** True when the relayer's assetToUint256 would BigInt() the input (0x-hex or pure digits). */
export function isUintParseableAsset(input: string): boolean {
  const trimmed = input.trim();
  return HEX_UINT_REGEX.test(trimmed) || DECIMAL_UINT_REGEX.test(trimmed);
}

/** Mirror of the relayer's assetToUint256 — the dup-hash invariant derivation. */
export function assetToUint256Parity(input: string): bigint {
  const trimmed = input.trim();
  return isUintParseableAsset(trimmed) ? BigInt(trimmed) : 0n;
}

/**
 * Canonical wire value for an asset field: the resolved feed id when the input
 * is a listed symbol / 64-hex feed id, the raw input otherwise. The dup-check
 * pre-warning MUST post this same canonical value the preflight body carries
 * (WR-01) — posting the raw symbol hashes to 0n on the relayer while published
 * calls now carry BigInt(feedId), so the DuplicateWarning would never match.
 */
export function canonicalAssetForWire(input: string): string {
  return resolveAssetToFeedId(input) ?? input;
}
