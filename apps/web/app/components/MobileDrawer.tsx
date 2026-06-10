'use client';
/**
 * MobileDrawer — left-anchored slide-over navigation drawer (Phase 9, D-05/D-06/D-07).
 *
 * Structural mirror of `NotificationInbox.tsx`, anchored LEFT instead of right.
 * Remains the only global <768px navigation surface after plan 09.2-03: the
 * desktop Sidebar is hidden on mobile and AppShell's header hamburger opens
 * this drawer (the hand-off pattern previously owned by GlobalNav).
 *
 * Props: { open: boolean; onClose: () => void }. Renders null when !open.
 * Visibility (isMobile gate) is owned by the parent (AppShell) so this file
 * imports NO `useIsMobile` — the drawer stays pure (Pitfall 2 register).
 *
 * Destination registry mirrors the desktop Sidebar 1:1 (09.2-14 nav-parity
 * mandate — no dead nav below 768px):
 *   - The Tape + Leaderboard + Make a call + Disputes: ALWAYS (same as the
 *     Sidebar; /new is middleware-guarded so a logged-out tap redirects to
 *     /signin — no authed link is "flashed", it is a public entry point).
 *   - Your profile + Settings: ONLY when `authenticated && ready` with a
 *     resolvable address (Pitfall 5 — never flash viewer-identity links).
 *   - Sign in (when !authenticated) / Sign out (when authenticated, calls logout()).
 *
 * The NotificationBell STAYS pinned in the top bar (D-06) — it is NOT moved here.
 *
 * Close behavior (mirrors NotificationInbox): Esc key · backdrop click · any link tap.
 *
 * Chrome rides the 09.2-01 token layer (D-02 — legacy grays retired):
 * bg var(--bg-secondary) panel, 2px token borders, `.nav-item` link recipes,
 * `.btn cream / outline-white` auth CTAs, radius 0 everywhere.
 *
 * Requirements: UI-49, D-05, D-06, D-07, D-14 (logic/focus handling unchanged)
 */

import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { Icon } from './Icon';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** ≥44px touch-target floor on drawer rows (D-03). */
const navItemTouchStyle: React.CSSProperties = {
  minHeight: 44,
  textDecoration: 'none',
};

export function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { authenticated, ready, logout, user } = usePrivy();
  const { address } = useAccount();
  // WR-03: Privy OAuth logins can have an undefined wagmi address when the
  // drawer opens; fall back to the Privy embedded-wallet address so an
  // authenticated user always has a Profile entry point (D-06).
  const profileAddr = address ?? (user?.wallet?.address as `0x${string}` | undefined);

  // Close on Escape key (copied verbatim from NotificationInbox)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close when clicking outside the panel (copied verbatim from NotificationInbox)
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Sign out: tear down the Privy session, then close the drawer.
  const handleSignOut = useCallback(() => {
    void logout();
    onClose();
  }, [logout, onClose]);

  // The drawer self-gates on `open` so the parent can always mount it.
  if (!open) return null;

  const showAuthedLinks = authenticated && ready;

  return (
    /* Backdrop — scrim tokens match the modal-overlay treatment */
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(9,9,14,0.6)',
      }}
    >
      {/* Slide-over panel — LEFT-anchored (vs NotificationInbox right-anchored) */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 'min(300px, 85vw)',
          height: '100vh',
          background: 'var(--bg-secondary)',
          borderRight: '2px solid var(--border-accent)',
          boxShadow: '4px 0 0 0 #000',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          boxSizing: 'border-box',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            paddingBottom: 16,
            borderBottom: '2px solid var(--border-active)',
          }}
        >
          <span className="nav-section-label" style={{ padding: 0 }}>
            {'// MENU'}
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="icon-btn"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Navigation destinations (D-06, auth-aware) */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Always-visible destinations */}
          <Link href="/" onClick={onClose} className="nav-item" style={navItemTouchStyle}>
            <Icon name="feed" size={15} strokeWidth={1.7} />
            <span>The Tape</span>
          </Link>
          <Link
            href="/leaderboard"
            onClick={onClose}
            className="nav-item"
            style={navItemTouchStyle}
          >
            <Icon name="leaderboard" size={15} strokeWidth={1.7} />
            <span>Leaderboard</span>
          </Link>

          {/* Always-visible like the Sidebar — /new is middleware-guarded (logged-out
              taps redirect to /signin), so the entry point itself is public. */}
          <Link
            href="/new"
            onClick={onClose}
            className="nav-item"
            style={navItemTouchStyle}
          >
            <Icon name="create" size={15} strokeWidth={1.7} />
            <span>Make a call</span>
          </Link>

          {/* Viewer-identity destinations (Pitfall 5 — gated on authenticated && ready) */}
          {showAuthedLinks && profileAddr && (
            <>
              <Link
                href={`/profile/${profileAddr}`}
                onClick={onClose}
                className="nav-item"
                style={navItemTouchStyle}
              >
                <Icon name="profile" size={15} strokeWidth={1.7} />
                <span>Your profile</span>
              </Link>
              <Link
                href={`/profile/${profileAddr}/settings`}
                onClick={onClose}
                className="nav-item"
                style={navItemTouchStyle}
              >
                <Icon name="settings" size={15} strokeWidth={1.7} />
                <span>Settings</span>
              </Link>
            </>
          )}

          {/* Sidebar parity: Disputes is an always-visible public destination */}
          <Link
            href="/disputes"
            onClick={onClose}
            className="nav-item"
            style={navItemTouchStyle}
          >
            <Icon name="book" size={15} strokeWidth={1.7} />
            <span>Disputes</span>
          </Link>

          {/* Auth toggle: Sign in (logged out) / Sign out (logged in) */}
          {authenticated ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="btn outline-white full"
              style={{ marginTop: 14, minHeight: 44 }}
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/signin"
              onClick={onClose}
              className="btn cream full"
              style={{ marginTop: 14, minHeight: 44, textDecoration: 'none' }}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
