'use client';
/**
 * Sign-in page — the ACID HERO landing from `call it homepage/CALL IT Hero.dc.html`
 * (user request 2026-06-12, quick-260612-a6v — "replace it with exactly what is in
 * that folder"). Every gradient/border/shadow/blur/spacing value is design-verbatim
 * EXCEPT border-radius (user delta 4 below).
 *
 * (a) D-12 UNCHANGED: middleware.ts bounces unauthenticated visits here (the
 *     logged-out marketing surface IS /signin — no public-`/` carve-out); AppShell
 *     renders /signin full-bleed (no sidebar/header chrome).
 *
 * (b) FOUR USER DELTAS from the design file (everything else is verbatim):
 *     1. The design's Market/Leaderboard/Dashboard nav pills become ONE
 *        "How it works" pill that opens the existing HowItWorksModal (whose
 *        MAKE YOUR FIRST CALL ▸ CTA chains into the signup modal).
 *     2. "See Live Calls" is a Link to /calls — a public re-export of the live
 *        tape (public via middleware's existing '/call' startsWith prefix).
 *     3. "MAKE YOUR FIRST CALL →" and "Sign In →" open the signup modal hosting
 *        the EXISTING, untouched Privy auth rail.
 *     4. ALL border-radius ZEROED (user brand decision 2026-06-12: the app is
 *        radius-0 brutal everywhere — straight edges keep the landing on-brand).
 *        The design file's 28px panel / 999px pills / 18-20px cards / 50% dot
 *        are deliberately NOT ported; the pulse dot mirrors the app's square
 *        .live-dot (globals.css:157). Sole radius in the file: the CTA's
 *        liquid blob-fill ::before — internal hover animation (user-requested),
 *        clipped by the button's SQUARE silhouette, never visible geometry.
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
    // Layout/spacing live in .ci-page/.ci-panel classes (NOT inline) so the
    // mobile media queries below can override them — inline beats stylesheet.
    <div className={`${archivo.className} ci-page`}>
      <div className="ci-panel">
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

        {/* nav — ≤640px reflows to two rows: brand + Sign In on top, the
            How-it-works pill centered below (the glass container chrome
            collapses; the acid pill keeps its look). */}
        <div className="ci-nav">
          <div className="ci-nav-brand">
            {/* Static import (NOT a raw /brand/ URL — see header note (e)) */}
            <Image src={callitMark} alt="CALL IT mark" width={34} height={34} style={{ objectFit: 'contain' }} />
            <span className="ci-brand-word" style={{ fontFamily: archivoBlack.style.fontFamily }}>
              CALL IT
            </span>
          </div>
          {/* Center glass pill container — the design's Market/Leaderboard/Dashboard
              pills are NOT rendered (user removal, quick-260612-a6v); a single
              "How it works" pill (the design's ACTIVE pill recipe) opens the modal. */}
          <nav className="ci-nav-pill">
            <button type="button" className="ci-how-btn" onClick={() => setHowOpen(true)}>
              How it works
            </button>
          </nav>
          <div className="ci-nav-right">
            <button type="button" className="ci-signin-btn" onClick={() => setSigninOpen(true)}>
              Sign In →
            </button>
          </div>
        </div>

        {/* hero body */}
        <div className="ci-hero">
          <div className="ci-badge">
            <span
              style={{
                width: '7px',
                height: '7px',                background: '#D4F500',
                animation: 'ci-pulse 2s ease-in-out infinite',
              }}
            />
            <span className="ci-badge-text">Stake smarter · Call it public</span>
          </div>

          {/* Desktop size is the design-verbatim clamp(64px, 8.6vw, 124px) in
              .ci-h1; ≤640px re-scales to a vw-driven clamp (the 64px floor
              overflows ≤350px viewports and eats a third of a phone screen).
              Headline split per user 2026-06-12: "BE RIGHT IN" stays white,
              only "PUBLIC." carries the acid — and renders LARGER (1.2em of
              the responsive base, so the emphasis scales at every width). */}
          <h1 className="ci-h1" style={{ fontFamily: archivoBlack.style.fontFamily }}>
            BE RIGHT IN
            <br />
            <span className="ci-h1-public">PUBLIC.</span>
          </h1>

          <p className="ci-sub">
            A reputation market for crypto calls. Stake on what you believe. Get a receipt that
            lasts forever.
          </p>

          <div className="ci-cta-row">
            <button type="button" className="ci-cta-primary" onClick={() => setSigninOpen(true)}>
              MAKE YOUR FIRST CALL
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
              padding: '22px 24px',              background:
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
                    height: '28px',                    background: '#FF4D6D',
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
                  padding: '4px 9px',                  background: 'rgba(212,245,0,0.14)',
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
                    width: '79%',                    background: '#D4F500',
                    boxShadow: '0 0 12px rgba(212,245,0,0.45)',
                  }}
                />
                <span style={{ flex: 1, background: '#FF4D6D' }} />
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
              padding: '26px 28px',              background:
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
                    height: '30px',                    background: '#D4F500',
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
                  padding: '5px 10px',                  background: 'rgba(212,245,0,0.18)',
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
                    width: '68%',                    background: '#D4F500',
                    boxShadow: '0 0 14px rgba(212,245,0,0.5)',
                  }}
                />
                <span style={{ flex: 1, background: '#FF4D6D' }} />
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
              padding: '22px 24px',              background:
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
                    height: '28px',                    background: '#B387FF',
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
                  padding: '4px 9px',                  background: 'rgba(212,245,0,0.14)',
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
                    width: '69%',                    background: '#D4F500',
                    boxShadow: '0 0 12px rgba(212,245,0,0.45)',
                  }}
                />
                <span style={{ flex: 1, background: '#FF4D6D' }} />
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
        <div className="ci-bottom-spacer" />
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
          className="ci-modal-panel"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            backgroundColor: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.13)',            width: 'min(92vw, 420px)',
            maxHeight: 'min(86dvh, 680px)',
            overflowY: 'auto',
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

      {/* Page-local styles: keyframes, hover recipes, and the responsive layer.
          Inline style={{}} beats stylesheet selectors, so every element a media
          query or :hover touches gets ALL of its overridable properties from a
          ci-* class here (desktop values are design-verbatim).

          Responsive tiers (quick-260612-fast mobile rework):
          - ≤860px  tablet: cards stack center-first as a subtle ±1.4° deck
          - ≤640px  phone:  two-row nav, vw-scaled h1, full-width stacked CTAs,
                            44px tap targets, dvh viewport units
          - ≤360px  squeeze: brand/CTA type steps down so nothing clips */}
      <style>{`
        @keyframes ci-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        @keyframes ci-bloom { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }

        .ci-page {
          min-height: 100vh;
          min-height: 100dvh; /* iOS URL-bar-safe; vh line above is the fallback */
          background: #D4F500;
          padding: 14px;
        }
        .ci-panel {
          position: relative;
          overflow: hidden;
          background: #0A0A0A;
          min-height: calc(100vh - 28px);
          min-height: calc(100dvh - 28px);
          display: flex;
          flex-direction: column;
          align-items: stretch;
        }
        .ci-nav {
          position: relative;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 36px;
          gap: 24px;
        }
        .ci-nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }
        .ci-brand-word {
          font-size: 19px;
          letter-spacing: 0.02em;
          color: #FFFFFF;
          white-space: nowrap;
        }
        .ci-nav-pill {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.10);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .ci-how-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 18px;
          background: rgba(212,245,0,0.14);
          border: 1px solid rgba(212,245,0,0.35);
          color: #D4F500;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.02em;
          cursor: pointer;
          white-space: nowrap;
        }
        .ci-nav-right {
          display: flex;
          justify-content: flex-end;
          flex: 1;
        }
        .ci-signin-btn {
          cursor: pointer;
          padding: 11px 22px;
          background: #F5F0E6;
          color: #0A0A0A;
          border: none;
          font-family: inherit;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
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
        .ci-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 4px 9px;
          max-width: 100%;
          padding: 8px 18px;
          background: rgba(212,245,0,0.07);
          border: 1px solid rgba(212,245,0,0.25);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        .ci-badge-text {
          font-family: var(--font-jetbrains-mono);
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.14em;
          color: #D4F500;
          text-transform: uppercase;
        }
        .ci-h1 {
          margin: 30px 0 0;
          font-size: clamp(64px, 8.6vw, 124px);
          line-height: 0.92;
          letter-spacing: -0.025em;
          color: #FFFFFF;
        }
        /* User 2026-06-12: only PUBLIC. is acid, and it reads LARGER than the
           white line — em-sized so the emphasis holds at every breakpoint
           (the unitless 0.92 line-height recomputes per line, no overlap). */
        .ci-h1-public {
          color: #D4F500;
          font-size: 1.2em;
        }
        .ci-sub {
          margin: 28px 0 0;
          max-width: 520px;
          font-size: 19px;
          line-height: 1.55;
          font-weight: 500;
          color: #9A9A90;
          text-wrap: pretty;
        }
        .ci-cta-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 36px;
        }
        .ci-cta-primary {
          cursor: pointer;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          padding: 17px 32px;
          background: #F5F0E6;
          color: #0A0A0A;
          border: none;
          font-family: inherit;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: transform 0.15s ease;
        }
        /* Liquid blob-fill hover (user request 2026-06-12): an organic acid
           blob rises from the bottom and floods the button. The blob is a huge
           uneven-radius disc parked just below the face — on hover it rises
           and tumbles, so its CURVED edge sweeps the label like liquid. The
           button's own silhouette stays square (overflow hidden, radius 0 —
           the blob's curves are internal animation, not corner geometry, so
           the straight-edges brand rule holds). z-index -1 inside the
           isolated stacking context paints the blob over the cream background
           but under the label; the dark label keeps contrast on acid. */
        .ci-cta-primary::before {
          content: '';
          position: absolute;
          z-index: -1;
          left: 50%;
          bottom: 0;
          width: 220%;
          aspect-ratio: 1;
          background: #D4F500;
          border-radius: 43% 45% 41% 47%;
          transform: translate(-50%, 103%) rotate(0deg);
          transition: transform 0.55s cubic-bezier(0.45, 0.1, 0.25, 1);
          pointer-events: none;
        }
        .ci-cta-primary:hover {
          transform: translateY(-2px);
        }
        .ci-cta-primary:hover::before {
          transform: translate(-50%, 26%) rotate(80deg);
        }
        .ci-cta-secondary {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
          padding: 16px 30px;
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
        .ci-bottom-spacer {
          position: relative;
          z-index: 4;
          display: flex;
          justify-content: center;
          padding: 58px 24px 36px;
          margin-top: auto;
        }
        .ci-modal-panel {
          padding: 32px;
        }

        /* ── Tablet (≤860px): cards stack center-card-first as a subtle deck —
           the ±1.4° tilts keep the design's playful stagger in vertical form. */
        @media (max-width: 860px) {
          .ci-nav {
            padding: 18px 20px;
            gap: 12px;
          }
          .ci-hero {
            padding: 52px 20px 0;
          }
          .ci-cta-row {
            flex-wrap: wrap;
            justify-content: center;
          }
          .ci-cards {
            flex-direction: column;
            align-items: center;
            gap: 16px;
            margin-top: 44px;
            padding: 0 20px;
          }
          .ci-card-left,
          .ci-card-center,
          .ci-card-right {
            margin: 0;
            width: 100%;
            max-width: 390px;
          }
          .ci-card-center {
            order: -1;
            transform: none;
          }
          .ci-card-left,
          .ci-card-left:hover {
            transform: rotate(-1.4deg);
          }
          .ci-card-right,
          .ci-card-right:hover {
            transform: rotate(1.4deg);
          }
          .ci-card-center:hover {
            transform: none;
          }
        }

        /* ── Phone (≤640px): two-row nav (brand + Sign In, pill centered under),
           vw-scaled headline (the 64px floor overflows ≤350px viewports),
           full-width stacked CTAs, 44px tap targets, tightened rhythm. */
        @media (max-width: 640px) {
          .ci-page {
            padding: 10px;
          }
          .ci-panel {
            min-height: calc(100vh - 20px);
            min-height: calc(100dvh - 20px);
          }
          .ci-nav {
            flex-wrap: wrap;
            padding: 14px 16px;
            row-gap: 10px;
            column-gap: 12px;
          }
          .ci-nav-right {
            flex: 0 0 auto;
          }
          .ci-nav-pill {
            order: 3;
            flex-basis: 100%;
            justify-content: center;
            padding: 0;
            background: transparent;
            border: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
          .ci-how-btn {
            min-height: 44px;
            padding: 10px 22px;
          }
          .ci-signin-btn {
            min-height: 44px;
            padding: 11px 20px;
          }
          .ci-hero {
            padding: 40px 18px 0;
          }
          .ci-badge {
            padding: 8px 14px;
          }
          .ci-badge-text {
            font-size: 10px;
            letter-spacing: 0.1em;
          }
          .ci-h1 {
            margin-top: 24px;
            font-size: clamp(40px, 14.8vw, 64px);
          }
          .ci-sub {
            margin-top: 18px;
            font-size: 16px;
            line-height: 1.5;
            max-width: 34ch;
          }
          .ci-cta-row {
            flex-direction: column;
            width: 100%;
            max-width: 360px;
            gap: 12px;
            margin-top: 28px;
          }
          .ci-cta-primary,
          .ci-cta-secondary {
            width: 100%;
          }
          .ci-cards {
            margin-top: 36px;
            gap: 14px;
            padding: 0 16px;
          }
          .ci-bottom-spacer {
            padding: 40px 16px 24px;
          }
          .ci-modal-panel {
            padding: 24px 20px;
          }
        }

        /* ── Narrow phones (≤360px): type steps down so nothing clips. */
        @media (max-width: 360px) {
          .ci-brand-word {
            font-size: 17px;
          }
          .ci-cta-primary {
            font-size: 13px;
            padding: 16px 22px;
          }
          .ci-cta-secondary {
            font-size: 13px;
            padding: 15px 22px;
          }
        }
      `}</style>
    </div>
  );
}
