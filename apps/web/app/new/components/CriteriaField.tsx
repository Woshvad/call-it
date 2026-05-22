'use client';

import { useWatch, Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import { Tag } from '@call-it/ui';

interface CriteriaFieldProps {
  control: Control<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
  isRequired: boolean;
}

const VERIFIED_THRESHOLD = 50; // characters

/**
 * CriteriaField — textarea with character counter and "VERIFIED CRITERIA" tag.
 *
 * - Shows the "VERIFIED CRITERIA" green Tag when length >= 50 characters (CALL-19)
 * - Shows required indicator for event subtypes that need criteria (CALL-15/16)
 *
 * Requirement: CALL-15, CALL-16, CALL-19, CALL-49
 */
export function CriteriaField({ control, errors, isRequired }: CriteriaFieldProps) {
  const criteriaText = useWatch({ control, name: 'criteriaText' }) ?? '';
  const charCount = criteriaText.length;
  const isVerified = charCount >= VERIFIED_THRESHOLD;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Resolution Criteria
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </label>

        {isVerified && (
          <Tag intent="success" className="text-xs">
            VERIFIED CRITERIA
          </Tag>
        )}
      </div>

      <Controller
        name="criteriaText"
        control={control}
        render={({ field }) => (
          <textarea
            {...field}
            value={field.value ?? ''}
            rows={4}
            placeholder={
              isRequired
                ? 'Required: Describe the specific, verifiable criteria for this call to settle as WIN (min 50 chars)'
                : 'Optional: Add resolution criteria to make your call more credible'
            }
            className={[
              'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
              'focus:outline-none focus:border-brand-accent resize-none',
              errors.criteriaText ? 'border-red-500' : 'border-brand-border',
            ].join(' ')}
          />
        )}
      />

      {/* Character counter */}
      <div className="flex items-center justify-between">
        <div
          className={[
            'text-xs font-mono',
            charCount >= VERIFIED_THRESHOLD ? 'text-green-600' : 'text-brand-muted',
          ].join(' ')}
        >
          {charCount} / {VERIFIED_THRESHOLD} chars {isVerified ? '✓' : `(need ${VERIFIED_THRESHOLD - charCount} more)`}
        </div>

        {errors.criteriaText && (
          <div className="text-red-500 text-xs font-mono">{errors.criteriaText.message}</div>
        )}
      </div>
    </div>
  );
}
