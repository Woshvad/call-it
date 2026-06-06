/**
 * Screen 3: Follow-graph opt-in (conditional — only shown if a social was linked on Screen 2)
 *
 * AUTH-16 / D-14: per-platform explicit opt-in ("Show me calls from people I follow?").
 *   - [Yes, show me] → records an opted-IN preference per linked platform, advances the
 *     followgraph step, routes to /onboarding/fund
 *   - [No thanks]    → records a DECLINED preference per linked platform (so the
 *     "From your X / Farcaster" feed section — 01.5-05 — NEVER renders for this user),
 *     advances the followgraph step, routes to /onboarding/fund
 *
 * D-14 consent disclosure (shown verbatim): the follow graph is stored server-side
 * (durable), is viewer-only, and is cleared on disconnect.
 *
 * Per-platform framing: always frames X; additionally frames Farcaster when the user
 * linked a Farcaster account on Screen 2.
 *
 * The preference is persisted locally (per-browser, read by the feed render gate) and
 * best-effort POSTed to the relayer (durable server-side). A persistence failure never
 * blocks advancing (Pitfall 5/16).
 *
 * Requirements: AUTH-16, AUTH-19, D-14
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@call-it/ui';
import { useOnboardingState } from '../../../hooks/useOnboardingState';
import {
  FOLLOW_GRAPH_CONSENT_COPY,
  persistFollowGraphPreference,
  type FollowGraphPreference,
} from '../../../lib/follow-graph-preference';

const RELAYER_BASE = process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '';

export default function FollowGraphPage() {
  const router = useRouter();
  const { user, getAccessToken } = usePrivy();
  const { advance } = useOnboardingState();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFarcasterLinked = user?.linkedAccounts.some((a) => a.type === 'farcaster') ?? false;

  async function handleOptIn(optIn: boolean) {
    setIsLoading(true);
    setError(null);
    try {
      // Build the per-platform preference. X always applies on this screen; Farcaster
      // only when linked. A non-linked platform is left null (no decision needed).
      const pref: FollowGraphPreference = {
        twitter: optIn,
        farcaster: isFarcasterLinked ? optIn : null,
      };

      // Best-effort durable persistence (local + relayer). Never blocks the advance.
      const token = await getAccessToken().catch(() => null);
      await persistFollowGraphPreference(pref, { relayerBase: RELAYER_BASE, token });

      // Advance the followgraph step (so middleware won't re-redirect here).
      await advance('followgraph');
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
        {/* AUTH-16 prompt — per-platform framing */}
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
          {isFarcasterLinked
            ? 'Show me calls from people I follow on X and Farcaster?'
            : 'Show me calls from people I follow on X?'}
        </p>
        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            margin: 0,
          }}
        >
          We&apos;ll surface their active calls on your feed. You can change this in Settings.
        </p>
        {/* D-14 durable-storage consent disclosure (verbatim from the shared constant) */}
        <p
          style={{
            fontSize: '0.7rem',
            color: '#71717A',
            fontFamily: 'monospace',
            margin: '0.25rem 0 0 0',
            lineHeight: 1.5,
          }}
          data-testid="follow-graph-consent"
        >
          {FOLLOW_GRAPH_CONSENT_COPY}
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
          onClick={() => {
            void handleOptIn(true);
          }}
          disabled={isLoading}
          data-testid="follow-graph-yes-button"
        >
          {isLoading ? 'Saving...' : '[ Yes, show me ]'}
        </Button>

        <Button
          intent="secondary"
          size="md"
          onClick={() => {
            void handleOptIn(false);
          }}
          disabled={isLoading}
          data-testid="follow-graph-no-button"
        >
          [ No thanks ]
        </Button>
      </div>
    </>
  );
}
