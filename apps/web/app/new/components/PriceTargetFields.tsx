'use client';

import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { usdToTargetValue, targetValueToUsd } from '../lib/target-scale';

interface PriceTargetFieldsProps {
  control: Control<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
}

/**
 * PriceTargetFields — sub-form for Price Target market type (ROOT `.brutal-input` skin).
 *
 * Shows: asset (symbol input — allowlist validated by relayer), targetValue, direction (≥ / ≤).
 *
 * Note: The full CoinPicker with Pyth feed ID resolution (CALL-06) and NftPicker (CALL-07)
 * would live here in Phase 2+. For Phase 1, we use a simple text input with placeholder.
 *
 * Requirement: CALL-01, CALL-02, CALL-37, UI-02
 */
export function PriceTargetFields({ control, errors }: PriceTargetFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      {/* Asset */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Asset</label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="BTC, ETH, SOL... (Pyth feed or symbol)"
              className="brutal-input mono"
              style={errors.assetA ? { borderColor: 'var(--accent-loss)' } : undefined}
            />
          )}
        />
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
              style={errors.targetValue ? { borderColor: 'var(--accent-loss)' } : undefined}
            />
          )}
        />
        {errors.targetValue && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {String(errors.targetValue.message)}
          </div>
        )}
      </div>
    </div>
  );
}
