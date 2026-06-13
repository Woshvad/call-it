'use client';
/**
 * AppShell — the app chrome every routed screen lives inside (D-10, D-11).
 *
 * Composition (desktop): 64px sticky `.app-header` (brand + tagline, ⌘K
 * search placeholder, wallet USDC pill, NotificationBell) → `.layout`
 * 240px/1fr grid (Sidebar + main, max-width 1180, padding 0 32px 80px).
 *
 * Mounted INSIDE <ClientProviders> in layout.tsx (needs Privy/wagmi context
 * for the wallet pill + bell) — but Providers.tsx itself is NEVER edited;
 * the provider-order AST test stays green (D-10, T-09.2-08).
 *
 * The SystemTicker was REMOVED (user decision 2026-06-11) — --shell-offset
 * stays pinned at 0px because .app-header/.layout/.sidebar in globals.css
 * still calc() their sticky tops from it (D-11 derived offsets).
 *
 * Pathname gating: /signin and /onboarding/* render full-bleed with no shell
 * (landing/onboarding own their chrome); everywhere else gets the full shell.
 *
 * <768px (useIsMobile): sidebar hidden; hamburger in the header opens the
 * existing MobileDrawer (GlobalNav's hand-off pattern, now owned here).
 *
 * Late-hydration (wiring-risk #4): static chrome renders unconditionally;
 * ONLY auth-dependent slots (wallet pill, bell, rep card) gate on Privy.
 *
 * Wallet pill face + popover live in WalletPill.tsx (balance-only face,
 * AUTH-44). Brand tagline is desktop-only — on mobile it crowded the wallet
 * pill out of the viewport (user report 2026-06-11).
 */

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '../hooks/useIsMobile';
import { NotificationBell } from './NotificationBell';
import { MobileDrawer } from './MobileDrawer';
import { Sidebar } from './Sidebar';
import { Icon } from './Icon';
import { WalletPill } from './WalletPill';
import callitMark from '@/public/brand/callit-mark.png';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // /signin + /onboarding/* own their chrome — full-bleed, no shell (D-10).
  const fullBleed = pathname === '/signin' || pathname.startsWith('/onboarding');
  if (fullBleed) return <>{children}</>;

  return (
    <div
      style={
        {
          // Pinned 0px since the SystemTicker removal (2026-06-11) — the
          // globals.css sticky consumers still calc() from this var (D-11).
          '--shell-offset': '0px',
        } as React.CSSProperties
      }
    >
      <header className="app-header">
        {/* Left: hamburger (mobile only) + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isMobile && (
            <button
              type="button"
              className="icon-btn"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              style={{ minWidth: 44, minHeight: 44 }}
            >
              <Icon name="menu" size={16} />
            </button>
          )}
          <Link
            href="/"
            className="brand"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Image
              src={callitMark}
              alt=""
              width={28}
              height={28}
              priority
              style={{ objectFit: 'contain', alignSelf: 'center' }}
            />
            <span>CALL IT</span>
            {/* Tagline is desktop-only: on <768px it pushed the wallet pill
                past the viewport edge (user report 2026-06-11). */}
            {!isMobile && (
              <>
                <span className="slash">·</span>
                <span className="tagline">be right in public</span>
              </>
            )}
          </Link>
        </div>

        {/* Center: search — visibly INERT placeholder (C10, quick-260611-5mh):
            dimmed, cursor-not-allowed, SOON tag. A crisp ⌘K search field that
            ignores clicks read as broken — the de-emphasis makes the
            not-yet-shipped state legible. readOnly + aria-label KEPT. */}
        {!isMobile ? (
          <div className="brutal-search" style={{ opacity: 0.4 }} aria-disabled="true">
            <span className="icon">
              <Icon name="search" size={14} />
            </span>
            <input
              placeholder="Search callers, calls, assets — ARB, ETH, @veda"
              aria-label="Search (coming soon)"
              readOnly
              tabIndex={-1}
              style={{ cursor: 'not-allowed' }}
            />
            <kbd>SOON</kbd>
          </div>
        ) : (
          <div />
        )}

        {/* Right: existing NotificationBell + wallet pill (auth-gated slots) */}
        <div className="header-right">
          <NotificationBell />
          <WalletPill />
        </div>
      </header>

      <div
        className="layout"
        style={isMobile ? { gridTemplateColumns: '1fr' } : undefined}
      >
        {!isMobile && <Sidebar />}
        <main
          className="main"
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            width: '100%',
            padding: isMobile ? '0 14px 80px' : undefined,
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile navigation drawer — self-gates on `open`, safe to always mount */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
