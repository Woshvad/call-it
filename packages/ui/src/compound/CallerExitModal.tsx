/**
 * CallerExitModal — Caller early-exit confirmation modal (type-to-confirm)
 *
 * High-friction exit for the caller. Per D-11: caller exit is irreversible,
 * public, and rep-slashing — so the user must type "EXIT" exactly to confirm.
 * Per D-12: surfaces decay context "drops toward 15% as expiry nears" to
 * nudge callers to think before bailing early.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Chrome: cream `.modal-panel` template (D-13, 09.2-08) — overlay
 * rgba(0,0,0,0.82) + blur(4px) z-200, panel var(--bg-inverse) with BLACK text,
 * 3px black border, var(--shadow-brutal-lg). The exit is framed as a SLASH:
 * the warning accent (#FB923C) carries the penalty line on a DARK strip
 * (warning text on cream fails contrast) and fills the confirm CTA. The rep
 * slash renders the REAL repDelta prop — never a mock number (D-05).
 *
 * Requirements: SOCIAL-17, SOCIAL-18, SOCIAL-19, SOCIAL-22, SOCIAL-25, SOCIAL-26, UI-07
 * Spec: §15.3 — caller-specific actions, confirmation modal
 * Decisions: D-11 (type-to-confirm), D-12 (decay context)
 */

'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export type CallerExitModalProps = {
  open: boolean;
  onClose: () => void;
  /** The call being exited by the caller */
  callId: bigint;
  /** Current penalty percentage (e.g. 42 = 42%) — from computeCallerExitPenaltyPct */
  penaltyPct: number;
  /** Penalty dollar amount in USDC (6-decimal bigint) */
  penaltyUsdc: bigint;
  /** Amount returned to caller after slash (6-decimal USDC bigint) */
  stakeReturned: bigint;
  /** Reputation impact (negative integer, e.g. -35) */
  repDelta: number;
  /**
   * Called to submit the callerExit transaction.
   * Resolves on success, throws on error.
   */
  onSubmit: () => Promise<void>;
};

/** Format USDC bigint (6 decimals) to human-readable dollar string */
function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1_000_000;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Confirmation word the user must type — case-insensitive per spec */
const CONFIRM_WORD = 'EXIT';

