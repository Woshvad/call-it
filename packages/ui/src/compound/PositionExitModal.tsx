/**
 * PositionExitModal — Position-holder exit confirmation modal (single confirm)
 *
 * Lower-friction exit for followers/faders. Per D-11: position exit is lower-stakes
 * (flat 10% penalty) so it only requires a single confirm button — no type-to-confirm.
 * Shows penalty math and the amount the user will receive.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Neobrutalist: 2-3px borders, hard offset shadows, #09090E background.
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
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#09090E',
            border: `3px solid ${sideColor}`,
            boxShadow: `6px 6px 0 0 ${sideColor}`,
            padding: '28px',
            outline: 'none',
          }}
        >
          {/* Header */}
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
                fontFamily: 'monospace',
                fontSize: '18px',
                fontWeight: 700,
                color: sideColor,
                letterSpacing: '0.05em',
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
                color: '#94A3B8',
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

          {/* Position info */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              padding: '10px 14px',
              border: '2px solid #2E2E42',
              backgroundColor: '#13131D',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 700,
                color: sideColor,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {sideLabel}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
              position value: {formatUsdc(positionValue)}
            </span>
          </div>

          {/* Penalty breakdown — D-11 shows the math */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              marginBottom: '20px',
              border: '2px solid #2E2E42',
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
                borderBottom: '1px solid #2E2E42',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Position value
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8E8E8' }}>
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
                borderBottom: '1px solid #2E2E42',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                10% exit penalty
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#F87171' }}>
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
                backgroundColor: '#13131D',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8E8E8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                You receive
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '17px', fontWeight: 700, color: '#E8E8E8' }}>
                {formatUsdc(userReceives)}
              </span>
            </div>
          </div>

          {/* Penalty distribution note */}
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '11px',
              color: '#94A3B8',
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
                border: '2px solid #F87171',
                backgroundColor: 'rgba(248, 113, 113, 0.08)',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171' }}>
                {error}
              </span>
            </div>
          )}

          {/* Action buttons — D-11: single confirm button (no type-to-confirm) */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: '#E8E8E8',
                backgroundColor: 'transparent',
                border: '2px solid #2E2E42',
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
                flex: 2,
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: '#09090E',
                backgroundColor: isSubmitting ? '#2E2E42' : sideColor,
                border: `2px solid ${isSubmitting ? '#2E2E42' : '#09090E'}`,
                boxShadow: isSubmitting ? 'none' : '4px 4px 0 0 #000',
                padding: '12px 16px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.5 : 1,
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
