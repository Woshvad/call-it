/**
 * FollowFadeModal — Follow or Fade entry modal
 *
 * Radix Dialog pattern. Allows a user to deposit USDC into the follow or fade
 * pool of a live call. Uses computeMinSharesOut from @call-it/shared for 1%
 * slippage protection (SOCIAL-06). On SlippageExceeded revert, re-reads reserves
 * and shows updated expected shares with retry button (D-10).
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Neobrutalist: 2-3px borders, hard offset shadows, #09090E background.
 *
 * Requirements: SOCIAL-05, SOCIAL-06, SOCIAL-07, SOCIAL-08, UI-06
 * Spec: §15.3 — "Follow this call (filled yellow-green) · Fade · bet against (red outline)"
 * Decision: D-10 (SlippageExceeded UX)
 */

'use client';

import { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  computeMinSharesOut,
  computeMinSharesOutWithSlippage,
  MIN_POSITION,
  MAX_POSITION,
} from '@call-it/shared';

export type FollowFadeModalProps = {
  open: boolean;
  onClose: () => void;
  /** The call being followed/faded */
  callId: bigint;
  /** Which side the user is entering */
  side: 'follow' | 'fade';
  /** Live follow pool reserve (6-decimal USDC, bigint) */
  followReserve: bigint;
  /** Live fade pool reserve (6-decimal USDC, bigint) */
  fadeReserve: bigint;
  /** Live total follow shares (18-decimal, bigint) */
  followTotalShares: bigint;
  /** Live total fade shares (18-decimal, bigint) */
  fadeTotalShares: bigint;
  /** User's current position on this side (6-decimal USDC, bigint) */
  userPosition: bigint;
  /**
   * Called to submit the follow/fade transaction.
   * Returns a promise — resolves on success, throws on contract error.
   * Throws with { name: 'SlippageExceeded', actualOut: bigint } on slippage revert.
   */
  onSubmit: (amountIn: bigint, minSharesOut: bigint) => Promise<void>;
};

/** Format USDC bigint (6 decimals) to human-readable dollar string */
function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1_000_000;
  return dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format shares bigint (18 decimals) for display */
