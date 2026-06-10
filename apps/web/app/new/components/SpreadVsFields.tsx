'use client';

import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';

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
              value={field.value ? (Number(field.value) / 1_000_000).toString() : ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (!isNaN(val)) {
                  field.onChange(BigInt(Math.round(val * 1_000_000)));
                }
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
