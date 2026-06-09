'use client';
/**
 * NotificationBell — bell icon with unread count badge + click-to-open inbox.
 *
 * Polls GET /api/notifications?user={address} every 30s (D-13).
 * Only renders when user is authenticated (Privy + wagmi).
 * Shows yellow-green unread count badge when unreadCount > 0.
 *
 * Neobrutalist design tokens:
 *   - #09090E background
 *   - #E8F542 accent (badge + active border)
 *   - 2px borders, hard offset shadows
 *
 * Security (T-02-09-03):
 *   - address from useAccount(), NOT URL param
 *   - Only renders when authenticated — no unauthenticated reads
 *   - Relayer auth gate enforced server-side (Plan 07)
 *
 * Requirements: SOCIAL-24, SOCIAL-25, D-13
 */

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { NotificationInbox } from './NotificationInbox';

// Relayer base URL from env (NEXT_PUBLIC_RELAYER_URL set in apps/web/.env)
const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

/** Shape returned by GET /api/notifications?user= (Plan 07) */
export interface Notification {
  id: number;
  userAddress: string;
  eventType: string;
  callId: number;
  payload: {
    callerHandle?: string;
    callStatement?: string;
    penaltyPaid?: string;
    slashAmount?: string;
  };
  createdAt: string;
  readAt: string | null;
}

/** Bell SVG icon — neobrutalist, no emoji fallback */
function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke={hasUnread ? '#E8F542' : '#94A3B8'}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function NotificationBell() {
  const { authenticated, ready } = usePrivy();
  const { address } = useAccount();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch notifications from relayer
  const fetchNotifications = useCallback(async () => {
    if (!authenticated || !address || !RELAYER_URL) return;

    try {
      const res = await fetch(
        `${RELAYER_URL}/api/notifications?user=${encodeURIComponent(address)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;

      const data = (await res.json()) as { notifications: Notification[]; unreadCount: number };
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
      setHasFetched(true);
    } catch {
      // Silently ignore — polling will retry on next interval
    }
  }, [authenticated, address]);

  // Initial fetch + 30s polling interval (D-13)
  useEffect(() => {
    if (!authenticated || !address) return;

    fetchNotifications();

    const intervalId = setInterval(() => {
      fetchNotifications();
    }, 30_000);

    return () => {
      clearInterval(intervalId);
    };
  }, [authenticated, address, fetchNotifications]);

  // Mark all as read when inbox opens (auto-mark on open)
  const handleOpen = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Called by NotificationInbox after successful mark-read POST
  const handleMarkedRead = useCallback((ids: number[]) => {
    setNotifications((prev) =>
      prev.map((n) =>
        ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }, []);

  // render when authenticated + ready (address may lag for OAuth — WR-03)
  if (!ready || !authenticated) return null;

  // Only render after first successful fetch (or if inbox is already open)
  if (!hasFetched && !isOpen) {
    // Still show the bell even before first fetch completes — just no badge
  }

  const hasUnread = unreadCount > 0;

  return (
    <>
      {/* Bell button */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={handleOpen}
          aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
          style={{
            background: 'transparent',
            border: `2px solid ${hasUnread ? '#E8F542' : '#2A2A30'}`,
            cursor: 'pointer',
            padding: '6px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            color: hasUnread ? '#E8F542' : '#94A3B8',
            boxShadow: hasUnread ? '2px 2px 0 0 #E8F542' : 'none',
            transition: 'all 0.1s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#E8F542';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = hasUnread ? '#E8F542' : '#2A2A30';
          }}
        >
          <BellIcon hasUnread={hasUnread} />

          {/* Unread count badge */}
          {hasUnread && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: '#E8F542',
                color: '#09090E',
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: 700,
                borderRadius: 0,
                border: '2px solid #09090E',
                minWidth: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                padding: '0 3px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification inbox overlay */}
      {isOpen && (
        <NotificationInbox
          notifications={notifications}
          onClose={handleClose}
          onMarkedRead={handleMarkedRead}
          relayerUrl={RELAYER_URL}
        />
      )}
    </>
  );
}