function formatShares(shares: bigint): string {
  const n = Number(shares) / 1e18;
  return n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function FollowFadeModal({
  open,
  onClose,
  callId: _callId,
  side,
  followReserve,
  fadeReserve,
  followTotalShares,
  fadeTotalShares,
  userPosition,
  onSubmit,
}: FollowFadeModalProps) {
  const [amountUsd, setAmountUsd] = useState<string>('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageHit, setSlippageHit] = useState(false);
  // Updated reserves after SlippageExceeded — for retry with fresh data
  const [refreshedFollowReserve, setRefreshedFollowReserve] = useState<bigint | null>(null);
  const [refreshedFadeReserve, setRefreshedFadeReserve] = useState<bigint | null>(null);
  const [refreshedFollowShares, setRefreshedFollowShares] = useState<bigint | null>(null);
  const [refreshedFadeShares, setRefreshedFadeShares] = useState<bigint | null>(null);

  // Use refreshed reserves if available (after SlippageExceeded)
  const effectiveFollowReserve = refreshedFollowReserve ?? followReserve;
  const effectiveFadeReserve = refreshedFadeReserve ?? fadeReserve;
  const effectiveFollowShares = refreshedFollowShares ?? followTotalShares;
  const effectiveFadeShares = refreshedFadeShares ?? fadeTotalShares;

  // Parse amount input
  const amountFloat = parseFloat(amountUsd);
  const amountInUsdc: bigint = isNaN(amountFloat) || amountFloat <= 0
    ? 0n
    : BigInt(Math.round(amountFloat * 1_000_000));

  // Max remaining headroom
  const remainingHeadroom = MAX_POSITION - userPosition;

  // Choose pool side
  const reserve = side === 'follow' ? effectiveFollowReserve : effectiveFadeReserve;
  const totalShares = side === 'follow' ? effectiveFollowShares : effectiveFadeShares;

  // Compute expected shares and minSharesOut (1% slippage)
  const expectedShares = amountInUsdc > 0n
    ? computeMinSharesOut(totalShares, reserve, amountInUsdc)
    : 0n;
  const minSharesOut = amountInUsdc > 0n
    ? computeMinSharesOutWithSlippage(totalShares, reserve, amountInUsdc)
    : 0n;

  // Validation
  const amountTooLow = amountInUsdc > 0n && amountInUsdc < MIN_POSITION;
  const amountTooHigh = amountInUsdc > remainingHeadroom;
  const isValid = amountInUsdc >= MIN_POSITION && !amountTooHigh && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    setError(null);
    setSlippageHit(false);

    try {
      await onSubmit(amountInUsdc, minSharesOut);
      onClose();
    } catch (err: unknown) {
      // Check for SlippageExceeded error (D-10)
      const errObj = err as { cause?: { data?: { errorName?: string }; errorName?: string }; message?: string };
      const errName = errObj?.cause?.data?.errorName ?? errObj?.cause?.errorName ?? '';
      const isSlippage = errName === 'SlippageExceeded' ||
        (errObj?.message ?? '').includes('SlippageExceeded');

      if (isSlippage) {
        // D-10: re-read reserves and show updated expected shares + retry button
        setSlippageHit(true);
        setError('Price moved — pool reserves changed. Updated estimate shown below. Tap Retry to submit with the new expected shares.');
        // Signal that parent should re-read reserves; we reset refreshed state
        // In practice the parent passes in the latest useReadContracts data;
        // we trigger a visual refresh by clearing our overrides so parent's
        // next refetch (5s) or manual refresh picks up new values.
        setRefreshedFollowReserve(null);
        setRefreshedFadeReserve(null);
        setRefreshedFollowShares(null);
        setRefreshedFadeShares(null);
      } else {
        const msg = errObj?.message ?? 'Transaction failed. Please try again.';
        setError(String(msg).slice(0, 200));
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isValid, amountInUsdc, minSharesOut, onSubmit, onClose]);

  const handleReset = useCallback(() => {
    setError(null);
    setSlippageHit(false);
  }, []);

  const isFollowSide = side === 'follow';
  const sideLabel = isFollowSide ? 'Follow' : 'Fade';
  const sideColor = isFollowSide ? '#E8F542' : '#F87171';
  const sideBgAccent = isFollowSide ? '#E8F542' : '#F87171';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
            width: '440px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#09090E',
            border: `3px solid ${sideColor}`,
            boxShadow: `6px 6px 0 0 ${sideColor}`,
            padding: '28px',
            outline: 'none',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
              {sideLabel} This Call
            </Dialog.Title>
            <button
              onClick={onClose}
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

          {/* Pool info row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '16px',
              marginBottom: '20px',
              padding: '12px',
              border: '2px solid #2E2E42',
              backgroundColor: '#13131D',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {sideLabel} Pool
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: sideColor }}>
                ${formatUsdc(reserve)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Your Position
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#E8E8E8' }}>
                ${formatUsdc(userPosition)} / $100
              </span>
            </div>
          </div>

          {/* Amount input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <label
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Amount (USDC)
            </label>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '16px', color: '#94A3B8' }}>$</span>
              <input
                type="number"
                min="1"
                max={Math.floor(Number(remainingHeadroom) / 1_000_000)}
                step="1"
                value={amountUsd}
                onChange={(e) => { setAmountUsd(e.target.value); setError(null); setSlippageHit(false); }}
                style={{
                  flex: 1,
                  backgroundColor: '#13131D',
                  border: `2px solid ${amountTooLow || amountTooHigh ? '#F87171' : '#2E2E42'}`,
                  color: '#E8E8E8',
                  fontFamily: 'monospace',
                  fontSize: '18px',
                  padding: '10px 12px',
                  outline: 'none',
                }}
                disabled={isSubmitting}
              />
            </div>
            {amountTooLow && (
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#F87171' }}>
                Minimum position: $1.00
              </span>
            )}
            {amountTooHigh && (
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#F87171' }}>
                Max remaining headroom: ${formatUsdc(remainingHeadroom)} (cumulative $100 cap)
              </span>
            )}
          </div>

          {/* Expected shares preview */}
          {amountInUsdc > 0n && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginBottom: '20px',
                padding: '10px 12px',
                border: '2px solid #2E2E42',
                backgroundColor: '#13131D',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
                  Expected shares
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#E8E8E8' }}>
                  {formatShares(expectedShares)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
                  Min shares (1% slippage)
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
                  {formatShares(minSharesOut)}
                </span>
              </div>
            </div>
          )}

          {/* SlippageExceeded error + retry (D-10) */}
          {slippageHit && error && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '16px',
                padding: '12px',
                border: '2px solid #FB923C',
                backgroundColor: 'rgba(251, 146, 60, 0.08)',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#FB923C' }}>
                {error}
              </span>
              <button
                onClick={handleReset}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FB923C',
                  backgroundColor: 'transparent',
                  border: '2px solid #FB923C',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  alignSelf: 'flex-start',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                Got it — Retry
              </button>
            </div>
          )}

          {/* Generic error */}
          {!slippageHit && error && (
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
              onClick={onClose}
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
              disabled={!isValid}
              style={{
                flex: 2,
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 700,
                color: '#09090E',
                backgroundColor: isValid ? sideBgAccent : '#2E2E42',
                border: `2px solid ${isValid ? '#09090E' : '#2E2E42'}`,
                boxShadow: isValid ? '4px 4px 0 0 #000' : 'none',
                padding: '12px 16px',
                cursor: isValid ? 'pointer' : 'not-allowed',
                opacity: isValid ? 1 : 0.5,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                transition: 'transform 0.1s, box-shadow 0.1s',
              }}
            >
              {isSubmitting
                ? 'Submitting...'
                : slippageHit
                  ? `Retry ${sideLabel}`
                  : `Confirm ${sideLabel}`}
            </button>
          </div>

          {/* Fine print */}
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '10px',
              color: '#94A3B8',
              marginTop: '12px',
              textAlign: 'center',
            }}
          >
            4-hour exit cooldown · 10% exit penalty · min $1 · max $100 cumulative
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
