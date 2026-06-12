'use client';
/**
 * Sign-in page — the ACID HERO landing from `call it homepage/CALL IT Hero.dc.html`
 * (user request 2026-06-12, quick-260612-a6v — "replace it with exactly what is in
 * that folder"). Every gradient/border/shadow/blur/spacing value is design-verbatim.
 *
 * (a) D-12 UNCHANGED: middleware.ts bounces unauthenticated visits here (the
 *     logged-out marketing surface IS /signin — no public-`/` carve-out); AppShell
 *     renders /signin full-bleed (no sidebar/header chrome).
 *
 * (b) THREE USER DELTAS from the design file (everything else is verbatim):
 *     1. The design's Market/Leaderboard/Dashboard nav pills become ONE
 *        "How it works" pill that opens the existing HowItWorksModal (whose
 *        MAKE YOUR FIRST CALL ▸ CTA chains into the signup modal).
 *     2. "See Live Calls" is a Link to /calls — a public re-export of the live
 *        tape (public via middleware's existing '/call' startsWith prefix).
 *     3. "MAKE YOUR FIRST CALL →" and "Sign In →" open the signup modal hosting
 *        the EXISTING, untouched Privy auth rail.
 *
 * (c) The three demo call cards (veda / jaxon.eth / degen_oracle) are STATIC
 *     decorative marketing art on a logged-out surface — D-07 does not apply
 *     (they are not app data surfaces; no source claims to back them).
 *
 * (d) ALWAYS-MOUNTED SIGNIN MODAL INVARIANT: the modal wrapper is display-toggled
 *     (`display: signinOpen ? 'flex' : 'none'` + aria-hidden), NEVER conditionally
 *     rendered around SignInButtons — its privy-token cookie-write/self-heal effect
 *     (SignInButtons.tsx:114-153) must mount on page load. See the JSX comment at
 *     the modal below.
 *
 * (e) LOGO VIA STATIC IMPORT: the middleware matcher excludes only
 *     _next/static|_next/image|favicon.ico|public/ — a raw /brand/ URL would
 *     307-bounce logged-out visitors to /signin. The static import serves from
 *     /_next/static/media/* which IS excluded, so the mark always renders.
 *
 * (f) Preserved requirement pins: AUTH-37 (disclaimer + /terms link), AUTH-38
 *     (custody tooltip copy), T-09.2-35 (privy-error-fallback), D-33
 *     (SignInButtons untouched — Connect Wallet > Google > Twitter).
 *
 * Requirements: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-36, AUTH-37, AUTH-38,
 * AUTH-44, UI-48, QUICK-260612-A6V
 */

