'use client';
/**
 * SignInButtons — interactive sign-in buttons using Privy + wagmi hooks.
 *
 * This component is loaded with dynamic({ ssr: false }) from SignInPage (page.tsx)
 * to ensure usePrivy() and useConnect() are only called after PrivyProvider +
 * WagmiProvider are mounted (via ClientProviders → Providers tree in layout.tsx).
 *
 * Decision D-33: Button order Connect Wallet > Google > Twitter
 * Pitfall 16: Privy readiness timeout fallback after 5s
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-36
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useConnect, injected } from 'wagmi';
import { Button, Tag } from '@call-it/ui';

interface SignInButtonsProps {
  CustodyTooltip: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Pitfall 16 hook — watches usePrivy().ready for timeoutMs.
 * Returns true if Privy is still not ready after the timeout elapses.
 */
function usePrivyReadinessTimeout(timeoutMs: number): boolean {
  const { ready } = usePrivy();
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ready) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setTimedOut(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      setTimedOut(true);
    }, timeoutMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [ready, timeoutMs]);

  return timedOut;
}

export default function SignInButtons({ CustodyTooltip }: SignInButtonsProps) {
  const router = useRouter();
  const { ready, authenticated, login } = usePrivy();
  const { connect } = useConnect();
  const privyTimedOut = usePrivyReadinessTimeout(5000);

  // Redirect to / on successful authentication
  useEffect(() => {
    if (authenticated) {
      router.push('/');
    }
  }, [authenticated, router]);

  const handleConnectWallet = useCallback(() => {
    if (!ready) {
      // Pitfall 16 fallback: Privy not ready — try wagmi injected connector directly
      connect({ connector: injected() });
      return;
    }
    // Privy v3: login accepts loginMethods array to constrain which methods appear
    login({ loginMethods: ['wallet'] });
  }, [ready, login, connect]);

  const handleGoogleLogin = useCallback(() => {
    if (!ready) return;
    // Privy v3 login with google — embedded wallet auto-created (AUTH-03)
    login({ loginMethods: ['google'] });
  }, [ready, login]);

  const handleTwitterLogin = useCallback(() => {
    if (!ready) return;
    // Privy v3 login with twitter — embedded wallet auto-created + handle pre-linked (AUTH-04)
    login({ loginMethods: ['twitter'] });
  }, [ready, login]);

  const hasInjectedWallet =
    typeof window !== 'undefined' &&
    typeof (window as Window & { ethereum?: unknown }).ethereum !== 'undefined';

  return (
    <>
      {/* Pitfall 16 fallback banner */}
      {privyTimedOut && (
        <div style={{ marginBottom: '0.5rem' }}>
          <Tag intent="warning">Privy service issues — Connect Wallet to continue.</Tag>
        </div>
      )}

      {/* D-33: Connect Wallet first (primary intent) */}
      <Button
        intent="primary"
        size="lg"
        onClick={handleConnectWallet}
        style={{ width: '100%' }}
        data-testid="btn-connect-wallet"
      >
        Connect Wallet
      </Button>

      {/* Google OAuth (secondary intent + AUTH-38 custody tooltip) */}
      <CustodyTooltip>
        <Button
          intent="secondary"
          size="lg"
          onClick={handleGoogleLogin}
          disabled={!ready && !privyTimedOut}
          style={{ width: '100%' }}
          data-testid="btn-google"
        >
          Sign in with Google
        </Button>
      </CustodyTooltip>

      {/* Twitter OAuth (secondary intent + AUTH-38 custody tooltip) */}
      <CustodyTooltip>
        <Button
          intent="secondary"
          size="lg"
          onClick={handleTwitterLogin}
          disabled={!ready && !privyTimedOut}
          style={{ width: '100%' }}
          data-testid="btn-twitter"
        >
          Sign in with Twitter
        </Button>
      </CustodyTooltip>

      {/* Pitfall 16 fallback: MetaMask/Rabby direct connector */}
      {hasInjectedWallet && privyTimedOut && (
        <div style={{ textAlign: 'center' }}>
          <Tag intent="info">Or connect MetaMask/Rabby directly</Tag>
        </div>
      )}
    </>
  );
}
