/**
 * FollowFadeModal — Follow or Fade entry modal
 *
 * Radix Dialog pattern. Allows a user to deposit USDC into the follow or fade
 * pool of a live call. Uses computeMinSharesOut from @call-it/shared for 1%
 * slippage protection (SOCIAL-06). On SlippageExceeded revert, shows updated
 * expected shares and gates the Retry button (D-10).
 *
 * Retry depends on the parent's reserve-prop refetch (≤5s poll, D-07). After a
 * SlippageExceeded revert, Retry STAYS DISABLED until new reserve props arrive
 * (any of followReserve / fadeReserve / followTotalShares / fadeTotalShares
 * changes) so the recomputed minSharesOut reflects the post-revert reserves —
 * otherwise Retry would resubmit the identical stale minSharesOut and revert
 * again (WR-02). A full parent-driven `onRefreshReserves(await)` callback is the
 * larger alternative and is intentionally deferred (the "minimum, acceptable"
 * fix from 09-REVIEW.md). The parents (apps/web/app/call/[id] and
 * apps/web/app/duel/[challengeId]) already feed fresh reserve props on a 5s
 * poll, so the gate resolves automatically with no new props.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * Chrome: cream `.modal-panel` template (D-13, 09.2-08) — overlay
 * rgba(0,0,0,0.82) + blur(4px) z-200, panel var(--bg-inverse) with BLACK text,
 * 3px black border, var(--shadow-brutal-lg). Win chartreuse appears only on
 * DARK elements or as a black-bordered fill (chartreuse TEXT on cream fails
 * contrast); fade side uses var(--accent-loss) fills the same way.
 *
 * Requirements: SOCIAL-05, SOCIAL-06, SOCIAL-07, SOCIAL-08, UI-06
 * Spec: §15.3 — "Follow this call (filled yellow-green) · Fade · bet against (red outline)"
 * Decision: D-10 (SlippageExceeded UX)
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
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
   * User's live USDC wallet balance (6-decimal, bigint). When provided, the
   * confirm button is gated with "Insufficient USDC balance — you need $X.XX
   * more" if the entered amount exceeds it (quick-260611-5mh B5, mirroring
   * ChallengeFormModal). When undefined the gate is INACTIVE — degrade
   * gracefully, never fake a zero balance (D-07).
   */
  userBalance?: bigint;
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

/** Format shares bigint (18 decimals) for display.
 *  B5 coherence: a tiny non-zero value renders "<0.0001" instead of rounding
 *  down to "0.0000" (which contradicted the min-shares line next to it). */
