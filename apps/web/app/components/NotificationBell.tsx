'use client';
/**
 * NotificationBell — bell icon with unread count badge + click-to-open inbox.
 *
 * Polls GET /api/notifications?user={address} every 30s (D-13).
 * Only renders when user is authenticated (Privy + wagmi).
 * Shows yellow-green unread count badge when unreadCount > 0.
 *
 * Trigger chrome (plan 09.2-03): `.icon-btn` recipe from the 09.2-01 token
 * layer — 36px square, 2px var(--border-active) border, radius 0; unread
 * state rides var(--accent-win)/var(--border-accent). Poll wiring and
 * inbox-open logic are untouched (the inbox panel itself is plan 09.2-13).
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
import { Icon } from './Icon';

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
      {/* Bell button — .icon-btn trigger chrome (square, 2px border, radius 0) */}
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          onClick={handleOpen}
          aria-label={`Notifications${hasUnread ? ` (${unreadCount} unread)` : ''}`}
          className="icon-btn"
          style={
            hasUnread
              ? {
                  borderColor: 'var(--border-accent)',
                  color: 'var(--accent-win)',
                  boxShadow: '2px 2px 0 0 var(--accent-win)',
                }
              : undefined
          }
        >
          <Icon name="bell" size={16} strokeWidth={1.7} />

          {/* Unread count badge */}
          {hasUnread && (
            <span
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                background: 'var(--accent-win)',
                color: 'var(--bg-primary)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                borderRadius: 0,
                border: '2px solid var(--bg-primary)',
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
