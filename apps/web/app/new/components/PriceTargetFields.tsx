'use client';

import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { usdToTargetValue, targetValueToUsd } from '../lib/target-scale';
import { formatUsdPrice, computeChipTarget } from '../lib/hermes-price';
import { targetGuardViolation, targetGuardMessage } from '../lib/target-guard';
import { AssetSelect } from './AssetSelect';

interface PriceTargetFieldsProps {
  control: Control<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
  /**
   * Live Hermes price + status as PROPS (quick-260611-uf9): the price hook is
   * LIFTED to page.tsx so one fetch loop serves both this display and the
   * onPublish trivially-true gate. The status union mirrors PythPriceStatus
   * from the hooks module (kept inline — this component must not depend on
   * the hook module at all).
   */
  price: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

/**
 * Percentage quick-pick chips. Direction default is ABOVE (+pct) — CreateCallInput
 * has no direction field (call-gates.ts; preview hardcodes '>='), so all four
 * chips (including +100%) compute upside targets.
 * Below-target direction is a contracts-v2 feature — SettlementManager v1
 * settles >= only (SettlementManager.sol:718).
 */
const TARGET_CHIP_PCTS = [10, 20, 50, 100] as const;

/**
 * PriceTargetFields — sub-form for Price Target market type (ROOT `.brutal-input` skin).
 *
 * Shows: asset (24-asset grouped AssetSelect dropdown — this IS the CALL-06
 * CoinPicker; Pyth feed ID resolution happens at preflight via
 * resolveAssetToFeedId, with live Hermes price display wired here), targetValue.
 *
 * Requirement: CALL-01, CALL-02, CALL-06, CALL-37, UI-02
 */
export function PriceTargetFields({ control, errors, price, status }: PriceTargetFieldsProps) {
  // quick-260611-uf9: derived trivially-true guard — reactive by construction.
  // Target edits AND 30s price refreshes both re-derive, so the inline error
  // clears the moment the user raises the target above the live price or the
  // refresh moves the price below it (never a stale one-shot setError). When
  // price is null (D-07) the guard is skipped — the relayer layer enforces.
  const targetValue = useWatch({ control, name: 'targetValue' });
  const guardViolated = targetGuardViolation(targetValue, price);

  return (
    <div className="flex flex-col gap-5">
      {/* Asset */}
      <div className="flex flex-col gap-2">
        <label htmlFor="pt-asset" className="label-overline">Asset</label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <AssetSelect
              id="pt-asset"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              hasError={!!errors.assetA}
            />
          )}
        />
        {status === 'loading' && price === null && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            fetching price…
          </div>
        )}
        {price !== null && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Current price ·{' '}
            <span style={{ color: 'var(--accent-win)', fontWeight: 600 }}>
              ${formatUsdPrice(price)}
            </span>
          </div>
        )}
        {errors.assetA && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {errors.assetA.message}
          </div>
        )}
      </div>

      {/* Target value */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Price Target (USD)</label>
        <Controller
          name="targetValue"
          control={control}
          render={({ field }) => (
            <>
              {/* +pct quick-pick chips — ONLY with a live price (D-07: no price,
                  no chips). Chips are SETTERS, not modes: they write through the
                  same field.onChange -> usdToTargetValue -> zod path as manual
                  entry, and the input below stays fully editable. */}
              {price !== null && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TARGET_CHIP_PCTS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      className="chip"
                      style={{ flex: 1, minWidth: 60, minHeight: 44, fontSize: 13, fontWeight: 700 }}
                      onClick={() => field.onChange(usdToTargetValue(computeChipTarget(price, pct)))}
                    >
                      +{pct}%
                    </button>
                  ))}
                </div>
              )}
              <input
                type="number"
                // RC3: canonical 1e8 target scale (SettlementManager.sol:714 —
                // Pyth 8-decimal form). Was ÷1e6/×1e6, which made a $4,200 entry
                // create a $42.00 on-chain target.
                value={field.value ? targetValueToUsd(field.value).toString() : ''}
                onChange={(e) => {
                  const usd = parseFloat(e.target.value);
                  // Empty/invalid input clears the field back to "required"
                  // (no stale value, no numeric prefill).
                  field.onChange(usdToTargetValue(usd));
                }}
                onBlur={field.onBlur}
                placeholder="e.g. 80000 (for $80k)"
                step="any"
                className="brutal-input mono"
                style={
                  errors.targetValue || guardViolated
                    ? { borderColor: 'var(--accent-loss)' }
                    : undefined
                }
              />
            </>
          )}
        />
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Wins if price closes at or above target at the deadline.
        </div>
        {errors.targetValue && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {String(errors.targetValue.message)}
          </div>
        )}
        {/* Derived strict-above guard error (quick-260611-uf9) — only when no
            zod targetValue error is showing (never stack two red lines).
            price is non-null whenever guardViolated is true, but narrow
            explicitly for type safety. */}
        {guardViolated && price !== null && !errors.targetValue && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {targetGuardMessage(price)}
          </div>
        )}
      </div>
    </div>
  );
}
