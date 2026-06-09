'use client';
/**
 * MobileDrawer — left-anchored slide-over navigation drawer (Phase 9, D-05/D-06/D-07).
 *
 * Structural mirror of `NotificationInbox.tsx`, anchored LEFT instead of right.
 * Renders the only global mobile-navigation surface (UI-49): the app has no
 * sidebar today — `GlobalNav` is just wordmark + NotificationBell — so this
 * drawer is additive and fills a real gap.
 *
 * Props: { open: boolean; onClose: () => void }. Renders null when !open.
 * Visibility (isMobile gate) is owned by the parent (GlobalNav) so this file
 * imports NO `useIsMobile` — the drawer stays pure (Pitfall 2 register).
 *
 * Auth-aware destinations (D-06):
 *   - Feed + Leaderboard: ALWAYS.
 *   - Profile + New Call: ONLY when `authenticated && ready` (Pitfall 5 —
 *     never flash authenticated links to a logged-out viewer).
 *   - Sign in (when !authenticated) / Sign out (when authenticated, calls logout()).
 *
 * The NotificationBell STAYS pinned in the top bar (D-06) — it is NOT moved here.
 *
 * Close behavior (mirrors NotificationInbox): Esc key · backdrop click · any link tap.
 *
 * Neobrutalist design tokens:
 *   - #09090E panel background
 *   - #E8F542 accent (border edge + hard offset shadow)
 *   - 2-3px borders, hard shadows, monospace/uppercase link labels
 *
 * Requirements: UI-49, D-05, D-06, D-07
 */

import { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

/** Neobrutalist drawer link/button base style — ≥44px tall (D-03). */
const linkBaseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minHeight: 44,
  width: '100%',
  padding: '0 14px',
  marginBottom: 12,
  background: 'transparent',
  border: '2px solid #2A2A30',
  boxShadow: '3px 3px 0 0 #2A2A30',
  color: '#F1F5F9',
  fontFamily: 'monospace',
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: 'uppercase',
  textDecoration: 'none',
  cursor: 'pointer',
  boxSizing: 'border-box',
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
    /* Backdrop — tokens copied verbatim from NotificationInbox */
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
          background: '#09090E',
          border: '3px solid #E8F542',
          borderLeft: 'none',
          borderTop: 'none',
          borderBottom: 'none',
          boxShadow: '4px 0 0 0 #E8F542',
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
            borderBottom: '2px solid #2A2A30',
          }}
        >
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
              fontWeight: 700,
              color: '#E8F542',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Menu
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              background: 'transparent',
              border: '2px solid #2A2A30',
              color: '#94A3B8',
              fontSize: 16,
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Navigation destinations (D-06, auth-aware) */}
        <nav style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Always-visible destinations */}
          <Link href="/" onClick={onClose} style={linkBaseStyle}>
            Feed
          </Link>
          <Link href="/leaderboard" onClick={onClose} style={linkBaseStyle}>
            Leaderboard
          </Link>

          {/* Authenticated-only destinations (Pitfall 5 — gated on authenticated && ready) */}
          {showAuthedLinks && (
            <>
              {profileAddr && (
                <Link
                  href={`/profile/${profileAddr}`}
                  onClick={onClose}
                  style={linkBaseStyle}
                >
                  Profile
                </Link>
              )}
              <Link href="/new" onClick={onClose} style={linkBaseStyle}>
                New Call
              </Link>
            </>
          )}

          {/* Auth toggle: Sign in (logged out) / Sign out (logged in) */}
          {authenticated ? (
            <button
              type="button"
              onClick={handleSignOut}
              style={{
                ...linkBaseStyle,
                border: '2px solid #E8F542',
                boxShadow: '3px 3px 0 0 #E8F542',
                color: '#E8F542',
              }}
            >
              Sign out
            </button>
          ) : (
            <Link
              href="/signin"
              onClick={onClose}
              style={{
                ...linkBaseStyle,
                border: '2px solid #E8F542',
                boxShadow: '3px 3px 0 0 #E8F542',
                color: '#E8F542',
              }}
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}
