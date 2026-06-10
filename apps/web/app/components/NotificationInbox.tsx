'use client';
/**
 * NotificationInbox — slide-over panel listing caller-exit notifications.
 *
 * Renders each notification as an .activity-row (the designated inbox template,
 * D-13): type pill | content | JBM relative time, entering with the stampIn
 * animation. Handles only (AUTH-44).
 *
 * Mark-read: POST /api/notifications/mark-read { ids: [...] }
 *   Sends Authorization: Bearer <privy access token> — the relayer's
 *   privySessionPreHandler requires it and resolves the owner address from the
 *   verified session (CR-01/CR-03). The client no longer sends a ?user= param.
 *
 * 09.2-13 retheme: chrome only — the 30s poll lives in NotificationBell; the
 * mark-read wiring, Escape/backdrop close, and auto-mark-on-open are UNTOUCHED.
 * Empty state is exactly "No notifications yet" (UI-SPEC copy contract, D-07).
 *
 * Security (T-02-09-03):
 *   - mark-read POST hits relayer with Privy session auth (Plan 07 privySessionPreHandler);
 *     the owner address is resolved from the verified session server-side (CR-01),
 *     so the component no longer needs (and never sends) a user address.
 *
 * Requirements: SOCIAL-24, SOCIAL-25, D-13
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { Notification } from './NotificationBell';

interface NotificationInboxProps {
  notifications: Notification[];
  onClose: () => void;
  onMarkedRead: (ids: number[]) => void;
  relayerUrl: string;
}

/** Format ISO timestamp as relative time ("3 min ago", "2 hr ago", "3 days ago") */
function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} days ago`;
}

/** Format USDC raw amount (string representation of 6-decimal uint) */
function formatUsdc(raw: string | undefined): string {
  if (!raw) return '$0';
  const n = Number(raw) / 1_000_000;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Single notification row — .activity-row recipe (stampIn entry) */
function NotificationCard({
  notification,
  isUnread,
}: {
  notification: Notification;
  isUnread: boolean;
}) {
  const handle = notification.payload.callerHandle ?? `#${notification.callId}`;
  const statement = notification.payload.callStatement
    ? `"${notification.payload.callStatement.slice(0, 50)}${notification.payload.callStatement.length > 50 ? '…' : ''}"`
    : `Call #${notification.callId}`;
  const slashStr = notification.payload.penaltyPaid
    ? formatUsdc(notification.payload.penaltyPaid)
    : notification.payload.slashAmount
    ? formatUsdc(notification.payload.slashAmount)
    : '';

  return (
    <div
      className="activity-row"
      style={{
        background: isUnread ? 'rgba(232,245,66,0.04)' : 'transparent',
        ...(isUnread ? { borderLeft: '2px solid var(--border-accent)', paddingLeft: 12 } : {}),
      }}
    >
      {/* Type pill */}
      {notification.eventType === 'caller_exited' ? (
        <span className="pill warn">EXIT</span>
      ) : (
        <span className="pill muted">NOTE</span>
      )}

      {/* Main content — handles only (AUTH-44) */}
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.4,
          minWidth: 0,
        }}
      >
        <span style={{ color: 'var(--accent-win)', fontWeight: 600 }}>@{handle}</span>
        {' '}exited their own call ·{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{statement}</span>
        {slashStr && (
          <>
            {' '}·{' '}
            <span style={{ color: 'var(--accent-loss)' }}>-{slashStr} slashed</span>
          </>
        )}
      </div>

      {/* Relative time — JBM */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'nowrap',
        }}
      >
        {formatRelativeTime(notification.createdAt)}
      </span>
    </div>
  );
}

export function NotificationInbox({
  notifications,
  onClose,
  onMarkedRead,
  relayerUrl,
}: NotificationInboxProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { getAccessToken } = usePrivy();

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // POST mark-read with the verified Privy access token. The relayer requires
  // Authorization: Bearer and resolves the owner address from the session
  // (CR-01/CR-03) — no ?user= param is sent. Returns true on success.
  const postMarkRead = useCallback(
    async (unreadIds: number[]): Promise<boolean> => {
      if (unreadIds.length === 0 || !relayerUrl) return false;
      try {
        const token = await getAccessToken();
        if (!token) return false;
        const res = await fetch(`${relayerUrl}/api/notifications/mark-read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ ids: unreadIds }),
        });
        return res.ok;
      } catch {
        // Silently ignore — UI stays consistent even if mark-read fails
        return false;
      }
    },
    [relayerUrl, getAccessToken],
  );

  // Auto-mark all unread as read when inbox opens
  useEffect(() => {
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;

    postMarkRead(unreadIds).then((ok) => {
      if (ok) onMarkedRead(unreadIds);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // Close when clicking outside the panel
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose]
  );

  const unreadNotifications = notifications.filter((n) => !n.readAt);
  const readNotifications = notifications.filter((n) => n.readAt);

  const handleMarkAllRead = useCallback(() => {
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unreadIds.length === 0) return;

    postMarkRead(unreadIds).then((ok) => {
      if (ok) onMarkedRead(unreadIds);
    });
  }, [notifications, onMarkedRead, postMarkRead]);

  return (
    /* Backdrop */
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(9,9,14,0.6)',
      }}
    >
      {/* Slide-over panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 380,
          height: '100vh',
          background: 'var(--bg-primary)',
          borderLeft: '3px solid var(--border-accent)',
          boxShadow: '-4px 0 0 0 #000',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 20px 16px 20px',
            borderBottom: '2px solid var(--border-active)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 16,
                fontWeight: 900,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                textTransform: 'uppercase',
              }}
            >
              Notifications
            </span>
            {unreadNotifications.length > 0 && (
              <span
                style={{
                  background: 'var(--accent-win)',
                  color: '#000',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 6px',
                  fontFamily: 'var(--font-mono)',
                  border: '1px solid #000',
                }}
              >
                {unreadNotifications.length}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Mark all read button */}
            {unreadNotifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'transparent',
                  border: '2px solid var(--border-active)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-active)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                Mark all read
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              style={{
                background: 'transparent',
                border: '2px solid var(--border-active)',
                color: 'var(--text-secondary)',
                fontSize: 16,
                cursor: 'pointer',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-active)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '4px 20px 16px',
          }}
        >
          {notifications.length === 0 ? (
            /* Empty state — prototype-voice mono microcopy (D-07) */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                gap: 12,
                paddingTop: 60,
              }}
            >
              <span className="label-overline">
                No notifications yet
              </span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                  maxWidth: 240,
                }}
              >
                You&apos;ll be notified when a caller exits a call you&apos;ve followed or faded.
              </span>
            </div>
          ) : (
            <>
              {/* Unread section */}
              {unreadNotifications.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="label-overline" style={{ margin: '12px 0 4px' }}>
                    Unread
                  </div>
                  {unreadNotifications.map((n) => (
                    <NotificationCard key={n.id} notification={n} isUnread={true} />
                  ))}
                </div>
              )}

              {/* Read section */}
              {readNotifications.length > 0 && (
                <div>
                  {unreadNotifications.length > 0 && (
                    <div
                      className="label-overline"
                      style={{
                        margin: '0 0 4px',
                        borderTop: '1px solid var(--border-active)',
                        paddingTop: 12,
                        width: '100%',
                      }}
                    >
                      Earlier
                    </div>
                  )}
                  {readNotifications.map((n) => (
                    <NotificationCard key={n.id} notification={n} isUnread={false} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '2px solid var(--border-active)',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Polled every 30s · {notifications.length} total
          </span>
        </div>
      </div>
    </div>
  );
}
