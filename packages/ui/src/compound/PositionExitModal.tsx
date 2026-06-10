/**
 * PositionExitModal — Position-holder exit confirmation modal (single confirm)
 *
 * Lower-friction exit for followers/faders. Per D-11: position exit is lower-stakes
 * (flat 10% penalty) so it only requires a single confirm button — no type-to-confirm.
 * Shows penalty math and the amount the user will receive.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Chrome: cream `.modal-panel` template (D-13, 09.2-08) — overlay
 * rgba(0,0,0,0.82) + blur(4px) z-200, panel var(--bg-inverse) with BLACK text,
 * 3px black border, var(--shadow-brutal-lg). Side accents (win chartreuse /
 * fade red) appear only on DARK chips or as black-bordered fills (side-color
 * TEXT on cream fails contrast). All money values are real props.
 *
 * Requirements: SOCIAL-12, SOCIAL-13, SOCIAL-14, SOCIAL-50, UI-07
 * Spec: §15.3 — "Position-holder actions" confirmation modal
 * Decision: D-11 (single confirm button showing math)
 */

'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

export type PositionExitModalProps = {
  open: boolean;
  onClose: () => void;
  /** The call being exited */
  callId: bigint;
  /** Which pool side the user is in */
  side: 'follow' | 'fade';
  /** Total position value at current share price (6-decimal USDC bigint) */
  positionValue: bigint;
  /** Slash amount — 10% of positionValue (6-decimal USDC bigint) */
  slash: bigint;
  /** Amount user receives after slash (6-decimal USDC bigint) */
  userReceives: bigint;
  /**
   * Called to submit the exitPosition transaction.
   * Resolves on success, throws on error.
   */
  onSubmit: () => Promise<void>;
};

/** Format USDC bigint (6 decimals) to human-readable dollar string */
function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1_000_000;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function PositionExitModal({
  open,
  onClose,
  callId: _callId,
  side,
  positionValue,
  slash,
  userReceives,
  onSubmit,
}: PositionExitModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sideLabel = side === 'follow' ? 'Following' : 'Fading';
  const sideColor = side === 'follow' ? '#E8F542' : '#F87171';

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
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
  }, [isSubmitting, onSubmit, handleClose]);

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
              Exit Your Position
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

          {/* Position info — side name on a DARK chip (side-color text on cream
              fails contrast, so the accent sits on black) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '10px 14px',
              border: '2px solid #000',
              backgroundColor: 'rgba(0,0,0,0.04)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                backgroundColor: '#000',
                color: sideColor,
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                padding: '3px 8px',
              }}
            >
              {sideLabel}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
              position value: {formatUsdc(positionValue)}
            </span>
          </div>

          {/* Penalty breakdown — D-11 shows the math (real values from props) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              marginBottom: '20px',
              border: '2px solid #000',
            }}
          >
            {/* Position value */}
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
                Position value
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: '#000' }}>
                {formatUsdc(positionValue)}
              </span>
            </div>
            {/* 10% penalty */}
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
                10% exit penalty
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: '#B91C1C' }}>
                -{formatUsdc(slash)}
              </span>
            </div>
            {/* You receive */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                backgroundColor: 'rgba(0,0,0,0.04)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#000', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                You receive
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: 700, color: '#000' }}>
                {formatUsdc(userReceives)}
              </span>
            </div>
          </div>

          {/* Penalty distribution note */}
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'rgba(0,0,0,0.6)',
              marginBottom: '20px',
              lineHeight: 1.5,
            }}
          >
            The 10% slash is split: 50% to the opposite pool · 40% to your pool · 10% to protocol.
          </p>

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

          {/* Action buttons — D-11: single confirm button (no type-to-confirm).
              flexWrap + per-button minWidth stacks them full-width when the panel clamps
              to calc(100vw - 32px) on a phone, side-by-side on the 620px desktop panel.
              Intrinsic CSS only — no browser-only viewport read (Pitfall 2; this file feeds the
              Satori/@vercel/og Node build with no window). */}
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                flex: '1 1 150px',
                minWidth: '150px',
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
              disabled={isSubmitting}
              style={{
                flex: '2 1 190px',
                minWidth: '190px',
                minHeight: '44px',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
                color: isSubmitting ? 'rgba(0,0,0,0.4)' : '#000',
                backgroundColor: isSubmitting ? 'rgba(0,0,0,0.15)' : sideColor,
                border: `2px solid ${isSubmitting ? 'rgba(0,0,0,0.3)' : '#000'}`,
                boxShadow: isSubmitting ? 'none' : 'var(--shadow-brutal)',
                padding: '12px 16px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
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