export function CallerExitModal({
  open,
  onClose,
  callId: _callId,
  penaltyPct,
  penaltyUsdc,
  stakeReturned,
  repDelta,
  onSubmit,
}: CallerExitModalProps) {
  const [typeConfirm, setTypeConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-11: user must type "EXIT" (case-insensitive) before Confirm button activates
  const confirmMatch = typeConfirm.trim().toUpperCase() === CONFIRM_WORD;
  const isReady = confirmMatch && !isSubmitting;

  const handleClose = useCallback(() => {
    setTypeConfirm('');
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!isReady) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit();
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Transaction failed. Please try again.';
      setError(String(msg).slice(0, 200));
    } finally {
      setIsSubmitting(false);
    }
  }, [isReady, onSubmit, handleClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <Dialog.Portal>
        {/* .modal-overlay template (D-13): rgba(0,0,0,0.82) scrim + blur(4px), z-200 */}
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.82)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
          }}
        />
        {/* .modal-panel template (D-13): cream var(--bg-inverse), BLACK text,
            3px black border, brutal-lg shadow — every text token inside is inverse */}
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 201,
            width: '620px',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '90vh',
            overflowY: 'auto',
            backgroundColor: 'var(--bg-inverse)',
            color: '#000',
            border: '3px solid #000',
            boxShadow: 'var(--shadow-brutal-lg)',
            borderRadius: 0,
            padding: '36px',
            outline: 'none',
          }}
        >
          {/* Header — mono overline voice */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <Dialog.Title
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: '#000',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                margin: 0,
              }}
            >
              Exit Your Call
            </Dialog.Title>
            <button
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(0,0,0,0.55)',
                cursor: 'pointer',
                fontSize: '20px',
                lineHeight: 1,
                padding: '4px',
              }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* D-12: Decay context — the SLASH framing. Warning #FB923C accent on a
              DARK strip (warning text on cream fails contrast) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginBottom: '20px',
              padding: '14px',
              border: '2px solid #000',
              backgroundColor: '#000',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '15px',
                fontWeight: 700,
                color: '#FB923C',
              }}
            >
              {/* D-12: surfaces decay context */}
              Exit now: {penaltyPct}% penalty · drops toward 15% as expiry nears
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'rgba(245,241,232,0.7)',
              }}
            >
              Penalty range: 15% (at expiry) → ~50% (first 24h after creation)
            </span>
          </div>

          {/* Penalty breakdown — real values from props only (D-05) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              marginBottom: '20px',
              border: '2px solid #000',
            }}
          >
            {/* Penalty amount */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom: '1px solid rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Penalty ({penaltyPct}%)
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: '#B91C1C' }}>
                -{formatUsdc(penaltyUsdc)}
              </span>
            </div>
            {/* Stake returned */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderBottom: '1px solid rgba(0,0,0,0.25)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                You receive
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: '#000' }}>
                {formatUsdc(stakeReturned)}
              </span>
            </div>
            {/* Rep impact — REAL repDelta from props, never a mock (D-05) */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Rep impact
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: '#B91C1C' }}>
                {repDelta} rep
              </span>
            </div>
          </div>

          {/* PUBLIC BROADCAST warning — required per spec §8.7.3 */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              marginBottom: '20px',
              padding: '12px 14px',
              border: '2px solid #000',
              backgroundColor: 'rgba(0,0,0,0.04)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              PUBLIC BROADCAST
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'rgba(0,0,0,0.7)',
                lineHeight: 1.5,
              }}
            >
              Your exit will be posted to the global feed. All followers and faders on this call
              will be notified. This action is permanent and cannot be undone.
            </span>
          </div>

          {/* Type-to-confirm input (D-11) — .brutal-input recipe adapted for cream */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 700,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              Type <span style={{ color: '#B45309', fontWeight: 700 }}>EXIT</span> to confirm
            </label>
            <input
              type="text"
              value={typeConfirm}
              onChange={(e) => { setTypeConfirm(e.target.value); setError(null); }}
              placeholder="Type EXIT here"
              disabled={isSubmitting}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                backgroundColor: 'rgba(255,255,255,0.55)',
                border: `2px solid ${confirmMatch ? '#FB923C' : '#000'}`,
                borderRadius: 0,
                color: '#000',
                fontFamily: 'var(--font-mono)',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                padding: '12px 14px',
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
            {typeConfirm.length > 0 && !confirmMatch && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
                Type &quot;EXIT&quot; exactly to unlock the confirm button
              </span>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                border: '2px solid #DC2626',
                backgroundColor: 'rgba(220, 38, 38, 0.06)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#B91C1C' }}>
                {error}
              </span>
            </div>
          )}

          {/* Action buttons — flexWrap + per-button minWidth stacks them full-width
              when the panel clamps to calc(100vw - 32px) on a phone, side-by-side on the
              620px desktop panel. Intrinsic CSS only — no browser-only viewport read (Pitfall 2;
              this file feeds the Satori/@vercel/og Node build with no window). */}
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                flex: '1 1 160px',
                minWidth: '160px',
                minHeight: '44px',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
                color: '#000',
                backgroundColor: 'transparent',
                border: '2px solid #000',
                padding: '12px 16px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isReady}
              style={{
                flex: '2 1 200px',
                minWidth: '200px',
                minHeight: '44px',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
                color: isReady ? '#000' : 'rgba(0,0,0,0.4)',
                backgroundColor: isReady ? '#FB923C' : 'rgba(0,0,0,0.15)',
                border: `2px solid ${isReady ? '#000' : 'rgba(0,0,0,0.3)'}`,
                boxShadow: isReady ? 'var(--shadow-brutal)' : 'none',
                padding: '12px 16px',
                cursor: isReady ? 'pointer' : 'not-allowed',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
            >
              {isSubmitting ? 'Submitting...' : 'Confirm Exit'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
