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
 * 09.2-13 retheme: .brutal-input recipe + Archivo heading; validation/advance
 * logic and all data-testid hooks untouched (D-05/D-14).
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
  // WR-05: normalize() (viem/ens, UTS-46) THROWS on a malformed/disallowed name,
  // and ENS reverse records are user-controlled — guard it so a bad reverse
  // record can't crash the Handle screen on render. Fall back to the raw name.
  let normalizedEns: string | null = null;
  if (ensName) {
    try {
      normalizedEns = normalize(ensName);
    } catch {
      normalizedEns = ensName;
    }
  }
  const defaultHandle = normalizedEns ?? (twitterUsername ? `@${twitterUsername}` : 'you.eth');

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
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      {/* Screen header — Archivo display voice */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            margin: 0,
            letterSpacing: '-0.03em',
            lineHeight: 0.95,
          }}
        >
          YOUR HANDLE
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            margin: 0,
          }}
        >
          This is how other callers will see you.
        </p>
      </div>

      {/* Handle input — .brutal-input recipe */}
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
          className="brutal-input mono"
          style={{
            fontSize: '1rem',
            ...(error ? { borderColor: 'var(--accent-loss)' } : {}),
            ...(isMobile ? { minHeight: '44px' } : {}),
          }}
        />

        {error && (
          <p
            style={{ fontSize: '0.75rem', color: 'var(--accent-loss)', fontFamily: 'var(--font-mono)', margin: 0 }}
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
