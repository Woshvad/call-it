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
 * contract. EVENT-type assets are NOT gated: relayer assetToUint256 falls back
 * to 0n for non-feed strings (e.g. cexListing token names) and event settlement
 * is criteria/attestation-based, not Pyth.
 *
 * NOTE: apps/web has no direct `zod` dependency — this module deliberately
 * avoids importing 'zod' and relies on the inferred superRefine ctx (the
 * 'custom' issue code is the same string literal z.ZodIssueCode.custom yields).
 *
 * Requirement: QUICK-260611-BF2, CALL-13, D-29
 */

import { createCallSchema } from '@call-it/shared';
import { resolveAssetToFeedId, UNKNOWN_ASSET_MESSAGE } from './resolve-asset';

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
});
