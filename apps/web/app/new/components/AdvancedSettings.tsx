'use client';

import { useState } from 'react';
import { Controller, type Control } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { CATEGORIES } from '@call-it/shared';

interface AdvancedSettingsProps {
  control: Control<CreateCallInput>;
}

const CATEGORY_LABELS: Record<string, string> = {
  majors: 'Majors (BTC, ETH, etc.)',
  defi: 'DeFi Protocols',
  other: 'Other',
};

/**
 * AdvancedSettings — collapsible advanced block (ROOT skin).
 *
 * openToChallenges is the ONLY toggle (`.toggle-pill` recipe — D-07/D-08: no
 * prototype toggles without backing fields ship). Category select on
 * `.brutal-select`. RHF Controller bindings unchanged.
 *
 * Requirement: CALL-62/63/64
 */
export function AdvancedSettings({ control }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          minHeight: 44,
        }}
        aria-expanded={isOpen}
      >
        <span style={{ color: 'var(--accent-win)' }}>{isOpen ? '▼' : '▶'}</span>
        Advanced Settings
      </button>
      {isOpen && (
        <div className="brutal-card mt-3 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="label-overline">Challenges</div>
            <Controller
              name="openToChallenges"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  onClick={() => field.onChange(!field.value)}
                  className={`toggle-pill ${field.value ? 'on' : ''}`}
                  style={{ minHeight: 44, alignSelf: 'flex-start' }}
                  aria-checked={field.value}
                  role="switch"
                >
                  {field.value ? '✓' : '+'} Open to challenges
                </button>
              )}
            />
            {/* CALL-64: open-to-challenges toggle */}
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
              Allow 1v1 challenges
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="label-overline">Category</label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <select
                  value={field.value ?? 'majors'}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className="brutal-select"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] ?? cat}
                    </option>
                  ))}
                </select>
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
