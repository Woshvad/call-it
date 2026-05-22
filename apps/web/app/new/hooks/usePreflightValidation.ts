'use client';

import { useState, useCallback } from 'react';
import type { UseFormSetError, FieldPath } from 'react-hook-form';
import type { CreateCallInput } from '@call-it/shared';
import type { PreflightInput, PreflightSuccessResponse } from '@/lib/relayer-client';
import { postPreflight, RelayerError } from '@/lib/relayer-client';

export interface PreflightState {
  isRunning: boolean;
  lastResult: PreflightSuccessResponse | null;
  error: string | null;
}

/**
 * usePreflightValidation — calls POST /api/calls/preflight and sets RHF errors on failure.
 *
 * D-28: Preflight MUST run before sendUserOperation. The publish modal pre-checks
 * before allowing the user to sign.
 *
 * D-31: On 422, field-level errors from the relayer are mapped to RHF field errors
 * via `form.setError()`. This surfaces them inline next to the relevant field.
 *
 * Requirement: D-28, D-31, CALL-25, CALL-34, CALL-35, CALL-36
 */
export function usePreflightValidation(
  setError: UseFormSetError<CreateCallInput>,
) {
  const [state, setState] = useState<PreflightState>({
    isRunning: false,
    lastResult: null,
    error: null,
  });

  const runPreflight = useCallback(
    async (input: PreflightInput, token?: string): Promise<PreflightSuccessResponse | null> => {
      setState((s) => ({ ...s, isRunning: true, error: null }));

      try {
        const result = await postPreflight(input, token);
        setState({ isRunning: false, lastResult: result, error: null });
        return result;
      } catch (err) {
        if (err instanceof RelayerError && err.status === 422) {
          // D-31: Map relayer field errors back to RHF setError calls
          const body = err as unknown as { fieldErrors?: Record<string, string[]> };
          if (body.fieldErrors) {
            Object.entries(body.fieldErrors).forEach(([field, messages]) => {
              const message = messages[0] ?? 'Validation error';
              // Map relayer field names to RHF field paths
              if (field === 'root') {
                setError('root', { type: 'preflight', message });
              } else {
                try {
                  setError(field as FieldPath<CreateCallInput>, {
                    type: 'preflight',
                    message,
                  });
                } catch {
                  // Unknown field — add to root
                  setError('root', { type: 'preflight', message: `${field}: ${message}` });
                }
              }
            });
          }

          const message = err.message ?? 'Preflight validation failed';
          setState({ isRunning: false, lastResult: null, error: message });
        } else {
          const message =
            err instanceof Error ? err.message : 'Preflight request failed';
          setState({ isRunning: false, lastResult: null, error: message });
        }
        return null;
      }
    },
    [setError],
  );

  return {
    ...state,
    runPreflight,
  };
}
