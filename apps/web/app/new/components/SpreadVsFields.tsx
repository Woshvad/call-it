'use client';

import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { usdToTargetValue, targetValueToUsd } from '../lib/target-scale';

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
  return (
    <div className="flex flex-col gap-5">
      {/* Asset A */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Asset A</label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="First asset (e.g. BTC)"
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

      {/* Asset B */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Asset B</label>
        <Controller
          name="assetB"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="Second asset (e.g. ETH)"
              className="brutal-input mono"
            />
          )}
        />
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
