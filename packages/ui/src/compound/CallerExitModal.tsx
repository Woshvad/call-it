/**
 * CallerExitModal — Caller early-exit confirmation modal (type-to-confirm)
 *
 * High-friction exit for the caller. Per D-11: caller exit is irreversible,
 * public, and rep-slashing — so the user must type "EXIT" exactly to confirm.
 * Per D-12: surfaces decay context "drops toward 15% as expiry nears" to
 * nudge callers to think before bailing early.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Neobrutalist: 2-3px borders, hard offset shadows, #09090E background.
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
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.80)',
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
            width: '480px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#09090E',
            border: '3px solid #FB923C',
            boxShadow: '6px 6px 0 0 #FB923C',
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
                color: '#FB923C',
                letterSpacing: '0.05em',
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

          {/* D-12: Decay context — penalty drops toward 15% as expiry nears */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              marginBottom: '20px',
              padding: '14px',
              border: '2px solid #FB923C',
              backgroundColor: 'rgba(251, 146, 60, 0.06)',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
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
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#94A3B8',
              }}
            >
              Penalty range: 15% (at expiry) → ~50% (first 24h after creation)
            </span>
          </div>

          {/* Penalty breakdown */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0px',
              marginBottom: '20px',
              border: '2px solid #2E2E42',
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
                borderBottom: '1px solid #2E2E42',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Penalty ({penaltyPct}%)
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#F87171' }}>
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
                borderBottom: '1px solid #2E2E42',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                You receive
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8E8E8' }}>
                {formatUsdc(stakeReturned)}
              </span>
            </div>
            {/* Rep impact */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Rep impact
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#F87171' }}>
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
              border: '2px solid #94A3B8',
              backgroundColor: '#13131D',
            }}
          >
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 700,
                color: '#E8E8E8',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              PUBLIC BROADCAST
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#94A3B8',
                lineHeight: 1.5,
              }}
            >
              Your exit will be posted to the global feed. All followers and faders on this call
              will be notified. This action is permanent and cannot be undone.
            </span>
          </div>

          {/* Type-to-confirm input (D-11) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            <label
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Type <span style={{ color: '#FB923C', fontWeight: 700 }}>EXIT</span> to confirm
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
                backgroundColor: '#13131D',
                border: `2px solid ${confirmMatch ? '#FB923C' : '#2E2E42'}`,
                color: confirmMatch ? '#FB923C' : '#E8E8E8',
                fontFamily: 'monospace',
                fontSize: '16px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                padding: '12px 14px',
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
            {typeConfirm.length > 0 && !confirmMatch && (
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
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
                border: '2px solid #F87171',
                backgroundColor: 'rgba(248, 113, 113, 0.08)',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171' }}>
                {error}
              </span>
            </div>
          )}

          {/* Action buttons */}
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
              disabled={!isReady}
              style={{
                flex: 2,
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: isReady ? '#09090E' : '#2E2E42',
                backgroundColor: isReady ? '#FB923C' : '#1A1A24',
                border: `2px solid ${isReady ? '#09090E' : '#2E2E42'}`,
                boxShadow: isReady ? '4px 4px 0 0 #000' : 'none',
                padding: '12px 16px',
                cursor: isReady ? 'pointer' : 'not-allowed',
                opacity: isReady ? 1 : 0.5,
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
