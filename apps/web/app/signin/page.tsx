'use client';
/**
 * Sign-in page — the prototype `home.jsx` landing carrying the existing Privy auth flow.
 *
 * D-12 (decision of record): the logged-out marketing surface is the RESTYLED /signin —
 * NOT a public-`/` middleware carve-out. middleware.ts PUBLIC_PREFIXES, the privy-token
 * cookie flow, and the onboarding redirect chain are all UNTOUCHED. AppShell already
 * renders /signin full-bleed (no sidebar/header chrome — plan 09.2-03).
 *
 * D-07: the prototype's platform totals (callers-on-record count, total pot) have no
 * data source and are NOT rendered — the LIVE status strip keeps only its working parts
 * (live dot + "LIVE NOW"). The mini live-feed + leaderboard preview sections from
 * home.jsx need live data and are HIDDEN (no new endpoints). How-it-works,
 * differentiator, fees, and the risk callout port as static copy.
 *
 * Preserved behavioral elements (T-09.2-35):
 *   - PrivyErrorBoundary with data-testid="privy-error-fallback"
 *   - CustodyTooltip (AUTH-38 custody microcopy, role="tooltip")
 *   - SignInButtons dynamic mount (ssr:false — Privy/wagmi hooks after providers)
 *   - Disclaimer with data-testid="disclaimer" + /terms link (AUTH-37)
 *
 * Decision D-33: Button order is Connect Wallet > Google > Twitter (locked by Playwright test)
 * AUTH-36: All 3 paths must produce an authenticated session that lands on /
 * Pitfall 16: If Privy is unreachable (ready === false after 5s), surface a fallback banner
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-36, AUTH-37, AUTH-38, AUTH-44, UI-48
 */

import React, { Component, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useIsMobile } from '../hooks/useIsMobile';

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
          <p
            className="mono"
            style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', textAlign: 'center' }}
          >
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
          className="mono"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--border-strong)',
            boxShadow: 'var(--shadow-brutal-sm)',
            padding: '8px 12px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
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
        style={{ height: '60px', backgroundColor: 'var(--bg-inverse)', opacity: 0.25, width: '100%' }}
        aria-hidden="true"
      />
      <div
        style={{ height: '52px', border: '2px solid var(--border-active)', opacity: 0.4, width: '100%' }}
        aria-hidden="true"
      />
      <div
        style={{ height: '52px', border: '2px solid var(--border-active)', opacity: 0.4, width: '100%' }}
        aria-hidden="true"
      />
    </>
  ),
});

/**
 * Hero headline recipe — prototype `.lp-hero-headline` (styles.css:843), applied
 * locally because globals.css is not in this plan's files_modified. The clamp is
 * prototype-verbatim: clamp(64px, 10vw, 132px).
 */
const LP_HERO_HEADLINE: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 900,
  fontSize: 'clamp(64px, 10vw, 132px)',
  lineHeight: 0.85,
  letterSpacing: '-0.055em',
  textTransform: 'uppercase',
  margin: 0,
};

const HOW_IT_WORKS = [
  {
    n: '01',
    title: 'GO ON RECORD',
    body: 'Make a call on any crypto market. Pick your conviction. Stake USDC. Your prediction is now permanent and public.',
  },
  {
    n: '02',
    title: 'FOLLOW OR FADE',
    body: 'Others bet with you or against you. Every position is real money on the line. The market prices your prediction in real time.',
  },
  {
    n: '03',
    title: 'GET YOUR RECEIPT',
    body: 'When the call settles, the outcome stamps onto your receipt forever. CALLED IT. LOUD AND WRONG. Either way, the world knows.',
  },
];

const DIFFERENTIATORS: Array<[string, string]> = [
  ['Polymarket: anonymous trades', 'Call It: named callers, permanent reputation'],
  ['Pump.fun: speculate on memes', 'Call It: stake on outcomes you understand'],
  ['Twitter: forgotten calls', 'Call It: receipts that last forever'],
  ['DraftKings: house always wins', 'Call It: peer-to-peer, parimutuel'],
];

const FEES: Array<[string, string, string]> = [
  ['Protocol fee', '1.0%', 'At settlement'],
  ['Creator fee', '0.4%', 'At settlement, to the caller'],
  ['LP fee', '0.3%', 'At settlement, stays in pool'],
  ['Market creation', '$10 USDC', 'Once, at creation'],
];

