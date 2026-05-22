'use client';
/**
 * Sign-in page — 3 Privy login paths + AUTH-37 disclaimer + AUTH-38 custody microcopy
 *
 * Decision D-33: Button order is Connect Wallet > Google > Twitter (locked by Playwright test)
 * AUTH-36: All 3 paths must produce an authenticated session that lands on /
 * AUTH-37: Disclaimer copy "By signing in you agree that your calls become permanent public record."
 * AUTH-38: Custody microcopy on OAuth buttons (Google/Twitter) surfaced via tooltip on hover/focus
 * Pitfall 16: If Privy is unreachable (ready === false after 5s), surface a fallback banner
 *
 * Architecture note:
 * ClientProviders (layout.tsx) loads Providers (PrivyProvider + WagmiProvider) with ssr:false.
 * This page also uses ssr:false for the interactive SignInContent to ensure hooks like usePrivy()
 * and useConnect() only execute after their providers are mounted.
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-36, AUTH-37, AUTH-38, UI-24
 */

import React, { Component, useState } from 'react';
import dynamic from 'next/dynamic';
import { Card } from '@call-it/ui';

/**
 * Error boundary to catch Privy initialization errors gracefully.
 * When Privy can't initialize (e.g., CI with mock app ID), this prevents
 * the entire page from crashing and shows the buttons in a degraded state.
 */
class PrivyErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      // Privy failed to initialize — show direct connect wallet option
      return (
        <div data-testid="privy-error-fallback">
          <p style={{ color: '#A1A1AA', fontSize: '0.875rem', textAlign: 'center', fontFamily: 'monospace' }}>
            Auth service unavailable. Please try again later.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * AUTH-38 custody tooltip for OAuth buttons.
 */
function CustodyTooltip({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocusCapture={() => setVisible(true)}
      onBlurCapture={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            backgroundColor: '#1A1A24',
            border: '2px solid #E8F542',
            padding: '8px 12px',
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            color: '#A1A1AA',
            lineHeight: 1.4,
            zIndex: 10,
            textAlign: 'center',
          }}
        >
          OAuth wallets are custodied by Privy until you export. You can export at any time from
          Settings.
        </div>
      )}
    </div>
  );
}

/**
 * Interactive sign-in buttons — uses Privy/wagmi hooks.
 * Loaded with ssr:false to ensure PrivyProvider + WagmiProvider are available.
 */
const SignInButtons = dynamic(() => import('./SignInButtons'), {
  ssr: false,
  loading: () => (
    <>
      <div
        style={{ height: '52px', backgroundColor: '#E8F542', opacity: 0.3, width: '100%' }}
        aria-hidden="true"
      />
      <div
        style={{ height: '52px', backgroundColor: '#52525B', opacity: 0.3, width: '100%' }}
        aria-hidden="true"
      />
      <div
        style={{ height: '52px', backgroundColor: '#52525B', opacity: 0.3, width: '100%' }}
        aria-hidden="true"
      />
    </>
  ),
});

export default function SignInPage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        backgroundColor: '#09090E',
      }}
    >
      {/* Brand title */}
      <h1
        style={{
          fontSize: '6rem',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          color: '#E8F542',
          marginBottom: '0.5rem',
          fontFamily: "'Syne', sans-serif",
          textTransform: 'uppercase',
          lineHeight: 1,
          textAlign: 'center',
        }}
      >
        CALL IT
      </h1>
      <p
        style={{
          fontSize: '1rem',
          color: '#A1A1AA',
          marginBottom: '2.5rem',
          fontFamily: 'monospace',
          textAlign: 'center',
        }}
      >
        Be right in public.
      </p>

      {/* Sign-in card */}
      <Card
        style={{
          width: '100%',
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* D-33: button order — Connect Wallet > Google > Twitter */}
        {/* SignInButtons uses Privy/wagmi hooks, loaded client-side only */}
        <PrivyErrorBoundary>
          <SignInButtons CustodyTooltip={CustodyTooltip} />
        </PrivyErrorBoundary>

        {/* AUTH-37: Permanent record disclaimer — always visible */}
        <p
          style={{
            fontSize: '0.75rem',
            color: '#52525B',
            textAlign: 'center',
            fontFamily: 'monospace',
            lineHeight: 1.5,
            marginTop: '0.5rem',
          }}
          data-testid="disclaimer"
        >
          By signing in you agree that your calls become permanent public record. No edits. No
          deletes. Wins and losses both count.
        </p>
      </Card>
    </main>
  );
}
