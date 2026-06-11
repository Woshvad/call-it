/**
 * preflight-body.ts — single source of the preflight body + calldata asset uints
 * (quick-260611-bf2, BUG 1 + BUG 2).
 *
 * CONSISTENCY INVARIANT (the reason this helper exists): the relayer recomputes
 * assetToUint256(body.assetA) for its duplicateHash (calls-preflight.ts:150-158:
 * 0x-prefixed → BigInt, /^\d+$/ → BigInt, else 0n). Whatever uint the calldata
 * carries for assetA MUST equal what the relayer derives from the preflight
 * body, or preflight's dup-hash diverges from the contract's duplicateHash.
 * buildPreflightBody is the ONLY place both values are derived.
 *
 * BUG 1 fix: marketType/eventSubtype/category are STRING enum passthroughs —
 * the relayer's httpBodyPreprocessSchema → createCallSchemaStrict expects
 * strings ('priceTarget'/'none'/'majors'), never the *_TO_UINT integers.
 *
 * PURE MODULE — no React, no network. Importable in node-env vitest.
 *
 * Requirement: QUICK-260611-BF2, CALL-13, D-28, D-29, D-31
 */

import type { CreateCallInput } from '@call-it/shared';
import type { PreflightInput } from '@/lib/relayer-client';
import {
  resolveAssetToFeedId,
  assetToUint256Parity,
  UNKNOWN_ASSET_MESSAGE,
} from './resolve-asset';

/** Discriminated result of building the preflight body. */
export type PreflightBuildResult =
  | { ok: true; body: PreflightInput; assetAUint: bigint; assetBUint: bigint }
  | { ok: false; field: 'assetA' | 'assetB'; message: string };

/**
 * Build the POST /api/calls/preflight body AND the on-chain asset uint256 args
 * from validated form input.
 *
 * Per-market-type asset rules:
 * - 'priceTarget': assetA MUST resolve to a Pyth feed id; assetB unused (0n).
 * - 'spreadVs':    BOTH assetA and assetB MUST resolve.
 * - 'event':       resolved feed id when the symbol is listed; otherwise raw
 *                  string passthrough with assetToUint256Parity (CR-01:
 *                  0x-hex / numeric → BigInt — NFT collection addresses keep
 *                  their uint; freeform text → 0n). NOTE: CallRegistry's
 *                  _assertAllowlisted runs for Event market types too
 *                  (CallRegistry.sol:492-506) — an assetA deriving to 0 (or
 *                  any non-allowlisted uint) reverts AssetNotAllowlisted
 *                  on-chain. webCreateCallSchema gates freeform event assets
 *                  pre-modal (WR-02); this builder still never fails so the
 *                  derivation parity holds for whatever reaches it.
 */
export function buildPreflightBody(
  input: CreateCallInput,
  callerAddress: `0x${string}`,
): PreflightBuildResult {
  let bodyAssetA: string;
  let bodyAssetB: string | undefined;
  let assetAUint: bigint;
  let assetBUint = 0n;

  if (input.marketType === 'priceTarget') {
    const resolvedA = resolveAssetToFeedId(input.assetA);
    if (resolvedA === null) {
      return { ok: false, field: 'assetA', message: UNKNOWN_ASSET_MESSAGE };
    }
    bodyAssetA = resolvedA;
    assetAUint = BigInt(resolvedA);
    bodyAssetB = undefined;
  } else if (input.marketType === 'spreadVs') {
    const resolvedA = resolveAssetToFeedId(input.assetA);
    if (resolvedA === null) {
      return { ok: false, field: 'assetA', message: UNKNOWN_ASSET_MESSAGE };
    }
    const resolvedB = input.assetB ? resolveAssetToFeedId(input.assetB) : null;
    if (resolvedB === null) {
      return { ok: false, field: 'assetB', message: UNKNOWN_ASSET_MESSAGE };
    }
    bodyAssetA = resolvedA;
    assetAUint = BigInt(resolvedA);
    bodyAssetB = resolvedB;
    assetBUint = BigInt(resolvedB);
  } else {
    // 'event' — best-effort resolution; unresolved input falls back to the
    // relayer's exact assetToUint256 semantics (CR-01): 0x-hex (NFT collection
    // address) / pure-digit string → BigInt, anything else → 0n. This keeps
    // the dup-hash invariant for EVERY input class — the prior bare `0n`
    // fallback diverged for 0x-address and numeric event assets.
    const resolvedA = resolveAssetToFeedId(input.assetA);
    if (resolvedA !== null) {
      bodyAssetA = resolvedA;
      assetAUint = BigInt(resolvedA);
    } else {
      bodyAssetA = input.assetA;
      assetAUint = assetToUint256Parity(input.assetA);
    }
    bodyAssetB = undefined;
  }

  const body: PreflightInput = {
    // BUG 1 fix: STRING enum passthrough (shared union types) — never *_TO_UINT.
    marketType: input.marketType,
    eventSubtype: input.eventSubtype ?? 'none',
    category: input.category,
    assetA: bodyAssetA,
    assetB: bodyAssetB,
    targetValue: String(input.targetValue),
    expiry: Number(input.expiry),
    stake: String(input.stake),
    conviction: Number(input.conviction),
    criteriaText: input.criteriaText,
    openToChallenges: input.openToChallenges,
    parentCallId: input.parentCallId ? String(input.parentCallId) : undefined,
    callerAddress,
    callerSettledCalls: input.callerSettledCalls,
  };

  return { ok: true, body, assetAUint, assetBUint };
}
