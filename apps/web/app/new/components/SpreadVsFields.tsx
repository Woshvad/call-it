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
 * SpreadVsFields — sub-form for Spread vs market type.
 *
 * Shows: assetA, assetB (two coin pickers), metric (5 options per CALL-02).
 *
 * Requirement: CALL-02, CALL-37
 */
export function SpreadVsFields({ control, errors }: SpreadVsFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Asset A */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Asset A
        </label>
        <Controller
          name="assetA"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="First asset (e.g. BTC)"
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

      {/* Asset B */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Asset B
        </label>
        <Controller
          name="assetB"
          control={control}
          render={({ field }) => (
            <input
              {...field}
              type="text"
              placeholder="Second asset (e.g. ETH)"
              className={[
                'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                'focus:outline-none focus:border-brand-accent',
              ].join(' ')}
            />
          )}
        />
      </div>

      {/* Spread metric */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Metric
        </label>
        <Controller
          name="eventSubtype"
          control={control}
          render={({ field }) => (
            <select
              value={field.value ?? 'none'}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
              className={[
                'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                'focus:outline-none focus:border-brand-accent',
                'border-brand-border',
              ].join(' ')}
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
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Target Ratio
        </label>
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
