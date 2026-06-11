/**
 * web-call-schema.ts — web-local createCallSchema extension (quick-260611-bf2).
 *
 * Adds an asset-resolvability gate ON TOP of the shared createCallSchema so an
 * unresolvable asset shows an inline RHF field error on assetA/assetB BEFORE
 * the confirm modal (mode: 'onChange') and blocks handleSubmit(onPublish) from
 * opening the modal at all.
 *
 * DO NOT move this gate into packages/shared: the shared schema's assetA is
 * INTENTIONALLY freeform ("AssetNotAllowlisted (CALL-13): NOT checked here —
 * relayer pre-checks the allowlist") and the relayer imports that same module
 * (D-29 parity) — a resolvability gate there would change the deployed wire
 * contract.
 *
 * EVENT-type assets ARE gated (WR-02, quick-260611-bf2 review): contract
 * verification confirmed CallRegistry._assertAllowlisted (CallRegistry.sol:
 * 492-506) runs for ALL market types — for Event, assetA must derive to an
 * allowlisted NFT collection address or allowlisted feed key; bytes32(0) is
 * neither, so a freeform event asset ('SomeNewToken') is a GUARANTEED
 * AssetNotAllowlisted revert after the user signs (the relayer preflight has
 * no allowlist gate). Resolvable-or-0x/numeric is the best client-side proxy:
 * the final uint is non-zero only for those input classes. An unallowlisted
 * feed id / collection address still reverts on-chain — that residual gap is
 * relayer/contract-side, not closable from the web form.
 *
 * NOTE: apps/web has no direct `zod` dependency — this module deliberately
 * avoids importing 'zod' and relies on the inferred superRefine ctx (the
 * 'custom' issue code is the same string literal z.ZodIssueCode.custom yields).
 *
 * Requirement: QUICK-260611-BF2, CALL-13, D-29
 */

import { createCallSchema } from '@call-it/shared';
import {
  resolveAssetToFeedId,
  isUintParseableAsset,
  UNKNOWN_ASSET_MESSAGE,
} from './resolve-asset';

/**
 * Exact inline copy for an event asset that would derive to uint 0 and revert
 * AssetNotAllowlisted on-chain (WR-02).
 */
export const EVENT_ASSET_MESSAGE = 'Use a listed asset (BTC, ETH, SOL…)';

export const webCreateCallSchema = createCallSchema.superRefine((data, ctx) => {
  if (data.marketType === 'priceTarget' || data.marketType === 'spreadVs') {
    if (resolveAssetToFeedId(data.assetA) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['assetA'],
        message: UNKNOWN_ASSET_MESSAGE,
      });
    }
  }
  if (data.marketType === 'spreadVs') {
    if (!data.assetB || resolveAssetToFeedId(data.assetB) === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['assetB'],
        message: UNKNOWN_ASSET_MESSAGE,
      });
    }
  }
  if (data.marketType === 'event') {
    // WR-02: CallRegistry._assertAllowlisted runs for Event market types too —
    // an assetA whose uint derivation is 0 (freeform text) is a guaranteed
    // on-chain revert. Gate on resolvable-or-0x/numeric (the CR-01 relayer
    // assetToUint256 parity classes that produce a non-zero uint).
    if (
      resolveAssetToFeedId(data.assetA) === null &&
      !isUintParseableAsset(data.assetA)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['assetA'],
        message: EVENT_ASSET_MESSAGE,
      });
    }
  }
});