export default function SignInPage() {
  const isMobile = useIsMobile();
  const sectionPad = isMobile ? '64px 16px' : '100px 40px';

  return (
    <main style={{ background: 'var(--bg-primary)', minHeight: '100vh' }}>
      {/* Top bar — brand only (the hero below carries the sign-in CTAs) */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '16px' : '20px 40px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="brand" style={{ fontSize: 22 }}>
          <span>CALL IT</span>
          <span className="slash">·</span>
          <span className="tagline">be right in public</span>
        </div>
      </header>

      {/* HERO — BE RIGHT / IN PUBLIC. + the existing Privy auth flow as the CTAs */}
      <section
        style={{
          padding: isMobile ? '48px 16px 64px' : '60px 40px 100px',
          maxWidth: 1180,
          margin: '0 auto',
        }}
      >
        {/* Status strip — D-07: the prototype's platform totals (callers on record,
            total pot) have NO source and are NOT rendered; only the working parts
            (live dot + LIVE NOW) ship. */}
        <div className="row" style={{ gap: 10, marginBottom: 28, color: 'var(--text-tertiary)' }}>
          <span className="live-dot"></span>
          <span
            className="mono"
            style={{
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            · LIVE NOW ·
          </span>
        </div>

        <h1 style={{ ...LP_HERO_HEADLINE, marginBottom: 28 }}>
          BE RIGHT
          <br />
          <span style={{ color: 'var(--accent-win)' }}>IN PUBLIC.</span>
        </h1>

        <p
          style={{
            fontSize: isMobile ? 18 : 22,
            lineHeight: 1.4,
            color: 'var(--text-secondary)',
            maxWidth: '32ch',
            margin: '0 0 40px',
            fontWeight: 400,
          }}
        >
          A reputation market for crypto calls. Stake on what you believe. Get a receipt that
          lasts forever.
        </p>

        {/* Sign-in CTA block — the EXISTING SignInButtons (Privy flows untouched).
            D-33 order: Connect Wallet > Google > Twitter. */}
        <div
          style={{
            width: '100%',
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '400px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <PrivyErrorBoundary>
            <SignInButtons CustodyTooltip={CustodyTooltip} />
          </PrivyErrorBoundary>
        </div>

        <div
          className="mono"
          style={{
            marginTop: 32,
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          ↗ no waitlist · sign in with wallet, Google, or X · $5 min stake
        </div>

        {/* AUTH-37: disclaimer — links to /terms; always visible */}
        <p
          className="mono"
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            lineHeight: 1.5,
            marginTop: '1.5rem',
            maxWidth: '400px',
          }}
          data-testid="disclaimer"
        >
          By signing in, you&apos;re agreeing to our{' '}
          <Link href="/terms" style={{ color: 'var(--accent-win)', textDecoration: 'underline' }}>
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </section>

      <div className="section-divider" style={{ borderTop: '1px solid var(--border-subtle)' }}></div>

      {/* HOW IT WORKS — 3 cream blocks (static copy, no data) */}
      <section style={{ padding: sectionPad, maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: isMobile ? 40 : 60 }}>
          <div className="label-overline" style={{ marginBottom: 14 }}>
            · How it works
          </div>
          <h2 className="h-1" style={{ margin: 0, maxWidth: '20ch' }}>
            Three steps.
            <br />
            One receipt.
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 24,
          }}
        >
          {HOW_IT_WORKS.map((step) => (
            <div key={step.n} className="brutal-card cream" style={{ padding: 32, minHeight: isMobile ? 0 : 320 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 80,
                  fontWeight: 900,
                  letterSpacing: '-0.05em',
                  lineHeight: 0.85,
                  color: '#000',
                  marginBottom: 28,
                }}
              >
                {step.n}
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 900,
                  letterSpacing: '-0.02em',
                  margin: '0 0 14px',
                  color: '#000',
                  textTransform: 'uppercase',
                }}
              >
                {step.title}
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.5, color: '#1a1a1a', margin: 0 }}>
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border-subtle)' }}></div>

      {/* DIFFERENTIATOR — static copy */}
      <section
        style={{
          padding: sectionPad,
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr',
          gap: isMobile ? 32 : 60,
          alignItems: 'center',
        }}
      >
        <div>
          <div className="label-overline" style={{ marginBottom: 14 }}>
            · What&apos;s different
          </div>
          <h2 className="h-1" style={{ margin: 0, maxWidth: '14ch' }}>
            The only prediction market built on identity.
          </h2>
          <p
            style={{
              marginTop: 24,
              fontSize: 16,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              maxWidth: '40ch',
            }}
          >
            Polymarket sells anonymous trades. Twitter forgets last week&apos;s calls. Call It
            writes them down.
          </p>
        </div>
        <div className="col" style={{ gap: 0 }}>
          {DIFFERENTIATORS.map(([left, right]) => (
            <div
              key={right}
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: isMobile ? 8 : 24,
                padding: '20px 0',
                borderBottom: '1px solid var(--border-subtle)',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  textDecoration: 'line-through',
                  textDecorationColor: 'var(--text-muted)',
                  fontSize: 14,
                }}
              >
                {left}
              </span>
              <span
                style={{
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  borderBottom: '3px solid var(--accent-win)',
                  paddingBottom: 2,
                  display: 'inline-block',
                  width: 'fit-content',
                  fontSize: 15,
                }}
              >
                {right}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border-subtle)' }}></div>

      {/* FEES — static protocol constants (spec §6 settlement fee model) */}
      <section style={{ padding: sectionPad, maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <div className="label-overline" style={{ marginBottom: 14 }}>
            · Transparency
          </div>
          <h2 className="h-1" style={{ margin: 0 }}>
            The fees, plainly.
          </h2>
        </div>

        <div
          style={{
            border: '3px solid var(--border-strong)',
            boxShadow: 'var(--shadow-brutal)',
            background: 'var(--bg-secondary)',
            overflowX: 'auto',
          }}
        >
          <table className="brutal-table" style={{ marginBottom: 0 }}>
            <thead>
              <tr>
                <th>Fee</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {FEES.map(([f, r, w]) => (
                <tr key={f} style={{ cursor: 'default' }}>
                  <td style={{ fontWeight: 600 }}>{f}</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {r}
                  </td>
                  <td className="muted">{w}</td>
                </tr>
              ))}
              <tr style={{ cursor: 'default', background: 'var(--bg-quaternary)' }}>
                <td
                  style={{
                    fontWeight: 800,
                    fontFamily: 'var(--font-display)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  }}
                >
                  Total at settlement
                </td>
                <td
                  className="mono"
                  style={{
                    textAlign: 'right',
                    fontWeight: 800,
                    color: 'var(--accent-win)',
                    fontSize: 16,
                  }}
                >
                  1.7%
                </td>
                <td className="muted">→ caller + protocol + pool</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div style={{ borderTop: '1px solid var(--border-subtle)' }}></div>

      {/* RULES / RISK CALLOUT — "Read the rules" wired to the real /terms page (D-08: no dead controls) */}
      <section style={{ padding: isMobile ? '48px 16px' : '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div
          className="brutal-card cream"
          style={{
            padding: isMobile ? 24 : 40,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto',
            gap: 32,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 80,
              fontWeight: 900,
              lineHeight: 1,
              color: '#000',
            }}
            aria-hidden="true"
          >
            ⚠
          </div>
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                margin: 0,
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: '-0.02em',
                color: '#000',
                textTransform: 'uppercase',
              }}
            >
              Calls are permanent. Stakes are real. Reputation is forever.
            </h3>
            <p style={{ margin: '10px 0 0', fontSize: 15, color: '#1a1a1a' }}>
              Read the rules before you publish anything. There&apos;s no edit, no take-back, no
              soft launch.
            </p>
          </div>
          <Link
            href="/terms"
            className="btn"
            style={{
              background: '#000',
              color: 'var(--bg-inverse)',
              borderColor: '#000',
              boxShadow: '4px 4px 0 0 #5d5d5d',
              textDecoration: 'none',
              minHeight: 44,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Read the rules →
          </Link>
        </div>
      </section>

      {/* FOOTER — static, real values only (D-07: no fake deploy block / contract hash) */}
      <footer
        style={{
          borderTop: '1px solid var(--border-subtle)',
          padding: isMobile ? '32px 16px' : '40px',
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="brand" style={{ fontSize: 18, marginBottom: 6 }}>
            <span>CALL IT</span>
          </div>
          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Built on Arbitrum
          </div>
        </div>
        <Link
          href="/terms"
          className="mono"
          style={{
            color: 'var(--text-secondary)',
            fontSize: 12,
            letterSpacing: '0.04em',
            textDecoration: 'underline',
          }}
        >
          Terms &amp; Conditions
        </Link>
      </footer>
    </main>
  );
}
