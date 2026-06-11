/**
 * web-call-schema.ts — web-local createCallSchema extension
 * (quick-260611-bf2, tightened to ticker-only in quick-260611-if0).
 *
 * Adds a TICKER-ONLY asset gate ON TOP of the shared createCallSchema so a
 * non-ticker asset shows an inline RHF field error on assetA/assetB BEFORE
 * the confirm modal (mode: 'onChange') and blocks handleSubmit(onPublish)
 * from opening the modal at all.
 *
 * Why ticker-only: since the AssetSelect dropdown landed (quick-260611-hog),
 * the ONLY UI-producible asset values are the 24 PYTH_FEED_IDS tickers —
 * PriceTargetFields, EventFields, and SpreadVsFields all use AssetSelect and
 * no free-text asset path remains. Raw 0x-hex / numeric acceptance at the
 * form level was a dead path; it is now rejected with LISTED_ASSET_MESSAGE.
 *
 * PARITY NOTE (bf2 CR-01): resolveAssetToFeedId's 0x-64-hex passthrough
 * remains INTENTIONALLY intact at the resolution/parity layer — preflight-
 * body.ts publish abort, canonicalAssetForWire, and assetToUint256Parity
 * (relayer dup-hash parity) are all unchanged. This schema sits IN FRONT of
 * that surface, so relayer parity is unaffected.
 *
 * DO NOT move this gate into packages/shared: the shared schema's assetA is
 * INTENTIONALLY freeform ("AssetNotAllowlisted (CALL-13): NOT checked here —
 * relayer pre-checks the allowlist") and the relayer imports that same module
 * (D-29 parity) — a membership gate there would change the deployed wire
 * contract.
 *
 * Below-target direction is a contracts-v2 feature — SettlementManager v1
 * settles >= only (SettlementManager.sol:718); CreateCallInput has no
 * direction field.
 *
 * NOTE: apps/web has no direct `zod` dependency — this module deliberately
 * avoids importing 'zod' and relies on the inferred superRefine ctx (the
 * 'custom' issue code is the same string literal z.ZodIssueCode.custom yields).
 *
 * Requirement: QUICK-260611-IF0, QUICK-260611-BF2, CALL-13, D-29
 */

import { createCallSchema, PYTH_FEED_IDS } from '@call-it/shared';

/**
 * Exact inline copy for any asset input that is not one of the 24 listed
 * AssetSelect tickers (the only UI-producible asset values).
 */
export const LISTED_ASSET_MESSAGE = 'Use a listed asset (BTC, ETH, SOL…)';

/**
 * True when the input is one of the 24 listed tickers (case/trim-insensitive
 * membership in the shared PYTH_FEED_IDS catalogue).
 */
function isListedTicker(input: string | undefined): boolean {
  if (!input) return false;
  return input.trim().toUpperCase() in PYTH_FEED_IDS;
}

export const webCreateCallSchema = createCallSchema.superRefine((data, ctx) => {
  // assetA is ticker-gated for ALL market types (priceTarget, spreadVs, event)
  // — AssetSelect is the sole asset entry path in the composer.
  if (!isListedTicker(data.assetA)) {
    ctx.addIssue({
      code: 'custom',
      path: ['assetA'],
      message: LISTED_ASSET_MESSAGE,
    });
  }
  // spreadVs assetB is also an AssetSelect ticker. Event assetB is NOT gated:
  // it carries exchange/metric strings ('binance', 'tvl', …), not assets.
  if (data.marketType === 'spreadVs' && !isListedTicker(data.assetB)) {
    ctx.addIssue({
      code: 'custom',
      path: ['assetB'],
      message: LISTED_ASSET_MESSAGE,
    });
  }
});
