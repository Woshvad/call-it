'use client';

import { Controller, type Control, type FieldError } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { dayBucketUtc } from '@call-it/shared';

interface DeadlinePickerProps {
  control: Control<CreateCallInput>;
  error?: FieldError;
}

/**
 * Format a UTC day bucket timestamp as "YYYY-MM-DD HH:mm:ss UTC".
 * Used to display the hash bucket label (PITFALL-12 / CALL-46).
 */
function formatUtcDay(expiryBigint: bigint): string {
  const bucketTs = Number(dayBucketUtc(expiryBigint));
  const d = new Date(bucketTs * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

/**
 * Convert a datetime-local value (string "YYYY-MM-DDTHH:mm") to BigInt Unix seconds.
 */
function datetimeLocalToBigInt(value: string): bigint {
  if (!value) return 0n;
  const ms = new Date(value).getTime();
  if (isNaN(ms)) return 0n;
  return BigInt(Math.floor(ms / 1000));
}

/**
 * Convert a BigInt Unix seconds value to datetime-local string "YYYY-MM-DDTHH:mm".
 */
function bigIntToDatetimeLocal(value: bigint): string {
  if (!value || value === 0n) return '';
  const d = new Date(Number(value) * 1000);
  if (isNaN(d.getTime())) return '';
  // Format as local datetime for the input
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * DeadlinePicker — datetime-local input + UTC-day-bucket label.
 *
 * PITFALL-12 / CALL-46: Shows BOTH the local time entry AND the UTC day label below.
 * When the user picks "11:32 PM PST", the label shows the next UTC day's bucket —
 * surfacing the boundary surprise before it becomes a contract revert.
 *
 * The "Hash bucket:" label is the D-12 compliance point: this is what the contract
 * uses to deduplicate calls (not the user's local day).
 *
 * Uses dayBucketUtc from @call-it/shared (D-29 parity with DuplicateHashLib.sol).
 */
export function DeadlinePicker({ control, error }: DeadlinePickerProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
        Deadline
      </label>

      <Controller
        name="expiry"
        control={control}
        render={({ field }) => {
          const expiryBigint = field.value ?? 0n;
          const hasExpiry = expiryBigint > 0n;
          const bucketLabel = hasExpiry ? formatUtcDay(expiryBigint) : null;

          return (
            <div className="flex flex-col gap-1">
              <input
                type="datetime-local"
                value={bigIntToDatetimeLocal(expiryBigint)}
                onChange={(e) => {
                  const bigVal = datetimeLocalToBigInt(e.target.value);
                  field.onChange(bigVal);
                }}
                onBlur={field.onBlur}
                className={[
                  'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                  'focus:outline-none focus:border-brand-accent',
                  error ? 'border-red-500' : 'border-brand-border',
                ].join(' ')}
              />

              {/* PITFALL-12 / CALL-46: UTC day bucket label — updates live as user types */}
              {bucketLabel && (
                <div
                  className="text-brand-muted text-sm font-mono"
                  aria-label="UTC hash bucket"
                >
                  Hash bucket: {bucketLabel}
                </div>
              )}

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
