/**
 * Screen 4: Tagline commitment (AUTH-21)
 *
 * Displays the SPEC-LOCKED AUTH-21 commitment line in large Syne type:
 *   "EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON'T SUGAR-COAT."
 *
 * A single [ Commit ] button POSTs /api/onboarding/advance { step: 'tagline' }
 * then redirects to / (the main feed — onboarding complete).
 *
 * This is the completion gate: taglineCommittedAt IS NOT NULL = onboarding done.
 * Middleware stops redirecting after this screen is submitted.
 *
 * Requirements: AUTH-21, AUTH-19
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@call-it/ui';
import { useOnboardingState } from '../../../hooks/useOnboardingState';

export default function TaglinePage() {
  const router = useRouter();
  const { advance } = useOnboardingState();
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCommit() {
    setIsCommitting(true);
    setError(null);
    try {
      await advance('tagline');
      // Onboarding complete — redirect to the main feed
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit. Please try again.');
    } finally {
      setIsCommitting(false);
    }
  }

  return (
    <>
      {/* AUTH-21 SPEC-LOCKED COMMITMENT LINE — do NOT modify this copy */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            fontFamily: "'Syne', sans-serif",
            color: '#E8F542',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            margin: 0,
          }}
          data-testid="commitment-line"
        >
          EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON&apos;T SUGAR-COAT.
        </p>

        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            lineHeight: 1.6,
            margin: 0,
            maxWidth: '360px',
          }}
        >
          Your calls are permanent public record. Every win and every loss is logged onchain and
          visible to anyone. This is the product.
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

      {/* Commit button */}
      <Button
        intent="primary"
        size="lg"
        onClick={() => { void handleCommit(); }}
        disabled={isCommitting}
        data-testid="commit-button"
        style={{ width: '100%', letterSpacing: '0.1em' }}
      >
        {isCommitting ? 'Committing...' : '[ COMMIT ]'}
      </Button>
    </>
  );
}
