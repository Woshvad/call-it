/**
 * Screen 1: Handle — set your display handle (AUTH-19, AUTH-20)
 *
 * Pre-fills from:
 *   1. Twitter username (`linkedAccounts.twitter_oauth.username`) — Twitter path
 *   2. ENS name via wagmi `useEnsName` — Wallet path
 *   3. 'you.eth' placeholder — fallback
 *
 * AUTH-22: CustodyDisclosureCard is rendered on this screen (guaranteed display moment).
 * AUTH-44: No wallet address rendered — handle-only.
 *
 * On submit: calls `useOnboardingState().advance('handle')` then navigates to /onboarding/socials.
 *
 * Requirements: AUTH-19, AUTH-20, AUTH-22, AUTH-44
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useEnsName } from 'wagmi';
import { useAccount } from 'wagmi';
import { Button } from '@call-it/ui';
import { CustodyDisclosureCard } from '../../../components/CustodyDisclosureCard';
import { useOnboardingState } from '../../../hooks/useOnboardingState';
import { useIsMobile } from '../../hooks/useIsMobile';
import { normalize } from 'viem/ens';

function getTwitterUsername(user: ReturnType<typeof usePrivy>['user']): string | null {
  if (!user) return null;
  const twitterAccount = user.linkedAccounts.find(
    (a) => a.type === 'twitter_oauth',
  ) as { type: 'twitter_oauth'; username?: string } | undefined;
  return twitterAccount?.username ?? null;
}

export default function HandlePage() {
  const router = useRouter();
  const { user } = usePrivy();
  const { address } = useAccount();
  const { advance, isLoading: stateLoading } = useOnboardingState();
  const isMobile = useIsMobile(); // D-03: >=44px touch targets at mobile only

  // ENS reverse-record lookup (Wallet path — D-13)
  const { data: ensName } = useEnsName({
    address,
    chainId: 1, // Mainnet ENS resolution (D-13)
    query: { enabled: !!address },
  });

  // Pre-fill handle from: ENS → Twitter → placeholder
  const twitterUsername = getTwitterUsername(user);
  const defaultHandle = ensName
    ? normalize(ensName)
    : twitterUsername
      ? `@${twitterUsername}`
      : 'you.eth';

  const [handle, setHandle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set pre-filled handle once resolved
  useEffect(() => {
    setHandle(defaultHandle);
  }, [defaultHandle]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await advance('handle');
      router.push('/onboarding/socials');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save handle. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (stateLoading) {
    return (
      <div style={{ textAlign: 'center', color: '#A1A1AA', fontFamily: 'monospace', fontSize: '0.875rem' }}>
        Loading...
      </div>
    );
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
          YOUR HANDLE
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            margin: 0,
          }}
        >
          This is how other callers will see you.
        </p>
      </div>

      {/* Handle input */}
      <form
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        data-testid="handle-form"
      >
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="you.eth"
          maxLength={32}
          autoFocus
          data-testid="handle-input"
          style={{
            width: '100%',
            padding: '12px 14px',
            backgroundColor: '#0F0F14',
            border: '2px solid #3F3F46',
            color: '#F4F4F5',
            fontFamily: 'monospace',
            fontSize: '1rem',
            outline: 'none',
            boxSizing: 'border-box',
            ...(isMobile ? { minHeight: '44px' } : {}),
          }}
          onFocus={(e) => { e.target.style.borderColor = '#E8F542'; }}
          onBlur={(e) => { e.target.style.borderColor = '#3F3F46'; }}
        />

        {error && (
          <p
            style={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace', margin: 0 }}
            role="alert"
          >
            {error}
          </p>
        )}

        <Button
          type="submit"
          intent="primary"
          size="md"
          disabled={!handle.trim() || isSubmitting}
          data-testid="handle-submit"
          style={isMobile ? { minHeight: '44px' } : undefined}
        >
          {isSubmitting ? 'Saving...' : 'NEXT →'}
        </Button>
      </form>

      {/* AUTH-22: Custody disclosure — guaranteed render moment on Screen 1 */}
      <CustodyDisclosureCard data-testid="custody-disclosure" />
    </>
  );
}
