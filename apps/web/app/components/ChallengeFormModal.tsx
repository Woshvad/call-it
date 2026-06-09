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
 * Security: never renders wallet address (AUTH-44). Only handles displayed.
 * Threat: T-3-06-01 (stake bounds), T-3-06-02 (self-challenge guard), T-3-06-06 (allowance).
 *
 * Requirements: SOCIAL-30, SOCIAL-34, UI-11
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { CHALLENGE_ESCROW_ARBITRUM_SEPOLIA, USDC_ARB_NATIVE } from '@call-it/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Min/max stake in USDC micro-units (6 decimals) matching Foundry gates (D-29 parity) */
export const CHALLENGE_MIN_STAKE_USDC = 5_000_000n; // $5
export const CHALLENGE_MAX_STAKE_USDC = 100_000_000n; // $100

/** ChallengeEscrow address — imported from @call-it/shared; never inline hex. */
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;

/** USDC native on Arbitrum (canonical) */
const USDC_ADDR = USDC_ARB_NATIVE as `0x${string}`; // IN-05: imported from @call-it/shared

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
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [userAddr, CE_ADDR],
    query: { enabled: open && !isZeroAddr && !!userAddress },
  });

  const { data: balanceData } = useReadContract({
    address: USDC_ADDR,
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
      const hash = await writeContractAsync({
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
      const hash = await writeContractAsync({
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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(9,9,14,0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 200,
            backgroundColor: '#111118',
            borderLeft: `4px solid ${toastMsg.isError ? '#F87171' : '#4ADE80'}`,
            padding: '14px 18px',
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#F1F5F9',
            maxWidth: '340px',
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* Modal panel */}
      <div
        style={{
          position: 'relative',
          backgroundColor: '#111118',
          border: '3px solid #E8F542',
          boxShadow: '4px 4px 0 #E8F542',
          padding: '24px',
          width: '100%',
          // Mobile (D-04): never exceed the viewport minus a 16px gutter each side.
          // Intrinsic viewport-relative clamp — no JS viewport read needed.
          maxWidth: 'min(480px, calc(100vw - 32px))',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* CornerBrackets top-left */}
        <div style={{ position: 'absolute', top: -2, left: -2, pointerEvents: 'none' }}>
          <div style={{ width: '16px', height: '4px', backgroundColor: '#E8F542' }} />
          <div style={{ width: '4px', height: '12px', backgroundColor: '#E8F542' }} />
        </div>
        {/* CornerBrackets bottom-right */}
        <div style={{ position: 'absolute', bottom: -2, right: -2, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ width: '4px', height: '12px', backgroundColor: '#E8F542' }} />
          <div style={{ width: '16px', height: '4px', backgroundColor: '#E8F542' }} />
        </div>

        {/* Title */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '32px', fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
            CHALLENGE {callerHandle}
          </h2>
          <button
            onClick={onClose}
            style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '20px', padding: '4px' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Parent call read-only card */}
        <div
          style={{
            border: '2px solid #1E1E2E',
            backgroundColor: '#0D0D15',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontFamily: 'monospace', fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '6px' }}>
            CHALLENGING
          </div>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '14px', color: '#F1F5F9', margin: 0, lineHeight: 1.4 }}>
            {marketLine || `Call #${String(callId)}`}
          </p>
          <div style={{ marginTop: '6px', fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
            Caller stake: {formatUsdc(callerStake)}
          </div>
        </div>

        {/* YOUR STAKE input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#F1F5F9', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            YOUR STAKE
          </label>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              border: `2px solid ${stakeError ? '#F87171' : (stakeInput && !stakeError ? '#E8F542' : '#2E2E42')}`,
              backgroundColor: '#09090E',
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
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
                color: '#F1F5F9',
                padding: '12px 14px',
              }}
              placeholder="100.00"
            />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#64748B', padding: '0 14px' }}>
              USDC
            </span>
          </div>
          {stakeError && (
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171' }}>
              {stakeError}
            </span>
          )}
          <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748B' }}>
            Pre-filled: matches {callerHandle}&apos;s stake of {formatUsdc(callerStake)}
          </span>

          {/* Quick-stake buttons */}
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
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#94A3B8',
                  backgroundColor: 'transparent',
                  border: '1px solid #2E2E42',
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
          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171', border: '1px solid #F87171', padding: '8px 12px' }}>
            Insufficient USDC balance — you need {formatUsdc(stakeValue - currentBalance)} more
          </div>
        )}

        {/* POT IF ACCEPTED */}
        <div style={{ borderTop: '1px solid #1E1E2E', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#F1F5F9', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            POT IF ACCEPTED
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>
            {stakeValue !== null ? formatUsdc(potIfAccepted) : '—'} · winner takes all
          </div>
          {isAsymmetric && stakeValue !== null && (
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
              Asymmetric duel — pot: {formatUsdc(potIfAccepted)}; overage returned to you at settlement
            </div>
          )}
        </div>

        {/* USDC approval preflight (T-3-06-06) */}
        {needsApproval && stakeValue !== null && !insufficientBalance && (
          <div style={{ border: '1px solid #2E2E42', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
              Approve USDC first — allow {formatUsdc(stakeValue)} to ChallengeEscrow
            </span>
            <button
              onClick={() => void handleApprove()}
              disabled={approving || approveConfirming}
              style={{
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: '#09090E',
                backgroundColor: approving || approveConfirming ? '#2E2E42' : '#E8F542',
                border: '2px solid #09090E',
                boxShadow: approving || approveConfirming ? 'none' : '4px 4px 0 #09090E',
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
          <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', border: '1px solid #2E2E42', padding: '10px' }}>
            ChallengeEscrow not yet deployed — challenges available after operator deploy (03-03)
          </div>
        )}

        {/* Action row — flexWrap + per-button minWidth so the row stays side-by-side
            on the 480px desktop panel but stacks full-width when the panel clamps to
            calc(100vw - 32px) on a 375px phone (D-04). Intrinsic — no JS viewport read. */}
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
          {/* Keep call open — cancel */}
          <button
            onClick={onClose}
            style={{
              flex: '1 1 160px',
              minWidth: '160px',
              minHeight: '44px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              fontWeight: 700,
              color: '#64748B',
              backgroundColor: 'transparent',
              border: '2px solid #2E2E42',
              padding: '14px 16px',
              cursor: 'pointer',
            }}
          >
            Keep call open
          </button>
          {/* Send Challenge */}
          <button
            onClick={() => void handleSendChallenge()}
            disabled={!canSend}
            style={{
              flex: '2 1 200px',
              minWidth: '200px',
              minHeight: '44px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              fontWeight: 700,
              color: canSend ? '#09090E' : '#64748B',
              backgroundColor: canSend ? '#E8F542' : '#2E2E42',
              border: `3px solid ${canSend ? '#09090E' : '#2E2E42'}`,
              boxShadow: canSend ? '4px 4px 0 #09090E' : 'none',
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
