'use client';
/**
 * GlobalNav — persistent top navigation bar mounted in RootLayout.
 *
 * Contains:
 *   - CALL IT wordmark (left)
 *   - NotificationBell (right) — only visible when authenticated
 *
 * This is a client component because NotificationBell requires Privy + wagmi hooks.
 * Neobrutalist: #09090E bg, #E8F542 accent, 2px bottom border.
 *
 * Requirements: SOCIAL-24, SOCIAL-25 (notification access), D-13
 */

import Link from 'next/link';
import { NotificationBell } from './NotificationBell';

export function GlobalNav() {
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
      {/* Left: wordmark */}
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

      {/* Right: notification bell (authenticated only — handled inside NotificationBell) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NotificationBell />
      </div>
    </nav>
  );
}
