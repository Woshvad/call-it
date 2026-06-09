/**
 * Screen 2: Connect Socials (AUTH-07, AUTH-08)
 *
 * Renders the reusable <SocialLinkControls mode="onboarding" /> for real Twitter (X)
 * and Farcaster link flows (01.5-04 — replaces the Plan-06 as-if-linked Twitter stub
 * and the "Coming soon" Farcaster disabled button).
 *
 * "Skip for now" is allowed (AUTH-08). Both "Continue" and "Skip for now" advance the
 * `socials` onboarding step. Routing after advance:
 *   - If Twitter linked (the follow-graph applies) → /onboarding/follow-graph (Screen 3)
 *   - If skipped / nothing linked → /onboarding/fund (skip the follow-graph screen)
 *
 * Linking is purely additive (Pitfall 5/16): a link failure surfaces inline in
 * SocialLinkControls and NEVER blocks advancing or skipping.
 *
 * Requirements: AUTH-07, AUTH-08, AUTH-19
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@call-it/ui';
import { SocialLinkControls } from '../../components/SocialLinkControls';
import { useOnboardingState } from '../../../hooks/useOnboardingState';
import { useIsMobile } from '../../hooks/useIsMobile';

export default function SocialsPage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { advance } = useOnboardingState();
  const isMobile = useIsMobile(); // D-03: >=44px touch targets at mobile only
  const [isContinuing, setIsContinuing] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTwitterLinked = user?.linkedAccounts.some((a) => a.type === 'twitter_oauth') ?? false;
  const isFarcasterLinked = user?.linkedAccounts.some((a) => a.type === 'farcaster') ?? false;
  const hasAnyLink = isTwitterLinked || isFarcasterLinked;

  async function handleContinue() {
    setIsContinuing(true);
    setError(null);
    try {
      await advance('socials');
      // If the user linked a social, the follow-graph opt-in (Screen 3) applies.
      // Otherwise skip straight to fund.
      router.push(hasAnyLink ? '/onboarding/follow-graph' : '/onboarding/fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsContinuing(false);
    }
  }

  async function handleSkip() {
    setIsSkipping(true);
    setError(null);
    try {
      await advance('socials');
      // Skip follow-graph — go directly to fund
      router.push('/onboarding/fund');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsSkipping(false);
    }
  }

  return (
    <>
      {/* Screen header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
          CONNECT SOCIALS
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            margin: 0,
          }}
        >
          Link your accounts to let others find your calls. Optional — verification has
          no effect on your stakes, fees, or reputation.
        </p>
      </div>

      {/* Real link flows (Twitter via Privy, Farcaster via Auth Kit) */}
      <SocialLinkControls mode="onboarding" />

      {error && (
        <p
          style={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace', margin: 0 }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Continue — advances socials step; routes to follow-graph if linked */}
      <Button
        intent="primary"
        size="md"
        onClick={() => {
          void handleContinue();
        }}
        disabled={isContinuing || isSkipping}
        data-testid="socials-continue-button"
        style={isMobile ? { minHeight: '44px' } : undefined}
      >
        {isContinuing ? 'Saving...' : 'Continue'}
      </Button>

      {/* Skip option (AUTH-08) */}
      <Button
        intent="secondary"
        size="sm"
        onClick={() => {
          void handleSkip();
        }}
        disabled={isSkipping || isContinuing}
        data-testid="skip-socials-button"
        style={isMobile ? { minHeight: '44px' } : undefined}
      >
        {isSkipping ? 'Skipping...' : 'Skip for now'}
      </Button>
    </>
  );
}
