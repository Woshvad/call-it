'use client';

import { Controller, useWatch, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { usdToTargetValue, targetValueToUsd } from '../lib/target-scale';
import { formatUsdPrice } from '../lib/hermes-price';
import { usePythPrice } from '../hooks/usePythPrice';
import { AssetSelect } from './AssetSelect';

/** Live Hermes price row (D-07: error/idle renders nothing — no fake numbers). */
function LivePriceRow({ price, status }: { price: number | null; status: string }) {
  if (status === 'loading' && price === null) {
    return (
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        fetching price…
      </div>
    );
  }
  if (price === null) return null;
  return (
    <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
      Current price ·{' '}
      <span style={{ color: 'var(--accent-win)', fontWeight: 600 }}>
        ${formatUsdPrice(price)}
      </span>
    </div>
  );
}

interface SpreadVsFieldsProps {
  control: Control<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
}

const SPREAD_METRICS = [
  { value: 'none', label: 'Price ratio' },
  { value: 'tvlMilestone', label: 'TVL ratio' },
  { value: 'volumeFees', label: 'Volume ratio' },
  { value: 'onchainMetric', label: 'On-chain metric' },
  { value: 'protocolMilestone', label: 'Protocol milestone' },
] as const;

/**
 * SpreadVsFields — sub-form for Spread vs market type (ROOT `.brutal-input` skin).
 *
 * Shows: assetA, assetB (two coin pickers), metric (5 options per CALL-02).
 *
 * Requirement: CALL-02, CALL-37
 */
export function SpreadVsFields({ control, errors }: SpreadVsFieldsProps) {
  const assetA = useWatch({ control, name: 'assetA' });
  const assetB = useWatch({ control, name: 'assetB' });
  const priceA = usePythPrice(assetA);
  const priceB = usePythPrice(assetB);

  return (
    <div className="flex flex-col gap-5">
      {/* Asset A */}
      <div className="flex flex-col gap-2">
        <label htmlFor="sv-asset-a" className="label-overline">Asset A</label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <AssetSelect
              id="sv-asset-a"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              hasError={!!errors.assetA}
            />
          )}
        />
        <LivePriceRow price={priceA.price} status={priceA.status} />
        {errors.assetA && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {errors.assetA.message}
          </div>
        )}
      </div>

      {/* Asset B */}
      <div className="flex flex-col gap-2">
        <label htmlFor="sv-asset-b" className="label-overline">Asset B</label>
        <Controller
          name="assetB"
          control={control}
          render={({ field }) => (
            <AssetSelect
              id="sv-asset-b"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              hasError={!!errors.assetB}
            />
          )}
        />
        <LivePriceRow price={priceB.price} status={priceB.status} />
        {errors.assetB && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {errors.assetB.message}
          </div>
        )}
      </div>

      {/* Spread metric */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Metric</label>
        <Controller
          name="eventSubtype"
          control={control}
          render={({ field }) => (
            <select
              value={field.value ?? 'none'}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              className="brutal-select"
            >
              {SPREAD_METRICS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      {/* Target value */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Target Ratio</label>
        <Controller
          name="targetValue"
          control={control}
          render={({ field }) => (
            <input
              type="number"
              // RC3 coherence: same canonical 1e8 scale as the price-target
              // field (was ×1e6/÷1e6) so the shared preview + confirm modal
              // can divide every non-event targetValue by one scale.
              value={field.value ? targetValueToUsd(field.value).toString() : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                // Empty/invalid input clears the field back to "required".
                field.onChange(usdToTargetValue(val));
              }}
              onBlur={field.onBlur}
              placeholder="e.g. 2.5 (A is 2.5x B)"
              step="0.01"
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
