/**
 * ChallengeFormModal — Surface 7 of Phase 3 UI-SPEC
 *
 * Shared modal component for proposing a 1v1 challenge. Used from both:
 *   - apps/web/app/duel/[challengeId]/page.tsx  (challenger path)
 *   - apps/web/app/call/[id]/page.tsx            (challenge button in Live Receipt)
 *
 * Prefills stake to caller's exact stake (SOCIAL-30). Override allowed within
 * $5–$100 Zod bounds. USDC allowance + balance preflight (Rule 2 / T-3-06-06).
 * callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31 (D-09).
 *
 * Chrome: cream `.modal-panel` template (D-13, 09.2-08) — overlay
 * rgba(0,0,0,0.82) + blur(4px) z-200, panel var(--bg-inverse) with BLACK text,
 * 3px black border, var(--shadow-brutal-lg). Duel purple #A855F7 (D-03) is
 * confined to the 1V1 DUEL identity pill on a DARK chip (purple text on cream
 * fails contrast). Quick-stake selectors use the .toggle-pill recipe with the
 * black-filled active state.
 *
 * Security: never renders wallet address (AUTH-44). Only handles displayed.
 * Threat: T-3-06-01 (stake bounds), T-3-06-02 (self-challenge guard), T-3-06-06 (allowance).
 *
 * Requirements: SOCIAL-30, SOCIAL-34, UI-11
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { ACTIVE_CHAIN_ID, CHALLENGE_ESCROW_ADDRESS, USDC_ADDRESS } from '@/lib/chain';
import { ensureActiveChain } from '@/lib/ensure-chain';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Min/max stake in USDC micro-units (6 decimals) matching Foundry gates (D-29 parity) */
export const CHALLENGE_MIN_STAKE_USDC = 5_000_000n; // $5
export const CHALLENGE_MAX_STAKE_USDC = 100_000_000n; // $100

/** ChallengeEscrow address — chain-selected via @/lib/chain; never inline hex. */
const CE_ADDR = CHALLENGE_ESCROW_ADDRESS;

/** USDC token — chain-selected via @/lib/chain (RC1: was hardcoded MAINNET USDC,
 *  which made the allowance/balance reads return 0 on Sepolia and wrongly block
 *  challenges with "Insufficient USDC balance"). IN-05: sourced from @call-it/shared. */
const USDC_ADDR = USDC_ADDRESS;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