import React, { Component, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import Image from 'next/image';
import { Archivo, Archivo_Black } from 'next/font/google';
import { HowItWorksModal } from '../components/HowItWorksModal';
import callitMark from '@/public/brand/callit-mark.png';

// Page-local fonts (layout.tsx untouched — it does not load Archivo Black).
const archivoBlack = Archivo_Black({ weight: '400', subsets: ['latin'] });
const archivo = Archivo({ weight: ['500', '600', '700', '800'], subsets: ['latin'] });

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

export default function SignInPage() {
  const [signinOpen, setSigninOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);

  // Escape closes the signin modal. HowItWorksModal carries its OWN Escape
  // listener — do not duplicate one for it here.
  useEffect(() => {
    if (!signinOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSigninOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signinOpen]);

  return (
    <div
      className={archivo.className}
      style={{ minHeight: '100vh', background: '#D4F500', padding: '14px' }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          background: '#0A0A0A',
          borderRadius: '28px',
          minHeight: 'calc(100vh - 28px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
        }}
      >
        {/* background atmosphere: vertical glass columns + acid bloom (design-verbatim) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 120px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '-340px',
            transform: 'translateX(-50%)',
            width: '1100px',
            height: '700px',
            pointerEvents: 'none',
            background:
              'radial-gradient(ellipse at center, rgba(212,245,0,0.13) 0%, rgba(212,245,0,0.05) 40%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '-420px',
            transform: 'translateX(-50%)',
            width: '1500px',
            height: '900px',
            pointerEvents: 'none',
            animation: 'ci-bloom 6s ease-in-out infinite',
            background:
              'radial-gradient(ellipse at center, rgba(212,245,0,0.30) 0%, rgba(212,245,0,0.12) 35%, rgba(212,245,0,0.04) 55%, transparent 72%)',
          }}
        />

        {/* nav */}
        <div className="ci-nav">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            {/* Static import (NOT a raw /brand/ URL — see header note (e)) */}
            <Image src={callitMark} alt="CALL IT mark" width={34} height={34} style={{ objectFit: 'contain' }} />
            <span
              style={{
                fontFamily: archivoBlack.style.fontFamily,
                fontSize: '19px',
                letterSpacing: '0.02em',
                color: '#FFFFFF',
              }}
            >
              CALL IT
            </span>
          </div>
          {/* Center glass pill container — the design's Market/Leaderboard/Dashboard
              pills are NOT rendered (user removal, quick-260612-a6v); a single
              "How it works" pill (the design's ACTIVE pill recipe) opens the modal. */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
            }}
          >
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              style={{
                display: 'block',
                padding: '8px 18px',
                borderRadius: '999px',
                background: 'rgba(212,245,0,0.14)',
                border: '1px solid rgba(212,245,0,0.35)',
                color: '#D4F500',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                cursor: 'pointer',
              }}
            >
              How it works
            </button>
          </nav>
          <div style={{ display: 'flex', justifyContent: 'flex-end', flex: 1 }}>
            <button type="button" className="ci-signin-btn" onClick={() => setSigninOpen(true)}>
              Sign In →
            </button>
          </div>
        </div>

        {/* hero body */}
        <div className="ci-hero">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              padding: '8px 18px',
              borderRadius: '999px',
              background: 'rgba(212,245,0,0.07)',
              border: '1px solid rgba(212,245,0,0.25)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: '#D4F500',
                animation: 'ci-pulse 2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.14em',
                color: '#D4F500',
                textTransform: 'uppercase',
              }}
            >
              Stake smarter · Call it public
            </span>
          </div>

          <h1
            style={{
              margin: '30px 0 0',
              fontFamily: archivoBlack.style.fontFamily,
              fontSize: 'clamp(64px, 8.6vw, 124px)',
              lineHeight: 0.92,
              letterSpacing: '-0.025em',
              color: '#FFFFFF',
            }}
          >
            BE RIGHT
            <br />
            <span style={{ color: '#D4F500' }}>IN PUBLIC.</span>
          </h1>

          <p
            style={{
              margin: '28px 0 0',
              maxWidth: '520px',
              fontSize: '19px',
              lineHeight: 1.55,
              fontWeight: 500,
              color: '#9A9A90',
              textWrap: 'pretty',
            }}
          >
            A reputation market for crypto calls. Stake on what you believe. Get a receipt that
            lasts forever.
          </p>

          <div className="ci-cta-row">
            <button type="button" className="ci-cta-primary" onClick={() => setSigninOpen(true)}>
              MAKE YOUR FIRST CALL →
            </button>
            <Link href="/calls" className="ci-cta-secondary">
              See Live Calls
            </Link>
          </div>
        </div>

        {/* staggered glass call cards — STATIC decorative marketing art (header note (c)) */}
        <div className="ci-cards">
          {/* left card — veda */}
          <div
            className="ci-card-left"
            style={{
              padding: '22px 24px',
              borderRadius: '18px',
              background:
                'linear-gradient(160deg, rgba(212,245,0,0.07) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.13)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: '#FF4D6D',
                    color: '#0A0A0A',
                    fontFamily: archivoBlack.style.fontFamily,
                    fontSize: '13px',
                  }}
                >
                  V
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>veda</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
                  1h ago
                </span>
              </div>
              <span
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  background: 'rgba(212,245,0,0.14)',
                  border: '1px solid rgba(212,245,0,0.4)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#D4F500',
                }}
              >
                92% CONV
              </span>
            </div>
            <p
              style={{
                margin: '16px 0 0',
                fontSize: '16px',
                lineHeight: 1.4,
                fontWeight: 700,
                color: '#FFFFFF',
                textWrap: 'pretty',
              }}
            >
              ETH reclaims $4,200 by Friday close. Mark it.
            </p>
            <p style={{ margin: '12px 0 0', fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
              $1000 stake · 490 positions
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
              <div style={{ flex: 1, display: 'flex', gap: '3px', height: '7px' }}>
                <span
                  style={{
                    width: '79%',
                    borderRadius: '99px',
                    background: '#D4F500',
                    boxShadow: '0 0 12px rgba(212,245,0,0.45)',
                  }}
                />
                <span style={{ flex: 1, borderRadius: '99px', background: '#FF4D6D' }} />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: '#D4F500' }}>79%</span>
                <span style={{ color: '#6E6E66' }}> / </span>
                <span style={{ color: '#FF4D6D' }}>21%</span>
              </span>
            </div>
          </div>

          {/* center card (raised) — jaxon.eth */}
          <div
            className="ci-card-center"
            style={{
              padding: '26px 28px',
              borderRadius: '20px',
              background:
                'linear-gradient(160deg, rgba(212,245,0,0.11) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.02) 100%)',
              border: '1px solid rgba(212,245,0,0.30)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 50px rgba(212,245,0,0.10), 0 32px 80px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '30px',
                    height: '30px',
                    borderRadius: '9px',
                    background: '#D4F500',
                    color: '#0A0A0A',
                    fontFamily: archivoBlack.style.fontFamily,
                    fontSize: '13px',
                  }}
                >
                  J
                </span>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#FFFFFF' }}>jaxon.eth</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
                  12m ago
                </span>
              </div>
              <span
                style={{
                  padding: '5px 10px',
                  borderRadius: '6px',
                  background: 'rgba(212,245,0,0.18)',
                  border: '1px solid rgba(212,245,0,0.5)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#D4F500',
                  boxShadow: '0 0 18px rgba(212,245,0,0.18)',
                }}
              >
                78% CONV
              </span>
            </div>
            <p
              style={{
                margin: '18px 0 0',
                fontSize: '18px',
                lineHeight: 1.4,
                fontWeight: 700,
                color: '#FFFFFF',
                textWrap: 'pretty',
              }}
            >
              ARB outperforms OP by {'>'}5% over the next 7 days.
            </p>
            <p style={{ margin: '13px 0 0', fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
              $250 stake · 209 positions
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px' }}>
              <div style={{ flex: 1, display: 'flex', gap: '3px', height: '8px' }}>
                <span
                  style={{
                    width: '68%',
                    borderRadius: '99px',
                    background: '#D4F500',
                    boxShadow: '0 0 14px rgba(212,245,0,0.5)',
                  }}
                />
                <span style={{ flex: 1, borderRadius: '99px', background: '#FF4D6D' }} />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: '#D4F500' }}>68%</span>
                <span style={{ color: '#6E6E66' }}> / </span>
                <span style={{ color: '#FF4D6D' }}>32%</span>
              </span>
            </div>
          </div>

          {/* right card — degen_oracle */}
          <div
            className="ci-card-right"
            style={{
              padding: '22px 24px',
              borderRadius: '18px',
              background:
                'linear-gradient(160deg, rgba(212,245,0,0.07) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.015) 100%)',
              border: '1px solid rgba(255,255,255,0.13)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 24px 60px rgba(0,0,0,0.55)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    background: '#B387FF',
                    color: '#0A0A0A',
                    fontFamily: archivoBlack.style.fontFamily,
                    fontSize: '13px',
                  }}
                >
                  O
                </span>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>degen_oracle</span>
                <span style={{ fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
                  3h ago
                </span>
              </div>
              <span
                style={{
                  padding: '4px 9px',
                  borderRadius: '6px',
                  background: 'rgba(212,245,0,0.14)',
                  border: '1px solid rgba(212,245,0,0.4)',
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#D4F500',
                }}
              >
                64% CONV
              </span>
            </div>
            <p
              style={{
                margin: '16px 0 0',
                fontSize: '16px',
                lineHeight: 1.4,
                fontWeight: 700,
                color: '#FFFFFF',
                textWrap: 'pretty',
              }}
            >
              Pendle TVL crosses $9B by month end.
            </p>
            <p style={{ margin: '12px 0 0', fontFamily: 'var(--font-jetbrains-mono)', fontSize: '11px', color: '#6E6E66' }}>
              $420 stake · 132 positions
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
              <div style={{ flex: 1, display: 'flex', gap: '3px', height: '7px' }}>
                <span
                  style={{
                    width: '69%',
                    borderRadius: '99px',
                    background: '#D4F500',
                    boxShadow: '0 0 12px rgba(212,245,0,0.45)',
                  }}
                />
                <span style={{ flex: 1, borderRadius: '99px', background: '#FF4D6D' }} />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains-mono)',
                  fontSize: '11px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: '#D4F500' }}>69%</span>
                <span style={{ color: '#6E6E66' }}> / </span>
                <span style={{ color: '#FF4D6D' }}>31%</span>
              </span>
            </div>
          </div>
        </div>

        {/* bottom spacer — the design's bottom microcopy div is EMPTY; keep the spacer
            so the bloom composition matches. The design's block-counter script is
            unused decoration and is NOT ported. */}
        <div
          style={{
            position: 'relative',
            zIndex: 4,
            display: 'flex',
            justifyContent: 'center',
            padding: '58px 24px 36px',
            marginTop: 'auto',
          }}
        />
      </div>

      {/* How-it-works explainer — its MAKE YOUR FIRST CALL ▸ CTA chains into the
          signup modal (user-requested behavior, quick-260612-a6v). */}
      <HowItWorksModal
        open={howOpen}
        onClose={() => setHowOpen(false)}
        onPrimaryCta={() => {
          setHowOpen(false);
          setSigninOpen(true);
        }}
      />

      {/* SIGNIN MODAL — CRITICAL INVARIANT: SignInButtons carries the privy-token
          cookie-write effect (SignInButtons.tsx:114-153) that (a) redirects
          already-authenticated visitors off /signin and (b) self-heals returning
          users whose localStorage session is live but whose cookie expired. It MUST
          mount on page load. Therefore this wrapper is ALWAYS in the DOM —
          display-toggled + aria-hidden — NEVER a conditional-render guard around
          SignInButtons (display:none does not block React mount/effects;
          conditional rendering does). landing-hero.test.ts regex-guards this. */}
      <div
        aria-hidden={!signinOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSigninOpen(false);
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 200,
          backgroundColor: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          display: signinOpen ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
        }}
      >
        <div
          data-testid="signin-modal"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            backgroundColor: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.13)',
            borderRadius: '20px',
            padding: '32px',
            width: 'min(92vw, 420px)',
            backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 32px 80px rgba(0,0,0,0.6)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => setSigninOpen(false)}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.55)',
              fontSize: '20px',
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '40px' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: archivoBlack.style.fontFamily,
                fontSize: '21px',
                letterSpacing: '0.01em',
                color: '#FFFFFF',
              }}
            >
              SIGN IN TO CALL IT
            </h2>
            <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#9A9A90' }}>
              Wallet, Google, or X — your call, on the record.
            </p>
          </div>
          {/* Tier 2 scoping hook: the D-33 ordering test queries buttons INSIDE this
              wrapper so the nav/CTA/✕ buttons don't pollute order indexes. */}
          <div
            data-testid="signin-modal-buttons"
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <PrivyErrorBoundary>
              <SignInButtons CustodyTooltip={CustodyTooltip} />
            </PrivyErrorBoundary>
          </div>
          {/* AUTH-37: disclaimer — links to /terms; always visible (colors restyled
              for the dark glass panel; copy + testid + href verbatim). */}
          <p
            className="mono"
            style={{
              fontSize: '0.75rem',
              color: '#9A9A90',
              lineHeight: 1.5,
              marginTop: '0.5rem',
              marginBottom: 0,
              maxWidth: '400px',
            }}
            data-testid="disclaimer"
          >
            By signing in, you&apos;re agreeing to our{' '}
            <Link href="/terms" style={{ color: '#D4F500', textDecoration: 'underline' }}>
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Page-local styles: keyframes, hover recipes, and the ≤860px responsive
          overrides. Inline style={{}} beats stylesheet selectors, so every element
          with a :hover or media-query override gets ALL of its overridable
          properties from a ci-* class here. */}
      <style>{`
        @keyframes ci-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes ci-bloom { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }

        .ci-nav {
          position: relative;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 36px;
          gap: 24px;
        }
        .ci-signin-btn {
          cursor: pointer;
          padding: 11px 22px;
          border-radius: 999px;
          background: #F5F0E6;
          color: #0A0A0A;
          border: none;
          font-family: inherit;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .ci-signin-btn:hover {
          background: #FFFFFF;
          transform: translateY(-1px);
        }
        .ci-hero {
          position: relative;
          z-index: 4;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 64px 32px 0;
        }
        .ci-cta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 36px;
        }
        .ci-cta-primary {
          cursor: pointer;
          padding: 17px 32px;
          border-radius: 999px;
          background: #F5F0E6;
          color: #0A0A0A;
          border: none;
          font-family: inherit;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .ci-cta-primary:hover {
          background: #FFFFFF;
          transform: translateY(-2px);
        }
        .ci-cta-secondary {
          cursor: pointer;
          display: block;
          padding: 16px 30px;
          border-radius: 999px;
          background: rgba(255,255,255,0.03);
          color: #FFFFFF;
          border: 1px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          font-family: inherit;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          text-decoration: none;
          transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
        }
        .ci-cta-secondary:hover {
          border-color: rgba(212,245,0,0.6);
          color: #D4F500;
          background: rgba(212,245,0,0.06);
        }
        .ci-cards {
          position: relative;
          z-index: 4;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 0;
          margin-top: 74px;
          padding: 0 24px;
        }
        .ci-card-left {
          transition: transform 0.25s ease;
          transform: translateY(26px) rotate(-2.5deg);
          margin-right: -26px;
          z-index: 1;
          width: 340px;
        }
        .ci-card-left:hover {
          transform: translateY(16px) rotate(-2deg) scale(1.02);
        }
        .ci-card-center {
          transition: transform 0.25s ease;
          transform: translateY(-18px);
          z-index: 3;
          width: 390px;
        }
        .ci-card-center:hover {
          transform: translateY(-26px) scale(1.01);
        }
        .ci-card-right {
          transition: transform 0.25s ease;
          transform: translateY(26px) rotate(2.5deg);
          margin-left: -26px;
          z-index: 1;
          width: 340px;
        }
        .ci-card-right:hover {
          transform: translateY(16px) rotate(2deg) scale(1.02);
        }

        /* Phase 9 mandate: clean 375px render — nav wraps, CTAs wrap, cards stack
           vertically center-card-first with rotations zeroed. */
        @media (max-width: 860px) {
          .ci-nav {
            flex-wrap: wrap;
            padding: 16px 16px;
            gap: 12px;
          }
          .ci-hero {
            padding: 48px 16px 0;
          }
          .ci-cta-row {
            flex-wrap: wrap;
            justify-content: center;
          }
          .ci-cards {
            flex-direction: column;
            align-items: center;
            gap: 18px;
            margin-top: 48px;
            padding: 0 16px;
          }
          .ci-card-left,
          .ci-card-center,
          .ci-card-right {
            transform: none;
            margin: 0;
            width: 100%;
            max-width: 390px;
          }
          .ci-card-left:hover,
          .ci-card-center:hover,
          .ci-card-right:hover {
            transform: none;
          }
          .ci-card-center {
            order: -1;
          }
        }
      `}</style>
    </div>
  );
}