function formatShares(shares: bigint): string {
  const n = Number(shares) / 1e18;
  if (n > 0 && n < 0.0001) return '<0.0001';
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
  userBalance,
  onSubmit,
}: FollowFadeModalProps) {
  const [amountUsd, setAmountUsd] = useState<string>('10');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slippageHit, setSlippageHit] = useState(false);
  // WR-02: true between a SlippageExceeded revert and the next reserve-prop
  // arrival. While true, Retry is disabled so it cannot resubmit the identical
  // stale minSharesOut. Cleared by the reserve-watching useEffect below once the
  // parent's 5s poll pushes fresh reserve props.
  const [awaitingFreshReserves, setAwaitingFreshReserves] = useState(false);

  // The modal always renders the latest reserve props the parent feeds it. The
  // parent (call/[id] + duel/[challengeId]) refetches reserves on a 5s poll, so
  // post-revert the recomputed estimate below tracks the live pool state.
  const effectiveFollowReserve = followReserve;
  const effectiveFadeReserve = fadeReserve;
  const effectiveFollowShares = followTotalShares;
  const effectiveFadeShares = fadeTotalShares;

  // WR-02: clear the post-revert lock once fresh reserve props arrive from the
  // parent's useReadContracts poll, re-enabling Retry so the recomputed
  // minSharesOut reflects the new reserves. Guarded on awaitingFreshReserves so
  // ordinary reserve updates (and the first render after open) are no-ops.
  useEffect(() => {
    if (awaitingFreshReserves) {
      setAwaitingFreshReserves(false);
    }
    // deps deliberately exclude awaitingFreshReserves: only fresh reserve
    // props should clear the lock (this package's eslint config has no
    // react-hooks plugin, so no disable directive is needed).
  }, [followReserve, fadeReserve, followTotalShares, fadeTotalShares]);

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
  // B5 coherence: both lines derive from the SAME computation — the displayed
  // min can never exceed the displayed expected (clamp guards display only;
  // the submitted minSharesOut is mathematically <= expectedShares already).
  const displayedMinShares = minSharesOut > expectedShares ? expectedShares : minSharesOut;

  // Validation
  const amountTooLow = amountInUsdc > 0n && amountInUsdc < MIN_POSITION;
  const amountTooHigh = amountInUsdc > remainingHeadroom;
  // B5 (quick-260611-5mh): insufficient-balance gate — only active when the
  // parent supplies a real balance (undefined = inactive, D-07 degrade).
  const insufficientBalance =
    userBalance !== undefined && amountInUsdc > 0n && amountInUsdc > userBalance;
  const balanceDeficit = insufficientBalance ? amountInUsdc - (userBalance ?? 0n) : 0n;
  // WR-02: while awaiting fresh reserves after a slippage revert, the submit
  // (Retry) button is non-interactive via the existing !isValid path (reuses the
  // disabled / not-allowed styling — no new colors/props).
  const isValid =
    amountInUsdc >= MIN_POSITION &&
    !amountTooHigh &&
    !insufficientBalance &&
    !isSubmitting &&
    !awaitingFreshReserves;

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
        // D-10: show updated expected shares + retry button.
        setSlippageHit(true);
        setError('Price moved — pool reserves changed. Updated estimate shown below. Retry unlocks once fresh reserves arrive so it submits with the new expected shares.');
        // WR-02: lock Retry until the parent's next reserve-prop refetch (≤5s
        // poll, D-07) arrives. The reserve-watching useEffect clears this flag
        // when new reserves land, at which point minSharesOut is recomputed
        // against the post-revert reserves. This replaces the former no-op
        // "clear refreshed* overrides" lines, which delivered nothing because
        // the overrides were never populated.
        setAwaitingFreshReserves(true);
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
    // Note: handleReset intentionally does NOT clear awaitingFreshReserves — the
    // submit (Retry) button stays gated until fresh reserve props arrive (the
    // reserve-watching useEffect clears the lock), so dismissing the slippage
    // panel cannot bypass the post-revert gate. The button re-enables on the
    // next reserve poll regardless of slippageHit, so it is never permanently
    // stuck (WR-02).
  }, []);

  const isFollowSide = side === 'follow';
  const sideLabel = isFollowSide ? 'Follow' : 'Fade';
  const sideColor = isFollowSide ? '#E8F542' : '#F87171';
  const sideBgAccent = isFollowSide ? '#E8F542' : '#F87171';

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
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
          {/* Header — mono overline voice + side chip (win/fade color on DARK chip only:
              chartreuse text on cream fails contrast, so the side name sits on black) */}
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px' }}>
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
                {sideLabel} This Call
              </Dialog.Title>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: '#000',
                  color: sideColor,
                  border: '2px solid #000',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                }}
              >
                {sideLabel}
              </span>
            </div>
            <button
              onClick={onClose}
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

          {/* Pool info row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '16px',
              marginBottom: '20px',
              padding: '12px',
              border: '2px solid #000',
              backgroundColor: 'rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                {sideLabel} Pool
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#000' }}>
                ${formatUsdc(reserve)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Your Position
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#000' }}>
                ${formatUsdc(userPosition)} / $100
              </span>
            </div>
          </div>

          {/* Amount input — .brutal-input recipe adapted for cream context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
            <label
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              Amount (USDC)
            </label>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', color: 'rgba(0,0,0,0.7)' }}>$</span>
              <input
                type="number"
                min="1"
                max={Math.floor(Number(remainingHeadroom) / 1_000_000)}
                step="1"
                value={amountUsd}
                onChange={(e) => { setAmountUsd(e.target.value); setError(null); setSlippageHit(false); }}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  border: `2px solid ${amountTooLow || amountTooHigh ? '#DC2626' : '#000'}`,
                  borderRadius: 0,
                  color: '#000',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '18px',
                  padding: '10px 12px',
                  outline: 'none',
                }}
                disabled={isSubmitting}
              />
            </div>
            {amountTooLow && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#DC2626' }}>
                Minimum position: $1.00
              </span>
            )}
            {amountTooHigh && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#DC2626' }}>
                Max remaining headroom: ${formatUsdc(remainingHeadroom)} (cumulative $100 cap)
              </span>
            )}
            {insufficientBalance && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#DC2626' }}>
                Insufficient USDC balance — you need ${formatUsdc(balanceDeficit)} more
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
                border: '2px solid #000',
                backgroundColor: 'rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
                  Expected shares
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#000' }}>
                  {formatShares(expectedShares)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
                  Min shares (1% slippage)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
                  {formatShares(displayedMinShares)}
                </span>
              </div>
            </div>
          )}

          {/* SlippageExceeded error + retry (D-10) — warning accent on a DARK strip
              (#FB923C text on cream fails contrast, so the panel goes black) */}
          {slippageHit && error && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '16px',
                padding: '12px',
                border: '2px solid #000',
                backgroundColor: '#000',
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#FB923C' }}>
                {error}
              </span>
              <button
                onClick={handleReset}
                style={{
                  fontFamily: 'var(--font-mono)',
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
              onClick={onClose}
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
              disabled={!isValid}
              style={{
                flex: '2 1 200px',
                minWidth: '200px',
                minHeight: '44px',
                fontFamily: 'var(--font-mono)',
                fontSize: '14px',
                fontWeight: 700,
                color: isValid ? '#000' : 'rgba(0,0,0,0.4)',
                backgroundColor: isValid ? sideBgAccent : 'rgba(0,0,0,0.15)',
                border: `2px solid ${isValid ? '#000' : 'rgba(0,0,0,0.3)'}`,
                boxShadow: isValid ? 'var(--shadow-brutal)' : 'none',
                padding: '12px 16px',
                cursor: isValid ? 'pointer' : 'not-allowed',
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
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'rgba(0,0,0,0.55)',
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
