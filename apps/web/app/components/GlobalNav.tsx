'use client';
/**
 * GlobalNav — persistent top navigation bar mounted in RootLayout.
 *
 * Contains:
 *   - Hamburger menu trigger (left, MOBILE ONLY — opens the MobileDrawer, D-05)
 *   - CALL IT wordmark (left)
 *   - NotificationBell (right) — only visible when authenticated; STAYS pinned
 *     in the top bar on mobile (D-06) — NOT moved into the drawer.
 *
 * This is a client component because NotificationBell requires Privy + wagmi hooks
 * and the hamburger consumes useIsMobile + owns the drawer open-state.
 * Neobrutalist: #09090E bg, #E8F542 accent, 2px bottom border.
 *
 * Requirements: SOCIAL-24, SOCIAL-25 (notification access), D-13, UI-49, D-05, D-06
 */

import { useState } from 'react';
import Link from 'next/link';
import { NotificationBell } from './NotificationBell';
import { MobileDrawer } from './MobileDrawer';
import { useIsMobile } from '../hooks/useIsMobile';

export function GlobalNav() {
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <nav
      style={{
        background: '#09090E',
        borderBottom: '2px solid #2A2A30',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        height: 52,
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Left: hamburger (mobile only) + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isMobile && (
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#E8F542',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: -10,
            }}
          >
            ☰
          </button>
        )}

        {/* Wordmark */}
        <Link
          href="/"
          style={{
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 700,
            color: '#E8F542',
            textDecoration: 'none',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          CALL IT
        </Link>
      </div>

      {/* Right: notification bell (authenticated only — handled inside NotificationBell) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NotificationBell />
      </div>

      {/* Mobile navigation drawer — self-gates on `open`, safe to always mount */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </nav>
  );
}