/** Minimal ABI slice for ChallengeEscrow.proposeChallenge */
const CE_ABI = [
  {
    type: 'function',
    name: 'proposeChallenge',
    inputs: [
      { name: 'callId', type: 'uint256' },
      { name: 'stake', type: 'uint96' },
    ],
    outputs: [{ name: 'challengeId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;

/** Minimal USDC ABI for allowance + approve */
const USDC_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChallengeFormModalProps = {
  /** Whether the modal is open */
  open: boolean;
  /** Close the modal (does not trigger any action) */
  onClose: () => void;
  /** On-chain callId of the call being challenged */
  callId: bigint;
  /** Caller's handle for display */
  callerHandle: string;
  /**
   * Caller's original stake in USDC micro-units (6 dec).
   * Used to pre-fill the challenger's stake (SOCIAL-30).
   */
  callerStake: bigint;
  /** Human-readable call market line for display */
  marketLine: string;
  /** Called after a successful proposeChallenge tx */
  onSuccess?: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUsdc(amount: bigint): string {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

function validateStake(raw: string): { value: bigint | null; error: string | null } {
  if (!raw.trim()) return { value: null, error: 'Enter a stake amount' };
  const n = parseFloat(raw);
  if (isNaN(n) || n <= 0) return { value: null, error: 'Invalid amount' };
  const micro = BigInt(Math.round(n * 1_000_000));
  if (micro < CHALLENGE_MIN_STAKE_USDC)
    return { value: null, error: 'Minimum stake is $5 USDC' };
  if (micro > CHALLENGE_MAX_STAKE_USDC)
    return { value: null, error: 'Maximum stake is $100 USDC' };
  return { value: micro, error: null };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChallengeFormModal({
  open,
  onClose,
  callId,
  callerHandle,
  callerStake,
  marketLine,
  onSuccess,
}: ChallengeFormModalProps) {
  const { address: userAddress } = useAccount();

  // Stake input state — pre-filled to caller's stake (SOCIAL-30)
  const [stakeInput, setStakeInput] = useState('');
  const [stakeError, setStakeError] = useState<string | null>(null);

  // Preflight states
  const [approving, setApproving] = useState(false);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [challenging, setChallenging] = useState(false);
  const [challengeTxHash, setChallengeTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // Reset form when opened, pre-fill caller stake
  useEffect(() => {
    if (open) {
      const prefill = (Number(callerStake) / 1_000_000).toFixed(2);
      setStakeInput(prefill);
      setStakeError(null);
      setApproving(false);
      setApproveTxHash(undefined);
      setChallenging(false);
      setChallengeTxHash(undefined);
      setToastMsg(null);
    }
  }, [open, callerStake]);

  // Derived stake value
  const stakeValidation = validateStake(stakeInput);
  const stakeValue = stakeValidation.value;

  // callerMatchingStake = min(challengerInput, callerStake) — SOCIAL-31 correct formula
  // NOT min(x,x) — this is the critical bug fix from Issue #1
  const callerMatchingStake =
    stakeValue !== null
      ? stakeValue < callerStake
        ? stakeValue
        : callerStake
      : 0n;

  const isAsymmetric =
    stakeValue !== null && callerStake > 0n && stakeValue !== callerStake;
  const potIfAccepted = callerMatchingStake * 2n;

  // ─── USDC reads ────────────────────────────────────────────────────────────

  const userAddr =
    (userAddress as `0x${string}` | undefined) ??
    '0x0000000000000000000000000000000000000000';

  const isZeroAddr =
    CE_ADDR === '0x0000000000000000000000000000000000000000';

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDR,
    chainId: ACTIVE_CHAIN_ID, // RC1: pin the read to the active chain
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [userAddr, CE_ADDR],
    query: { enabled: open && !isZeroAddr && !!userAddress },
  });

  const { data: balanceData } = useReadContract({
    address: USDC_ADDR,
    chainId: ACTIVE_CHAIN_ID, // RC1: pin the read to the active chain
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [userAddr],
    query: { enabled: open && !!userAddress },
  });

  const currentAllowance = (allowanceData as bigint | undefined) ?? 0n;
  const currentBalance = (balanceData as bigint | undefined) ?? 0n;

  const needsApproval =
    !isZeroAddr && stakeValue !== null && currentAllowance < stakeValue;
  const insufficientBalance =
    stakeValue !== null && currentBalance < stakeValue;

  // ─── Wagmi writes ──────────────────────────────────────────────────────────

  const { writeContractAsync } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { isSuccess: challengeConfirmed } =
    useWaitForTransactionReceipt({ hash: challengeTxHash });

  // After approval confirmed — refetch allowance
  useEffect(() => {
    if (approveConfirmed) {
      void refetchAllowance();
      setApproving(false);
    }
  }, [approveConfirmed, refetchAllowance]);

  // After challenge tx confirmed — success
  useEffect(() => {
    if (challengeConfirmed) {
      setChallenging(false);
      setToastMsg({ text: `Challenge sent — ${callerHandle} has 24h to accept.`, isError: false });
      setTimeout(() => {
        setToastMsg(null);
        onClose();
        if (onSuccess) onSuccess();
      }, 2500);
    }
  }, [challengeConfirmed, callerHandle, onClose, onSuccess]);

  const handleApprove = useCallback(async () => {
    if (!stakeValue) return;
    setApproving(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: USDC_ADDR,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [CE_ADDR, stakeValue],
      });
      setApproveTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setToastMsg({ text: msg, isError: true });
      setApproving(false);
    }
  }, [stakeValue, writeContractAsync]);

  const handleSendChallenge = useCallback(async () => {
    if (!stakeValue) return;
    // T-3-06-02: self-challenge guard
    // (The caller address is not available here; the contract will revert with SelfChallenge)
    setChallenging(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: CE_ADDR,
        abi: CE_ABI,
        functionName: 'proposeChallenge',
        args: [callId, stakeValue],
      });
      setChallengeTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Challenge failed';
      setToastMsg({ text: `Challenge failed — ${msg}`, isError: true });
      setChallenging(false);
    }
  }, [stakeValue, callId, writeContractAsync]);

  if (!open) return null;

  const canSend =
    !stakeError &&
    stakeValue !== null &&
    !insufficientBalance &&
    !needsApproval &&
    !challenging &&
    !approving &&
    !approveConfirming;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      // .modal-overlay template (D-13): rgba(0,0,0,0.82) scrim + blur(4px), z-200
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Toast — floating dark notice (kept dark for contrast over the scrim) */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 300,
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: `4px solid ${toastMsg.isError ? 'var(--accent-loss)' : '#4ADE80'}`,
            padding: '14px 18px',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-primary)',
            maxWidth: '340px',
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* .modal-panel template (D-13): cream var(--bg-inverse), BLACK text,
          3px black border, brutal-lg shadow — every text token inside is inverse */}
      <div
        style={{
          position: 'relative',
          backgroundColor: 'var(--bg-inverse)',
          color: '#000',
          border: '3px solid #000',
          boxShadow: 'var(--shadow-brutal-lg)',
          borderRadius: 0,
          padding: 'clamp(24px, 5vw, 36px)',
          width: '100%',
          // Mobile (D-04): never exceed the viewport minus a 16px gutter each side.
          // Intrinsic viewport-relative clamp — no JS viewport read needed.
          maxWidth: 'min(620px, calc(100vw - 32px))',
          maxHeight: '90vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header — duel identity pill (D-03: purple is duel identity, on a DARK
            chip only — purple text on cream fails contrast) + mono confirm voice */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: '#000',
                color: '#A855F7',
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '4px 10px',
              }}
            >
              1V1 DUEL · PROPOSE
            </span>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.01em', margin: 0 }}>
              CHALLENGE {callerHandle}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.55)', fontSize: '20px', padding: '4px', lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Parent call read-only card */}
        <div
          style={{
            border: '2px solid #000',
            backgroundColor: 'rgba(0,0,0,0.04)',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
            CHALLENGING
          </div>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#000', margin: 0, lineHeight: 1.4 }}>
            {marketLine || `Call #${String(callId)}`}
          </p>
          <div style={{ marginTop: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.6)' }}>
            Caller stake: {formatUsdc(callerStake)}
          </div>
        </div>

        {/* YOUR STAKE input — .brutal-input recipe adapted for cream context */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            YOUR STAKE
          </label>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              border: `2px solid ${stakeError ? '#DC2626' : '#000'}`,
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          >
            <input
              type="number"
              step="0.01"
              min="5"
              max="100"
              value={stakeInput}
              onChange={(e) => {
                setStakeInput(e.target.value);
                const v = validateStake(e.target.value);
                setStakeError(v.error);
              }}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                color: '#000',
                padding: '12px 14px',
              }}
              placeholder="100.00"
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.55)', padding: '0 14px' }}>
              USDC
            </span>
          </div>
          {stakeError && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#DC2626' }}>
              {stakeError}
            </span>
          )}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>
            Pre-filled: matches {callerHandle}&apos;s stake of {formatUsdc(callerStake)}
          </span>

          {/* Quick-stake buttons — .toggle-pill recipe: black-filled active state
              (.on = bg #000 cream text; inverse-on-inverse needs the dark fill) */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginTop: '4px' }}>
            {[5, 25, 50, 100].map((amt) => (
              <button
                key={amt}
                onClick={() => {
                  const val = amt.toFixed(2);
                  setStakeInput(val);
                  const v = validateStake(val);
                  setStakeError(v.error);
                }}
                style={{
                  flex: 1,
                  minHeight: '44px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  color: stakeInput === amt.toFixed(2) ? 'var(--bg-inverse)' : '#000',
                  backgroundColor: stakeInput === amt.toFixed(2) ? '#000' : 'transparent',
                  border: '2px solid #000',
                  borderRadius: 0,
                  padding: '6px 4px',
                  cursor: 'pointer',
                }}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Balance error */}
        {insufficientBalance && stakeValue !== null && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#B91C1C', border: '2px solid #DC2626', padding: '8px 12px' }}>
            Insufficient USDC balance — you need {formatUsdc(stakeValue - currentBalance)} more
          </div>
        )}

        {/* POT IF ACCEPTED — FINAL · CONFIRM voice */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.25)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            FINAL · POT IF ACCEPTED
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: '#000' }}>
            {stakeValue !== null ? formatUsdc(potIfAccepted) : '—'} · winner takes all
          </div>
          {isAsymmetric && stakeValue !== null && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)', marginTop: '4px' }}>
              Asymmetric duel — pot: {formatUsdc(potIfAccepted)}; overage returned to you at settlement
            </div>
          )}
        </div>

        {/* USDC approval preflight (T-3-06-06) */}
        {needsApproval && stakeValue !== null && !insufficientBalance && (
          <div style={{ border: '2px solid #000', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)' }}>
              Approve USDC first — allow {formatUsdc(stakeValue)} to ChallengeEscrow
            </span>
            <button
              onClick={() => void handleApprove()}
              disabled={approving || approveConfirming}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                fontWeight: 700,
                color: approving || approveConfirming ? 'rgba(0,0,0,0.4)' : '#000',
                backgroundColor: approving || approveConfirming ? 'rgba(0,0,0,0.15)' : '#E8F542',
                border: '2px solid #000',
                boxShadow: approving || approveConfirming ? 'none' : 'var(--shadow-brutal)',
                padding: '10px 16px',
                cursor: approving || approveConfirming ? 'not-allowed' : 'pointer',
              }}
            >
              {approving || approveConfirming ? 'Approving…' : 'Approve USDC ▸'}
            </button>
          </div>
        )}

        {/* Placeholder notice when contract not yet deployed */}
        {isZeroAddr && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.35)', padding: '10px' }}>
            ChallengeEscrow not yet deployed — challenges available after operator deploy (03-03)
          </div>
        )}

        {/* Action row — flexWrap + per-button minWidth so the row stays side-by-side
            on the desktop panel but stacks full-width when the panel clamps to
            calc(100vw - 32px) on a 375px phone (D-04). Intrinsic — no JS viewport read. */}
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
          {/* Keep call open — cancel */}
          <button
            onClick={onClose}
            style={{
              flex: '1 1 160px',
              minWidth: '160px',
              minHeight: '44px',
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#000',
              backgroundColor: 'transparent',
              border: '2px solid #000',
              padding: '14px 16px',
              cursor: 'pointer',
            }}
          >
            Keep call open
          </button>
          {/* Send Challenge — strong CTA on cream = black fill, cream text */}
          <button
            onClick={() => void handleSendChallenge()}
            disabled={!canSend}
            style={{
              flex: '2 1 200px',
              minWidth: '200px',
              minHeight: '44px',
              fontFamily: 'var(--font-display)',
              fontSize: '14px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: canSend ? 'var(--bg-inverse)' : 'rgba(0,0,0,0.4)',
              backgroundColor: canSend ? '#000' : 'rgba(0,0,0,0.15)',
              border: `3px solid ${canSend ? '#000' : 'rgba(0,0,0,0.3)'}`,
              boxShadow: canSend ? 'var(--shadow-brutal)' : 'none',
              padding: '14px 16px',
              cursor: canSend ? 'pointer' : 'not-allowed',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'box-shadow 0.1s ease-out',
            }}
          >
            {challenging ? 'Sending…' : 'Send Challenge ▸'}
          </button>
        </div>
      </div>
    </div>
  );
}
