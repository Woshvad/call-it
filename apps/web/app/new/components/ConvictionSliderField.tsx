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
 * Conviction zone words (prototype CONVICTION_WORDS thresholds — values ported
 * as a local constant per D-05; never import prototype data.jsx).
 */
const CONVICTION_ZONES: ReadonlyArray<{ max: number; word: string; color: string }> = [
  { max: 35, word: 'Hesitant', color: 'var(--text-tertiary)' },
  { max: 65, word: 'Confident', color: 'var(--text-primary)' },
  { max: 84, word: 'Bold', color: 'var(--accent-warning)' },
  { max: 100, word: 'On record', color: 'var(--accent-win)' },
];

/**
 * ConvictionSliderField — RHF-controlled wrapper around the ConvictionBar Radix slider
 * (ROOT skin: zone words + Archivo display number).
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
        <label className="label-overline">Conviction</label>
        {isLoading && (
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            Loading...
          </span>
        )}
      </div>

      <Controller
        name="conviction"
        control={control}
        render={({ field }) => {
          const value = field.value ?? 50;
          const zone =
            CONVICTION_ZONES.find((z) => value <= z.max) ??
            CONVICTION_ZONES[CONVICTION_ZONES.length - 1];
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

              {/* Live conviction number + active zone word (Archivo display voice) */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 48,
                    fontWeight: 900,
                    lineHeight: 1,
                    letterSpacing: '-0.04em',
                    color: zone.color,
                  }}
                >
                  {value}
                  <span style={{ fontSize: 24 }}>%</span>
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: zone.color,
                  }}
                >
                  {zone.word.toUpperCase()}
                </span>
              </div>

              {/* ConvictionBar from @call-it/ui (Plan 04 — UI-51, muted→accent fill) */}
              <ConvictionBar
                value={value}
                min={1}
                max={100}
                onChange={(newVal) => {
                  field.onChange(newVal);
                }}
              />

              {/* Zone ladder — active zone in accent, rest muted */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {CONVICTION_ZONES.map((z) => (
                  <span
                    key={z.word}
                    className="mono"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: zone.word === z.word ? 'var(--accent-win)' : 'var(--text-muted)',
                    }}
                  >
                    {z.word}
                  </span>
                ))}
              </div>

              {error && (
                <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
                  {error.message}
                </div>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
