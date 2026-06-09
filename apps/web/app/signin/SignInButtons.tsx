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

/** Official 4-color Google "G" mark (stays multicolor on both rest + accent-hover fills). */
function GoogleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

/** Monochrome X (Twitter) mark — currentColor flips white→black on the accent hover. */
function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}

export default function SignInButtons({ CustodyTooltip }: SignInButtonsProps) {
  const router = useRouter();
  const { ready, authenticated, login, getAccessToken, logout } = usePrivy();
  const { connect } = useConnect();
  const privyTimedOut = usePrivyReadinessTimeout(5000);

  // On successful authentication: write the Privy access token to a first-party
  // cookie, THEN redirect to /.
  //
  // Why the cookie write is required (fix 2026-05-29):
  //   Privy stores its session in localStorage by default and does NOT set a
  //   first-party `privy-token` cookie on the app domain. The Next.js middleware
  //   (server-side) can only read first-party cookies, so without this it never
  //   sees the session and bounces every authenticated user back to /signin.
  //   The middleware forwards this token to the relayer, which validates it with
  //   @privy-io/server-auth `verifyAuthToken` (the ACCESS token). Surfaced by the
  //   first real OAuth login — browser E2E is skipped in CI.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    void (async () => {
      let token: string | null = null;
      try {
        token = await getAccessToken();
      } catch {
        // getAccessToken threw — treat as a dead session (handled below).
        token = null;
      }
      if (cancelled) return;
      if (token) {
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        // Max-Age ~1h matches Privy access-token lifetime; a returning user with
        // a live localStorage session but expired cookie self-heals via the
        // /signin bounce, which re-runs this effect.
        document.cookie = `privy-token=${token}; path=/; SameSite=Lax; Max-Age=3600${secure}`;
        router.push('/');
      } else {
        // Split-brain recovery: Privy reports authenticated===true from a leftover
        // localStorage session, but getAccessToken can no longer mint a valid access
        // token. The old code did nothing here, stranding the user (bell shows,
        // login() no-ops while a session exists, protected routes bounce to /signin).
        // Clear the stale cookie and log out so the user lands on a clean signed-out
        // /signin. After logout, authenticated→false and this effect early-returns —
        // no loop, and logout does NOT trigger login().
        const secure = window.location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `privy-token=; path=/; SameSite=Lax; Max-Age=0${secure}`;
        try {
          await logout();
        } catch {
          // logout failed — leave the user on /signin rather than loop.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, logout, router]);

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
        className="w-full font-mono uppercase tracking-wide font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
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
          className="w-full font-mono uppercase tracking-wide font-semibold bg-brand-surface text-white border-2 border-brand-accent shadow-[4px_4px_0_0_#000] transition-all duration-100 ease-out hover:bg-brand-accent hover:text-black hover:border-black hover:shadow-[3px_3px_0_0_#E8F542] active:shadow-[2px_2px_0_0_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
          data-testid="btn-google"
        >
          <span className="inline-flex items-center gap-2">
            <GoogleIcon />
            Sign in with Google
          </span>
        </Button>
      </CustodyTooltip>

      {/* X (formerly Twitter) OAuth (secondary intent + AUTH-38 custody tooltip) */}
      <CustodyTooltip>
        <Button
          intent="secondary"
          size="lg"
          onClick={handleTwitterLogin}
          disabled={!ready && !privyTimedOut}
          className="w-full font-mono uppercase tracking-wide font-semibold bg-brand-surface text-white border-2 border-brand-accent shadow-[4px_4px_0_0_#000] transition-all duration-100 ease-out hover:bg-brand-accent hover:text-black hover:border-black hover:shadow-[3px_3px_0_0_#E8F542] active:shadow-[2px_2px_0_0_#000] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
          data-testid="btn-twitter"
        >
          <span className="inline-flex items-center gap-2">
            <XIcon />
            Sign in with X
          </span>
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
