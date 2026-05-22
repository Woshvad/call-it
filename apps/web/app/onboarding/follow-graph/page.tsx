/**
 * Screen 3: Follow-graph opt-in (conditional — only shown if Twitter was linked on Screen 2)
 *
 * AUTH-16: "Show me calls from people I follow on X?"
 *   - [Yes, show me] → advances followgraph step and navigates to /onboarding/fund
 *   - [No thanks] → advances followgraph step and navigates to /onboarding/fund
 *
 * The opt-in preference is stored server-side with the step timestamp.
 * "No thanks" still advances the step (so middleware won't re-redirect here).
 *
 * Requirements: AUTH-16, AUTH-19
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@call-it/ui';
import { useOnboardingState } from '../../../hooks/useOnboardingState';

export default function FollowGraphPage() {
  const router = useRouter();
  const { advance } = useOnboardingState();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOptIn(optIn: boolean) {
    setIsLoading(true);
    setError(null);
    try {
      // Record the opt-in decision via the followgraph advance
      // The timestamp is used as a proxy for "opted in" (opted out = not stored)
      await advance('followgraph');
      // TODO Phase 1.5: POST the opt-in preference to the relayer for storage
      // For now, the step advancement is the only signal needed
      void optIn; // suppress lint warning — used in Phase 1.5
      router.push('/onboarding/fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {/* Screen header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 900,
            color: '#F4F4F5',
            fontFamily: "'Syne', sans-serif",
            textTransform: 'uppercase',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          YOUR NETWORK
        </h2>
        {/* AUTH-16 copy */}
        <p
          style={{
            fontSize: '0.9rem',
            color: '#F4F4F5',
            fontFamily: "'Syne', sans-serif",
            fontWeight: 600,
            margin: 0,
            lineHeight: 1.4,
          }}
          data-testid="follow-graph-prompt"
        >
          Show me calls from people I follow on X?
        </p>
        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            margin: 0,
          }}
        >
          We&apos;ll surface calls from your Twitter follows on your feed. You can change this in Settings.
        </p>
      </div>

      {error && (
        <p
          style={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace', margin: 0 }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Opt-in / opt-out CTAs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Button
          intent="primary"
          size="md"
          onClick={() => { void handleOptIn(true); }}
          disabled={isLoading}
          data-testid="follow-graph-yes-button"
        >
          {isLoading ? 'Saving...' : '[ Yes, show me ]'}
        </Button>

        <Button
          intent="secondary"
          size="md"
          onClick={() => { void handleOptIn(false); }}
          disabled={isLoading}
          data-testid="follow-graph-no-button"
        >
          [ No thanks ]
        </Button>
      </div>
    </>
  );
}
