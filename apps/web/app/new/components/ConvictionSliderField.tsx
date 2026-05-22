'use client';

import { Controller, type Control, type FieldError } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import {
  HIGH_CONVICTION_THRESHOLD,
  CONVICTION_FLOOR_MIN_CALLS,
  CONVICTION_AUTOCAP,
} from '@call-it/shared';
import { ConvictionBar, Tag } from '@call-it/ui';
import { useSettledCalls } from '../hooks/useSettledCalls';

interface ConvictionSliderFieldProps {
  control: Control<CreateCallInput>;
  error?: FieldError;
}

/**
 * ConvictionSliderField — RHF-controlled wrapper around the ConvictionBar Radix slider.
 *
 * Auto-cap warning: When settledCalls < CONVICTION_FLOOR_MIN_CALLS (10) AND
 * conviction >= HIGH_CONVICTION_THRESHOLD (85), shows a warning Tag:
 *   "New users are capped at 84 until you've settled 10+ calls"
 *
 * This mirrors the contract's Gate 6.3 behavior (ConvictionCapped event, not revert).
 * The actual cap is enforced at submit time via createCallSchemaStrict.
 *
 * Requirements: CALL-29, CALL-30, CALL-31, UI-51
 */
export function ConvictionSliderField({ control, error }: ConvictionSliderFieldProps) {
  const { settledCalls, isLoading } = useSettledCalls();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Conviction
        </label>
        {isLoading && (
          <span className="text-xs font-mono text-brand-muted">Loading...</span>
        )}
      </div>

      <Controller
        name="conviction"
        control={control}
        render={({ field }) => {
          const value = field.value ?? 50;
          const showCapWarning =
            !isLoading &&
            settledCalls < CONVICTION_FLOOR_MIN_CALLS &&
            value >= HIGH_CONVICTION_THRESHOLD;

          return (
            <div className="flex flex-col gap-2">
              {/* Auto-cap warning above the slider (CALL-30/31) */}
              {showCapWarning && (
                <Tag intent="warning" className="text-xs font-mono">
                  New users are capped at {CONVICTION_AUTOCAP} until you&apos;ve settled{' '}
                  {CONVICTION_FLOOR_MIN_CALLS}+ calls
                </Tag>
              )}

              {/* ConvictionBar from @call-it/ui (Plan 04 — UI-51) */}
              <ConvictionBar
                value={value}
                min={1}
                max={100}
                onChange={(newVal) => {
                  field.onChange(newVal);
                }}
              />

              {/* Value display */}
              <div className="flex items-center justify-between text-xs font-mono text-brand-muted">
                <span>1</span>
                <span className="text-brand-accent font-bold text-sm">{value}%</span>
                <span>100</span>
              </div>

              {error && (
                <div className="text-red-500 text-xs font-mono">{error.message}</div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
