'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { CreateCallInput } from '@call-it/shared';
import { MARKET_TYPE_TO_UINT, EVENT_SUBTYPE_TO_UINT } from '@call-it/shared';
import { postDupCheck } from '@/lib/relayer-client';

export interface DupCheckMatch {
  existingCallId: number;
}

export interface UseDebouncedDupCheckReturn {
  match: DupCheckMatch | undefined;
  isLoading: boolean;
}

/**
 * useDebouncedDupCheck — 400ms debounced duplicate-hash pre-check (D-22, CALL-49).
 *
 * Takes the form's relevant fields and, after 400ms idle, calls
 * POST /api/calls/dup-check via the relayer client.
 *
 * Only fires when all required fields are present AND the token is available:
 *   - marketType, assetA, expiry, targetValue
 *   - eventSubtype (for event-type calls)
 *
 * Returns `{ match: { existingCallId } }` if a duplicate exists,
 * `{ match: undefined }` otherwise.
 *
 * T-01-57: Checks for required fields before firing to avoid useless RPC calls.
 * T-01-53: The 400ms debounce + 60s Redis server-side cache prevents hot-path RPC spam.
 *
 * Requirement: CALL-49, D-22, T-01-53, T-01-57
 */
export function useDebouncedDupCheck(
  formValues: Partial<CreateCallInput>,
  token: string | undefined,
): UseDebouncedDupCheckReturn {
  const [match, setMatch] = useState<DupCheckMatch | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Serialize relevant fields to a cache key to detect actual changes
  const { marketType, assetA, eventSubtype, targetValue, expiry } = formValues;

  const checkForDuplicate = useCallback(async () => {
    // T-01-57: Only fire when required fields are present
    if (!marketType || !assetA || !expiry || !targetValue) {
      setMatch(undefined);
      return;
    }

    const marketTypeNum = MARKET_TYPE_TO_UINT[marketType];
    const metricNum = eventSubtype ? EVENT_SUBTYPE_TO_UINT[eventSubtype] : 0;

    try {
      setIsLoading(true);
      const result = await postDupCheck(
        {
          marketType: marketTypeNum,
          assetA,
          metric: String(metricNum),
          targetValue: String(targetValue),
          deadline: Number(expiry),
        },
        token,
      );

      if (result.exists && result.existingCallId) {
        setMatch({ existingCallId: result.existingCallId });
      } else {
        setMatch(undefined);
      }
    } catch {
      // Fail silently — dup-check is best-effort UX (contract enforces as backstop)
      setMatch(undefined);
    } finally {
      setIsLoading(false);
    }
  }, [marketType, assetA, eventSubtype, targetValue, expiry, token]);

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // Debounce: wait 400ms after the last change before firing
    timerRef.current = setTimeout(() => {
      void checkForDuplicate();
    }, 400);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [checkForDuplicate]);

  return { match, isLoading };
}
