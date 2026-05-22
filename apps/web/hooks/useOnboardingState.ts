/**
 * useOnboardingState — client hook over /api/onboarding/state and /api/onboarding/advance.
 *
 * Fetches the user's onboarding progress from the relayer and provides an
 * `advance(step)` method to advance to the next step.
 *
 * The relayer endpoints are JWT-gated (privySessionPreHandler); this hook
 * automatically attaches the Privy access token to every request.
 *
 * Resume behavior (D-32): `currentStep` maps to the correct onboarding route.
 * Middleware reads this and redirects to `/onboarding/<slug>` if `taglineCommittedAt`
 * is null and the user is not already on /onboarding/*.
 *
 * Requirements: AUTH-19, AUTH-20, D-32, Pitfall B
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export interface OnboardingState {
  currentStep: number;
  handleSetAt: number | null;
  socialsStepCompletedAt: number | null;
  followgraphOptinAt: number | null;
  taglineCommittedAt: number | null;
}

export type OnboardingStepSlug = 'handle' | 'socials' | 'followgraph' | 'fund' | 'tagline';

const STEP_SLUGS: OnboardingStepSlug[] = ['handle', 'socials', 'followgraph', 'fund', 'tagline'];

/** Maps currentStep number to the URL slug */
export function stepNumberToSlug(step: number): OnboardingStepSlug {
  // Steps: 1=handle, 2=socials, 3=followgraph, 4=fund, 5=tagline
  const slug = STEP_SLUGS[step - 1];
  return slug ?? 'handle';
}

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

async function fetchWithAuth<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAYER_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Relayer ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

export interface UseOnboardingStateResult {
  state: OnboardingState | null;
  isLoading: boolean;
  error: string | null;
  advance: (step: OnboardingStepSlug, timestamp?: string) => Promise<OnboardingState>;
  currentSlug: OnboardingStepSlug;
  isComplete: boolean;
}

/**
 * Returns the user's current onboarding state from the relayer.
 * Automatically authenticates using the Privy access token.
 *
 * Provides `advance(step)` to POST to /api/onboarding/advance.
 */
export function useOnboardingState(): UseOnboardingStateResult {
  const { getAccessToken, authenticated } = usePrivy();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    if (!authenticated) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token');

      const result = await fetchWithAuth<OnboardingState>(
        '/api/onboarding/state',
        token,
      );
      setState(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [authenticated, getAccessToken]);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const advance = useCallback(
    async (step: OnboardingStepSlug, timestamp?: string): Promise<OnboardingState> => {
      const token = await getAccessToken();
      if (!token) throw new Error('No Privy access token');

      const result = await fetchWithAuth<OnboardingState>(
        '/api/onboarding/advance',
        token,
        {
          method: 'POST',
          body: JSON.stringify({ step, timestamp: timestamp ?? new Date().toISOString() }),
        },
      );
      setState(result);
      return result;
    },
    [getAccessToken],
  );

  const currentSlug = state ? stepNumberToSlug(state.currentStep) : 'handle';
  const isComplete = state?.taglineCommittedAt !== null && state?.taglineCommittedAt !== undefined;

  return { state, isLoading, error, advance, currentSlug, isComplete };
}
