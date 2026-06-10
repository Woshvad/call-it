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
 * CriteriaField — `.brutal-textarea` in mono voice with character counter and
 * the "VERIFIED CRITERIA" tag (ROOT skin).
 *
 * - Shows the "VERIFIED CRITERIA" win Tag when length >= 50 characters (CALL-19)
 * - Shows required indicator for event subtypes that need criteria (CALL-15/16)
 *
 * Requirement: CALL-15, CALL-16, CALL-19, CALL-49
 */
export function CriteriaField({ control, errors, isRequired }: CriteriaFieldProps) {
  const criteriaText = useWatch({ control, name: 'criteriaText' }) ?? '';
  const charCount = criteriaText.length;
  const isVerified = charCount >= VERIFIED_THRESHOLD;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="label-overline">
          Resolution Criteria
          {isRequired && (
            <span style={{ color: 'var(--accent-loss)', fontWeight: 700, marginLeft: 6 }}>
              · required
            </span>
          )}
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
                ? "Why now? What's the read? What exactly counts as a win — be specific, the settlement oracle reads this (min 50 chars)"
                : "Why now? What's the read?"
            }
            className="brutal-textarea mono"
            style={errors.criteriaText ? { borderColor: 'var(--accent-loss)' } : undefined}
          />
        )}
      />

      {/* Character counter */}
      <div className="flex items-center justify-between">
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: isVerified ? 'var(--accent-win)' : 'var(--text-tertiary)',
          }}
        >
          {charCount} / {VERIFIED_THRESHOLD} chars{' '}
          {isVerified ? '✓' : `(need ${VERIFIED_THRESHOLD - charCount} more)`}
        </div>

        {errors.criteriaText && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {errors.criteriaText.message}
          </div>
        )}
      </div>
    </div>
  );
}
