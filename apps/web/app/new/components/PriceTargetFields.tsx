'use client';

import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';

interface PriceTargetFieldsProps {
  control: Control<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
}

/**
 * PriceTargetFields — sub-form for Price Target market type.
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
    <div className="flex flex-col gap-4">
      {/* Asset */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Asset
        </label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="BTC, ETH, SOL... (Pyth feed or symbol)"
              className={[
                'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                'focus:outline-none focus:border-brand-accent',
                errors.assetA ? 'border-red-500' : 'border-brand-border',
              ].join(' ')}
            />
          )}
        />
        {errors.assetA && (
          <div className="text-red-500 text-xs font-mono">{errors.assetA.message}</div>
        )}
      </div>

      {/* Target value */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Price Target (USD)
        </label>
        <Controller
          name="targetValue"
          control={control}
          render={({ field }) => (
            <input
              type="number"
              value={field.value ? (Number(field.value) / 1_000_000).toString() : ''}
              onChange={(e) => {
                const usd = parseFloat(e.target.value);
                if (!isNaN(usd)) {
                  // Convert USD to 6 decimal USDC-like units for storage
                  field.onChange(BigInt(Math.round(usd * 1_000_000)));
                }
              }}
              onBlur={field.onBlur}
              placeholder="e.g. 80000 (for $80k)"
              step="any"
              className={[
                'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                'focus:outline-none focus:border-brand-accent',
                errors.targetValue ? 'border-red-500' : 'border-brand-border',
              ].join(' ')}
            />
          )}
        />
        {errors.targetValue && (
          <div className="text-red-500 text-xs font-mono">{String(errors.targetValue.message)}</div>
        )}
      </div>
    </div>
  );
}
