'use client';
/**
 * AppShell — the app chrome every routed screen lives inside (D-10, D-11).
 *
 * Composition (desktop): optional SystemTicker (flag-gated, default OFF) →
 * 64px sticky `.app-header` (brand + tagline, ⌘K search placeholder, wallet
 * USDC pill, NotificationBell) → `.layout` 240px/1fr grid (Sidebar + main,
 * max-width 1180, padding 0 32px 80px).
 *
 * Mounted INSIDE <ClientProviders> in layout.tsx (needs Privy/wagmi context
 * for the wallet pill + bell) — but Providers.tsx itself is NEVER edited;
 * the provider-order AST test stays green (D-10, T-09.2-08).
 *
 * Sticky offsets are DERIVED (D-11): the ticker flag sets --shell-offset
 * (32px on / 0px off) consumed by .app-header/.layout/.sidebar in
 * globals.css — the prototype's hardcoded top offsets are never used.
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
 * AUTH-44: the wallet pill renders handle + balance ONLY — never an address.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useProfile } from '@/hooks/useProfile';
import { useIsMobile } from '../hooks/useIsMobile';
import { NotificationBell } from './NotificationBell';
import { MobileDrawer } from './MobileDrawer';
import { Sidebar } from './Sidebar';
import { SystemTicker } from './SystemTicker';
import { Icon } from './Icon';

/**
 * Wallet pill — "2,840.21 USDC · handle" from the EXISTING useUsdcBalance
 * hook + viewer profile fetch. HANDLE only, never an address (AUTH-44): when
 * the relayer's handle source is 'truncated' (a shortened address), the pill
 * shows the balance alone.
 */
function WalletPill() {
  const { authenticated, ready, user } = usePrivy();
  const { address } = useAccount();
  const profileAddr =
    address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const { formatted } = useUsdcBalance();
  const { data: profile } = useProfile(
    authenticated && ready ? profileAddr : undefined,
  );

  // Auth-dependent slot: nothing until Privy is ready + a balance exists.
  if (!ready || !authenticated || formatted === undefined) return null;

  const balance = Number(formatted).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // AUTH-44: a 'truncated' source means the handle IS a shortened wallet
  // address — treat as "no handle" and render the balance only.
  const handle =
    profile && profile.source !== 'truncated' ? profile.handle : null;

  return (
    <div className="wallet-pill" data-testid="wallet-pill">
      <span className="balance">
        {balance}
        <span className="ccy">USDC</span>
      </span>
      {handle && <span className="handle">{handle}</span>}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Ticker feature flag — default OFF; renders only when explicitly '1' (D-11).
  const tickerEnabled = process.env.NEXT_PUBLIC_SYSTEM_TICKER === '1';

  // /signin + /onboarding/* own their chrome — full-bleed, no shell (D-10).
  const fullBleed = pathname === '/signin' || pathname.startsWith('/onboarding');
  if (fullBleed) return <>{children}</>;

  return (
    <div
      style={
        {
          // DERIVED offset (D-11): header top = ticker enabled ? 32 : 0;
          // sidebar/layout offsets calc() from this var in globals.css.
          '--shell-offset': tickerEnabled ? '32px' : '0px',
        } as React.CSSProperties
      }
    >
      <SystemTicker enabled={tickerEnabled} />

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
              <Icon name="feed" size={16} />
            </button>
          )}
          <Link
            href="/"
            className="brand"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <span>CALL IT</span>
            <span className="slash">·</span>
            <span className="tagline">be right in public</span>
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
