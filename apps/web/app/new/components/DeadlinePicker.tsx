'use client';

import { useState } from 'react';
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

/** Deadline quick-pick chips (prototype DEADLINES row) — seconds from now. */
const DEADLINE_PRESETS: ReadonlyArray<{ key: string; label: string; seconds: number }> = [
  { key: '24h', label: '24H', seconds: 86400 },
  { key: '3d', label: '3D', seconds: 86400 * 3 },
  { key: '7d', label: '7D', seconds: 86400 * 7 },
  { key: '14d', label: '14D', seconds: 86400 * 14 },
  { key: '30d', label: '30D', seconds: 86400 * 30 },
  { key: '90d', label: '90D', seconds: 86400 * 90 },
];

/** Derive the active chip from the current expiry (±1h tolerance per preset). */
function derivePreset(expiryBigint: bigint): string {
  if (!expiryBigint || expiryBigint === 0n) return 'custom';
  const now = Math.floor(Date.now() / 1000);
  const expiry = Number(expiryBigint);
  for (const p of DEADLINE_PRESETS) {
    if (Math.abs(expiry - (now + p.seconds)) < 3600) return p.key;
  }
  return 'custom';
}

/**
 * DeadlinePicker — `.chip` quick-pick row (24H/3D/7D/14D/30D/90D/Custom; active
 * chip = cream inverse) + datetime-local input in Custom mode + UTC-day-bucket label.
 *
 * Chips write through the SAME RHF Controller (field.onChange) as the datetime
 * input — no new validation path; zod expiry bounds still apply at submit.
 *
 * PITFALL-12 / CALL-46: Shows BOTH the deadline entry AND the UTC day label below.
 * When the user picks "11:32 PM PST", the label shows the next UTC day's bucket —
 * surfacing the boundary surprise before it becomes a contract revert.
 *
 * The "Hash bucket:" label is the D-12 compliance point: this is what the contract
 * uses to deduplicate calls (not the user's local day).
 *
 * Uses dayBucketUtc from @call-it/shared (D-29 parity with DuplicateHashLib.sol).
 */
export function DeadlinePicker({ control, error }: DeadlinePickerProps) {
  // null = derive from the current field value; set once the user picks a chip.
  const [chipMode, setChipMode] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <label className="label-overline">Deadline</label>

      <Controller
        name="expiry"
        control={control}
        render={({ field }) => {
          const expiryBigint = field.value ?? 0n;
          const hasExpiry = expiryBigint > 0n;
          const bucketLabel = hasExpiry ? formatUtcDay(expiryBigint) : null;
          const active = chipMode ?? derivePreset(expiryBigint);

          return (
            <div className="flex flex-col gap-2">
              {/* Quick-pick chip row — active chip = cream inverse (.chip.active) */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DEADLINE_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`chip ${active === p.key ? 'active' : ''}`}
                    style={{ minHeight: 44 }}
                    onClick={() => {
                      setChipMode(p.key);
                      field.onChange(BigInt(Math.floor(Date.now() / 1000) + p.seconds));
                    }}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`chip ${active === 'custom' ? 'active' : ''}`}
                  style={{ minHeight: 44 }}
                  onClick={() => setChipMode('custom')}
                >
                  Custom
                </button>
              </div>

              {/* Custom mode: datetime-local entry (same RHF field) */}
              {active === 'custom' && (
                <input
                  type="datetime-local"
                  value={bigIntToDatetimeLocal(expiryBigint)}
                  onChange={(e) => {
                    const bigVal = datetimeLocalToBigInt(e.target.value);
                    field.onChange(bigVal);
                  }}
                  onBlur={field.onBlur}
                  className="brutal-input mono"
                  style={error ? { borderColor: 'var(--accent-loss)' } : undefined}
                />
              )}

              {/* PITFALL-12 / CALL-46: UTC day bucket label — updates live as user picks */}
              {bucketLabel && (
                <div
                  className="mono"
                  style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}
                  aria-label="UTC hash bucket"
                >
                  ↳ Hash bucket: {bucketLabel}
                </div>
              )}

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
